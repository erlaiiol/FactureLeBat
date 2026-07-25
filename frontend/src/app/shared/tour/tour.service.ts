import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { OnboardingState, TourId } from '../../core/models/onboarding.model';
import { OnboardingService } from '../../core/services/onboarding.service';
import { TourAnchorRegistryService } from './tour-anchor-registry.service';
import { TOUR_DEFINITIONS, TourStepDefinition } from './tour-definitions';

// Which route prefix auto-launches which mini-tour, first match wins — the
// Phase 9.5 mode-manuel prefix must come before the general
// '/factures/nouvelle' one, or it would never be reached.
const ROUTE_TOUR_MAP: ReadonlyArray<{ prefix: string; tourId: TourId }> = [
  { prefix: '/factures/nouvelle/manuel', tourId: 'invoice-creation-manual' },
  { prefix: '/factures/nouvelle', tourId: 'invoice-creation' },
  { prefix: '/produits', tourId: 'catalog' },
  { prefix: '/prestations', tourId: 'catalog' },
  { prefix: '/clients', tourId: 'customers' },
];

const ANCHOR_WAIT_TIMEOUT_MS = 2000;
const ANCHOR_POLL_INTERVAL_MS = 50;

// Phase 8 onboarding tour: orchestrates the three mini-tours declared in
// tour-definitions.ts. Loaded once (providedIn: 'root'), same "shared,
// constructed-once state" pattern as InvoiceDraftStore — TourOverlayComponent
// and the settings page just read/react to its signals rather than owning
// any of this state themselves.
@Injectable({ providedIn: 'root' })
export class TourService {
  private readonly onboardingService = inject(OnboardingService);
  private readonly anchorRegistry = inject(TourAnchorRegistryService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly state = signal<OnboardingState | null>(null);
  // Guards against overlapping advanceToStep() calls — without it, holding
  // or double-tapping "Suivant" while a route navigation/anchor-wait is
  // still in flight fires a second navigateByUrl before the first settles.
  readonly advancing = signal(false);
  // Set only around a navigateByUrl the tour itself triggers (step-to-step
  // transitions), so the NavigationEnd listener below can tell that apart
  // from the artisan navigating away some other way (sidebar link, back
  // button) mid-tour.
  private selfNavigating = false;

  readonly tourEnabled = computed(() => this.state()?.tourEnabled ?? true);
  readonly activeTourId = signal<TourId | null>(null);
  readonly stepIndex = signal(0);
  // Which tour (if any) the CURRENT route owns, kept in sync on every
  // navigation — lets the nav bar's help button show/hide itself and know
  // what to replay, without duplicating ROUTE_TOUR_MAP anywhere else.
  readonly currentRouteTourId = signal<TourId | null>(null);

  readonly steps = computed<TourStepDefinition[]>(() => {
    const tourId = this.activeTourId();
    return tourId ? TOUR_DEFINITIONS[tourId].steps : [];
  });
  readonly stepCount = computed(() => this.steps().length);
  readonly currentStep = computed<TourStepDefinition | null>(
    () => this.steps()[this.stepIndex()] ?? null,
  );
  readonly isLastStep = computed(() => this.stepIndex() === this.stepCount() - 1);

  constructor() {
    // Best-effort load, same reasoning as InvoiceDraftStore's company/customers
    // loads: a failure here just means the tour never auto-launches, it never
    // blocks the rest of the app. TourService is constructed app-wide (see
    // App's root component), including on public routes where an anonymous
    // visitor 401s on this call — an explicit no-op `error` handler is what
    // keeps that a silent no-auto-launch rather than an unhandled rejection
    // (see docs/roadmap.md Phase 14.7's bug #1).
    this.onboardingService
      .getState()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (state) => this.state.set(state), error: () => {} });

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => {
        const url = event.urlAfterRedirects;
        this.currentRouteTourId.set(
          ROUTE_TOUR_MAP.find((entry) => url.startsWith(entry.prefix))?.tourId ?? null,
        );

        // A real navigation the tour didn't script itself — the artisan
        // clicked the very thing a step was pointing at (a client card, a
        // mode-choice card…) rather than the tour's own "Suivant". If that
        // landed exactly where an upcoming step of THIS SAME tour expects
        // to be, that counts as having completed the step through the real
        // UI — jump the tour there instead of dropping it and restarting
        // from the welcome screen a beat later, which used to be the "the
        // tour doesn't respond to my click" glitch.
        let quietlyStoppedTourId: TourId | null = null;
        if (this.activeTourId() && !this.selfNavigating) {
          const matchedIndex = this.findForwardStepIndexForRoute(url);
          if (matchedIndex != null) {
            void this.advanceToStep(matchedIndex);
          } else {
            // Genuinely left the flow (sidebar link, browser back, or a
            // route the tour never anticipated, e.g. "+ Nouveau produit"
            // opening the create-product form). Drop it — but remember
            // which tour, so the auto-start check right below doesn't
            // immediately relaunch the very tour that was just dropped:
            // without this, clicking a real "+ Nouveau X" button flashed
            // the whole tour back to its own welcome step on the next
            // page, which is the other half of that same glitch.
            quietlyStoppedTourId = this.activeTourId();
            this.abandonActiveTour();
          }
        }
        this.maybeAutoStart(url, quietlyStoppedTourId);
      });
  }

  setTourEnabled(tourEnabled: boolean): void {
    this.onboardingService
      .setTourEnabled(tourEnabled)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (state) => this.state.set(state) });
  }

  // Backs the settings page's "Rejouer les visites guidées" button: clears
  // every tour's completed state so the next visit to each section
  // auto-launches it again, exactly like a brand new install.
  replayTours(): void {
    this.onboardingService
      .resetTours()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (state) => this.state.set(state) });
  }

  next(): void {
    if (!this.activeTourId() || this.advancing()) {
      return;
    }
    if (this.isLastStep()) {
      this.persistCompletion();
      return;
    }
    void this.advanceToStep(this.stepIndex() + 1);
  }

  skip(): void {
    if (this.advancing()) {
      return;
    }
    this.persistCompletion();
  }

  // Backs the nav bar's "Aide" button: manually (re)launches whichever tour
  // owns the current route, from the top, regardless of tourEnabled or
  // completedTours — asking for help should always work, independent of
  // the "don't auto-show this again" preference Settings controls.
  startTourForCurrentRoute(): void {
    const tourId = this.currentRouteTourId();
    if (!tourId) {
      return;
    }
    this.activeTourId.set(tourId);
    void this.advanceToStep(0);
  }

  private maybeAutoStart(url: string, skipTourId: TourId | null = null): void {
    if (this.activeTourId() || !this.tourEnabled()) {
      return;
    }
    const tourId = ROUTE_TOUR_MAP.find((entry) => url.startsWith(entry.prefix))?.tourId ?? null;
    if (!tourId || tourId === skipTourId || this.state()?.completedTours.includes(tourId)) {
      return;
    }
    this.activeTourId.set(tourId);
    void this.advanceToStep(0);
  }

  // Searches the active tour's OWN steps, forward from wherever it
  // currently is, for one whose declared route exactly matches where a
  // real (non-tour-driven) navigation just landed. Forward-only and
  // exact-match on purpose: a step with no `route` of its own shares the
  // previous step's, so this only ever matches a genuine route-transition
  // step, and never jumps backward on a browser-back navigation.
  private findForwardStepIndexForRoute(url: string): number | null {
    const steps = this.steps();
    for (let index = this.stepIndex(); index < steps.length; index++) {
      if (steps[index].route === url) {
        return index;
      }
    }
    return null;
  }

  // Navigates first if the target step lives on a different route, then
  // waits for its anchor to mount before revealing it — if the anchor never
  // shows up (timeout), the step is skipped rather than spotlighting nothing.
  private async advanceToStep(index: number): Promise<void> {
    this.advancing.set(true);
    try {
      const steps = this.steps();
      if (index >= steps.length) {
        this.persistCompletion();
        return;
      }
      const step = steps[index];
      if (step.route && step.route !== this.router.url) {
        this.selfNavigating = true;
        try {
          await this.router.navigateByUrl(step.route);
        } finally {
          this.selfNavigating = false;
        }
      }
      if (step.anchorId) {
        const found = await this.waitForAnchor(step.anchorId);
        if (!found) {
          await this.advanceToStep(index + 1);
          return;
        }
      }
      this.stepIndex.set(index);
    } finally {
      this.advancing.set(false);
    }
  }

  private waitForAnchor(anchorId: string): Promise<boolean> {
    if (this.anchorRegistry.get(anchorId)) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      let elapsed = 0;
      const timer = setInterval(() => {
        elapsed += ANCHOR_POLL_INTERVAL_MS;
        if (this.anchorRegistry.get(anchorId)) {
          clearInterval(timer);
          resolve(true);
        } else if (elapsed >= ANCHOR_WAIT_TIMEOUT_MS) {
          clearInterval(timer);
          resolve(false);
        }
      }, ANCHOR_POLL_INTERVAL_MS);
    });
  }

  // Unlike persistCompletion, this never marks the tour done — leaving early
  // through an unrelated navigation isn't a "seen it, don't show again"
  // signal, so the tour is still offered next time the artisan comes back.
  private abandonActiveTour(): void {
    this.activeTourId.set(null);
    this.stepIndex.set(0);
  }

  private persistCompletion(): void {
    const tourId = this.activeTourId();
    if (!tourId) {
      return;
    }
    this.activeTourId.set(null);
    this.stepIndex.set(0);
    this.onboardingService
      .completeTour(tourId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (state) => this.state.set(state) });
  }
}
