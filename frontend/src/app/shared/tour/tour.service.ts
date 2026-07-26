import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { catchError, filter, firstValueFrom, Observable, of, tap } from 'rxjs';
import { OnboardingState, TourId } from '../../core/models/onboarding.model';
import { CustomerService } from '../../core/services/customer.service';
import { OnboardingService } from '../../core/services/onboarding.service';
import { ProductService } from '../../core/services/product.service';
import { ServiceCatalogService } from '../../core/services/service-catalog.service';
import { TourAnchorRegistryService } from './tour-anchor-registry.service';
import { TOUR_DEFINITIONS, TourStepCondition, TourStepDefinition } from './tour-definitions';

// Which route prefix auto-launches which mini-tour, first match wins — the
// Phase 9.5 mode-manuel prefix must come before the general
// '/factures/nouvelle' one, or it would never be reached.
const ROUTE_TOUR_MAP: ReadonlyArray<{ prefix: string; tourId: TourId }> = [
  { prefix: '/factures/nouvelle/manuel', tourId: 'invoice-creation-manual' },
  { prefix: '/factures/nouvelle', tourId: 'invoice-creation' },
  { prefix: '/produits', tourId: 'catalog' },
  { prefix: '/prestations', tourId: 'catalog' },
  { prefix: '/clients', tourId: 'customers' },
  { prefix: '/statistiques', tourId: 'stats-reports' },
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
  // Used by evaluateShowIf, via each service's getAllCached() — safe to
  // fetch on demand from here (unlike OnboardingService's own eager
  // constructor-time load, Phase 14.7's bug #1) because a showIf-gated step
  // is only ever reached while the tour is already active on one of
  // /clients, /produits, /prestations or the invoice-creation flow, all
  // auth-gated routes. getAllCached() also means this is at worst one extra
  // GET per gated step reached, not one per tour-service construction: the
  // customer/product/service-list pages don't call it themselves (they load
  // their own filtered view directly), but Product/Service/CustomerService
  // create()/update() keep the SAME cache in sync (upsertInCache) — so the
  // one lazy load here is also what a "return to the list after saving"
  // celebration step (see 'produit-celebrate' etc. in tour-definitions.ts)
  // ends up reading back, already fresh, with no second request.
  private readonly customerService = inject(CustomerService);
  private readonly productService = inject(ProductService);
  private readonly serviceCatalogService = inject(ServiceCatalogService);

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

  // Returns the request rather than subscribing internally, so the settings
  // page (its only caller) can surface success/failure to the artisan —
  // this used to subscribe here with no `error` handler, which both
  // swallowed failures and left the caller no way to know the toggle didn't
  // actually persist.
  setTourEnabled(tourEnabled: boolean): Observable<OnboardingState> {
    return this.onboardingService
      .setTourEnabled(tourEnabled)
      .pipe(tap((state) => this.state.set(state)));
  }

  // Backs the settings page's "Rejouer les visites guidées" button: clears
  // every tour's completed state so the next visit to each section
  // auto-launches it again, exactly like a brand new install. Same
  // caller-subscribes reasoning as setTourEnabled above.
  replayTours(): Observable<OnboardingState> {
    return this.onboardingService.resetTours().pipe(tap((state) => this.state.set(state)));
  }

  // `firedAnchorId` is only passed by TourOverlayComponent's advanceOn
  // listener (see bindAdvanceListener) — it identifies which of a step's
  // anchorId/altAnchorIds actually got clicked/typed into, so a step
  // offering several ways forward (see 'add-line' in tour-definitions.ts)
  // can send the tour down a different branch depending on which one it
  // was. The plain "Suivant" button never passes one, and falls back to the
  // step's own `next` (or the next array index) the same way a step with
  // only one anchor always has.
  next(firedAnchorId?: string): void {
    if (!this.activeTourId() || this.advancing()) {
      return;
    }
    if (this.isLastStep()) {
      this.persistCompletion();
      return;
    }
    void this.advanceToStep(this.resolveNextIndex(firedAnchorId));
  }

  private resolveNextIndex(firedAnchorId?: string): number {
    const current = this.currentStep();
    const targetId = (firedAnchorId && current?.nextByAnchor?.[firedAnchorId]) || current?.next;
    if (targetId) {
      const index = this.steps().findIndex((step) => step.id === targetId);
      if (index !== -1) {
        return index;
      }
    }
    return this.stepIndex() + 1;
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
  // currently is, for one whose declared route matches where a real
  // (non-tour-driven) navigation just landed. Forward-only on purpose: a
  // step with no `route` of its own shares the previous step's, so this
  // only ever matches a genuine route-transition step, and never jumps
  // backward on a browser-back navigation.
  //
  // A step whose declared route carries its own query string (e.g.
  // 'stats-reports''s '/statistiques?vue=rapport') is matched exactly,
  // since that query string is the whole point of that step. Every other
  // step is matched on pathname alone, ignoring the incoming URL's query —
  // real links the artisan can click mid-tour legitimately carry query
  // params no step declares (e.g. the mode-choice page's "Mode rapide"/
  // "Mode manuel" cards append `?type=FACTURE|DEVIS`, read once by the
  // draft store). Requiring an exact string match here used to treat that
  // as "left the flow" and silently abandon the tour the instant it landed
  // on the very page the tour was pointing at — the "tour stops on the
  // client-choice page" bug.
  private findForwardStepIndexForRoute(url: string): number | null {
    const steps = this.steps();
    const pathname = url.split('?')[0];
    for (let index = this.stepIndex(); index < steps.length; index++) {
      const route = steps[index].route;
      if (!route) {
        continue;
      }
      if (route.includes('?') ? route === url : route === pathname) {
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
      if (step.showIf && !(await this.evaluateShowIf(step.showIf))) {
        await this.advanceToStep(index + 1);
        return;
      }
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

  // On a failed fetch, every condition resolves to false — both the
  // "empty" and "non-empty" alternative for that moment get skipped rather
  // than risk showing the wrong one (see tour-definitions.ts's showIf docs).
  private async evaluateShowIf(condition: TourStepCondition): Promise<boolean> {
    switch (condition) {
      case 'noCustomers':
      case 'hasCustomers': {
        const count = await this.countFrom(this.customerService.getAllCached());
        return condition === 'hasCustomers' ? count > 0 : count === 0;
      }
      case 'noProducts':
      case 'hasProducts': {
        const count = await this.countFrom(this.productService.getAllCached());
        return condition === 'hasProducts' ? count > 0 : count === 0;
      }
      case 'noServices':
      case 'hasServices': {
        const count = await this.countFrom(this.serviceCatalogService.getAllCached());
        return condition === 'hasServices' ? count > 0 : count === 0;
      }
    }
  }

  private countFrom(source$: Observable<unknown[]>): Promise<number> {
    return firstValueFrom(source$.pipe(catchError(() => of<unknown[]>([])))).then(
      (list) => list.length,
    );
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
