import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { catchError, filter, firstValueFrom, Observable, of, tap } from 'rxjs';
import { OnboardingState, TourId } from '../../core/models/onboarding.model';
import { AuthService } from '../../core/services/auth.service';
import { CatalogFolderService } from '../../core/services/catalog-folder.service';
import { CustomerService } from '../../core/services/customer.service';
import { DiscountService } from '../../core/services/discount.service';
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
  private readonly authService = inject(AuthService);
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
  // Phase 1.1-10: same on-demand getAllCached() reasoning as the three
  // services above — 'hasFolders'/'hasDiscounts' are only ever evaluated
  // while the tour is already active on an auth-gated catalog route. A
  // Pro+/Premium-locked company's 402 on catalog-folders is caught by
  // countFrom's own catchError → [], so 'hasFolders' just reads false for
  // them, same "nothing said about a feature they can't use" behavior as
  // every other showIf-gated step.
  private readonly catalogFolderService = inject(CatalogFolderService);
  private readonly discountService = inject(DiscountService);

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
  // The sign-up "Activer les tutoriels ?" prompt (TourOptInModalComponent):
  // shown instead of — and right before — the very first tour that would
  // auto-launch for an account that has never answered it
  // (OnboardingState.tourPreferenceChosen). Remembers which tour that was,
  // so answering "Oui" starts it straight away rather than on the next
  // navigation.
  readonly optInPromptVisible = signal(false);
  private optInPendingTourId: TourId | null = null;
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

  // Indices of steps this run jumped over (showIf false, anchor that never
  // mounted, a `next` jump past another branch). The "Étape X / Y" label
  // counts only the steps actually in play: with raw indices an artisan who
  // already has a client read "7 / 22" then "15 / 22" with nothing between.
  private readonly skippedIndices = signal<ReadonlySet<number>>(new Set());
  readonly displayStepNumber = computed(() => {
    const index = this.stepIndex();
    let skippedBefore = 0;
    for (const skipped of this.skippedIndices()) {
      if (skipped < index) {
        skippedBefore++;
      }
    }
    return index + 1 - skippedBefore;
  });
  readonly displayStepCount = computed(() => this.stepCount() - this.skippedIndices().size);

  // Steps revealed before the current one, so "Retour" can walk back over
  // exactly what the artisan saw (not the skipped ones).
  private history: number[] = [];
  readonly canGoBack = signal(false);
  private anchorWatchTimer: ReturnType<typeof setInterval> | null = null;
  private stepIsRevealed = false;

  constructor() {
    // Best-effort load, same reasoning as InvoiceDraftStore's company/customers
    // loads: a failure here just means the tour never auto-launches, it never
    // blocks the rest of the app. Keyed on the signed-in user rather than
    // fired once from this constructor: TourService is constructed app-wide
    // (see App's root component), including on public routes, so a one-shot
    // load used to 401 for an anonymous visitor (see docs/roadmap.md Phase
    // 14.7's bug #1) and then never retry once that visitor registered or
    // logged in — leaving a brand-new account with no state at all, which
    // the sign-up "Activer les tutoriels ?" prompt needs to read. Also
    // drops a previous account's state on logout/account switch.
    effect(() => {
      const userId = this.authService.currentUser()?.id ?? null;
      untracked(() => this.loadStateFor(userId));
    });

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

  // Answers the sign-up "Activer les tutoriels ?" prompt. Hidden right
  // away (optimistically) so the tour — or nothing — follows immediately; a
  // failed save just leaves the preference unanswered server-side, so the
  // prompt comes back next session rather than silently picking for them.
  answerOptInPrompt(enabled: boolean): void {
    const pendingTourId = this.optInPendingTourId;
    this.optInPendingTourId = null;
    this.optInPromptVisible.set(false);
    const current = this.state();
    if (current) {
      this.state.set({ ...current, tourEnabled: enabled, tourPreferenceChosen: true });
    }
    this.setTourEnabled(enabled)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => {} });
    if (enabled && pendingTourId && pendingTourId === this.currentRouteTourId()) {
      this.resetProgress();
      this.activeTourId.set(pendingTourId);
      void this.advanceToStep(0);
    }
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
    const step = this.currentStep();
    if (!firedAnchorId && step?.suivantClicksAnchor && step.anchorId) {
      const element = this.anchorRegistry.get(step.anchorId)?.nativeElement;
      if (element) {
        // The overlay's advanceOn listener on this element calls back into
        // next(anchorId), which picks the right branch.
        element.click();
        return;
      }
    }
    void this.advanceToStep(this.resolveNextIndex(firedAnchorId));
  }

  previous(): void {
    if (!this.activeTourId() || this.advancing()) {
      return;
    }
    const target = this.history.pop();
    this.canGoBack.set(this.history.length > 0);
    if (target !== undefined) {
      void this.advanceToStep(target, -1);
    }
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
    this.resetProgress();
    this.activeTourId.set(tourId);
    void this.advanceToStep(0);
  }

  private loadStateFor(userId: string | null): void {
    this.state.set(null);
    this.optInPromptVisible.set(false);
    this.optInPendingTourId = null;
    if (!userId) {
      return;
    }
    this.onboardingService
      .getState()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (state) => {
          this.state.set(state);
          // The navigation that brought the artisan here (e.g. straight
          // from sign-up into /factures/nouvelle) usually ends before this
          // response does — re-check it now rather than waiting for the
          // next one.
          this.maybeAutoStart(this.router.url);
        },
        error: () => {},
      });
  }

  private maybeAutoStart(url: string, skipTourId: TourId | null = null): void {
    // No state yet (still loading, or failed) means no auto-launch: without
    // it there's no telling whether this account still has to answer the
    // "Activer les tutoriels ?" prompt, or already finished this tour.
    const state = this.state();
    if (!state || this.activeTourId() || this.optInPromptVisible() || !state.tourEnabled) {
      return;
    }
    const tourId = ROUTE_TOUR_MAP.find((entry) => url.startsWith(entry.prefix))?.tourId ?? null;
    if (!tourId || tourId === skipTourId || state.completedTours.includes(tourId)) {
      return;
    }
    if (!state.tourPreferenceChosen) {
      this.optInPendingTourId = tourId;
      this.optInPromptVisible.set(true);
      return;
    }
    this.resetProgress();
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
  private async advanceToStep(index: number, direction: 1 | -1 = 1): Promise<void> {
    this.advancing.set(true);
    try {
      const steps = this.steps();
      if (index < 0) {
        return;
      }
      if (index >= steps.length) {
        this.persistCompletion();
        return;
      }
      const step = steps[index];
      if (step.showIf && !(await this.evaluateShowIf(step.showIf))) {
        await this.advanceToStep(index + direction, direction);
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
          await this.advanceToStep(index + direction, direction);
          return;
        }
      }
      this.recordReveal(index, direction);
      this.stepIndex.set(index);
      this.watchAdvanceAnchor(step);
    } finally {
      this.advancing.set(false);
    }
  }

  private recordReveal(index: number, direction: 1 | -1): void {
    const previous = this.stepIndex();
    if (direction === 1 && index > previous) {
      if (this.stepIsRevealed) {
        this.history.push(previous);
        this.canGoBack.set(true);
      }
      if (index > previous + 1) {
        const skipped = new Set(this.skippedIndices());
        for (let skippedIndex = previous + 1; skippedIndex < index; skippedIndex++) {
          skipped.add(skippedIndex);
        }
        this.skippedIndices.set(skipped);
      }
    }
    this.stepIsRevealed = true;
  }

  // For a step that waits on something appearing (a picked product turning
  // into a line with its quantity field) rather than a click on its own
  // anchor — see TourStepDefinition.advanceWhenAnchor.
  private watchAdvanceAnchor(step: TourStepDefinition): void {
    this.stopAnchorWatch();
    const watch = step.advanceWhenAnchor;
    if (!watch) {
      return;
    }
    this.anchorWatchTimer = setInterval(() => {
      if (!this.anchorRegistry.get(watch.anchorId) || this.advancing()) {
        return;
      }
      this.stopAnchorWatch();
      const index = this.steps().findIndex((candidate) => candidate.id === watch.next);
      if (index !== -1) {
        void this.advanceToStep(index);
      }
    }, ANCHOR_POLL_INTERVAL_MS * 3);
  }

  private stopAnchorWatch(): void {
    if (this.anchorWatchTimer !== null) {
      clearInterval(this.anchorWatchTimer);
      this.anchorWatchTimer = null;
    }
  }

  private resetProgress(): void {
    this.stopAnchorWatch();
    this.history = [];
    this.canGoBack.set(false);
    this.skippedIndices.set(new Set());
    this.stepIsRevealed = false;
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
      case 'noFolders':
      case 'hasFolders': {
        const count = await this.countFrom(this.catalogFolderService.getAllCached());
        return condition === 'hasFolders' ? count > 0 : count === 0;
      }
      case 'noDiscounts':
      case 'hasDiscounts': {
        const count = await this.countFrom(this.discountService.getAllCached());
        return condition === 'hasDiscounts' ? count > 0 : count === 0;
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
    this.resetProgress();
    this.activeTourId.set(null);
    this.stepIndex.set(0);
  }

  private persistCompletion(): void {
    const tourId = this.activeTourId();
    if (!tourId) {
      return;
    }
    this.resetProgress();
    this.activeTourId.set(null);
    this.stepIndex.set(0);
    this.onboardingService
      .completeTour(tourId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (state) => this.state.set(state) });
  }
}
