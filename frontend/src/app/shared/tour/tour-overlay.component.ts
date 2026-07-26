import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { TourAnchorRegistryService } from './tour-anchor-registry.service';
import { computeCornerPosition, computePopoverPosition, TourSize } from './tour-position.util';
import { TourService } from './tour.service';

// Rough, fixed estimate of the popover's footprint — good enough for
// clamped positioning without measuring the real rendered element, since a
// few px of slack is invisible on a spotlight overlay like this one.
const POPOVER_ESTIMATE: TourSize = { width: 320, height: 220 };

// Padding around the real target rect, and a floor under its own width/
// height — a small icon-only button (or an anchor whose rect briefly
// measures as near-zero mid-transition) would otherwise get a highlight
// ring too tight to read as "this thing" at a glance. Erring generous here
// is deliberate: a spotlight a few px too big just looks like breathing
// room, while one that's too small (or clipped) reads as flat-out wrong.
const SPOTLIGHT_PADDING = 14;
const SPOTLIGHT_MIN_SIZE = 48;

// How long after a step change to keep re-measuring the target every frame.
// scrollIntoView({behavior:'smooth'}) and CSS transitions (e.g. the
// lines-step flyouts sliding open) both keep moving the target well after
// the first synchronous measurement, and neither reliably fires a 'scroll'
// event on window (a container scrolling internally never does — see
// onViewportChange) — polling for a bounded window is what converges the
// spotlight on the real, settled position regardless of which of those
// caused the movement, instead of freezing on a stale rect that can end up
// anywhere, including off-screen.
const SETTLE_DURATION_MS = 600;

// Phase 8 onboarding tour: the overlay itself. Renders only while
// TourService has an active step — an SVG mask "spotlights" the current
// anchor (or just dims the screen for a centered welcome/completion step)
// and a popover card carries the copy, progress, and navigation buttons.
@Component({
  selector: 'app-tour-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tour-overlay.component.html',
})
export class TourOverlayComponent {
  protected readonly tourService = inject(TourService);
  private readonly anchorRegistry = inject(TourAnchorRegistryService);
  private readonly destroyRef = inject(DestroyRef);
  // Removes the current step's advanceOn listener(s) (see
  // bindAdvanceListener) — re-bound on every step change so a stale listener
  // from a previous step can never fire next() twice.
  private advanceListenerCleanup: (() => void) | null = null;
  // The current settle-loop's rAF handle (see keepMeasuringWhileSettling) —
  // cancelled and restarted on every step change so two overlapping loops
  // can never fight over targetRect.
  private settleRafHandle: number | null = null;

  protected readonly targetRect = signal<DOMRect | null>(null);

  protected readonly popoverPosition = computed(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    if (this.tourService.currentStep()?.popoverPlacement === 'corner') {
      return computeCornerPosition(POPOVER_ESTIMATE, viewport);
    }
    return computePopoverPosition(this.targetRect(), POPOVER_ESTIMATE, viewport);
  });

  // The dimmed backdrop as a single evenodd path (full-viewport rect minus
  // the spotlight rect) instead of a <rect>+<mask> pair — this is what lets
  // clicks reach the real page underneath the spotlight (see the template):
  // SVG's default `pointer-events: visiblePainted` only reacts where the
  // shape is actually painted, and the punched-out hole never is. A mask
  // only affects rendering, not hit-testing, so it couldn't do this alone.
  protected readonly spotlightPathD = computed(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const outer = `M0,0 H${viewportWidth} V${viewportHeight} H0 Z`;
    const rect = this.targetRect();
    if (!rect) {
      return outer;
    }
    const width = Math.max(rect.width, SPOTLIGHT_MIN_SIZE) + SPOTLIGHT_PADDING * 2;
    const height = Math.max(rect.height, SPOTLIGHT_MIN_SIZE) + SPOTLIGHT_PADDING * 2;
    const x = rect.left + rect.width / 2 - width / 2;
    const y = rect.top + rect.height / 2 - height / 2;
    const inner = `M${x},${y} H${x + width} V${y + height} H${x} Z`;
    return `${outer} ${inner}`;
  });

  protected readonly progressPercent = computed(() => {
    const count = this.tourService.stepCount();
    return count === 0 ? 0 : ((this.tourService.stepIndex() + 1) / count) * 100;
  });

  // The one documented "reward" moment (docs/design-system.md) — the tour's
  // own last step, or any earlier step explicitly marked `celebrate` (a
  // first client/product/prestation/document actually landing in the
  // database — see tour-definitions.ts).
  protected readonly isCelebrating = computed(
    () => this.tourService.isLastStep() || !!this.tourService.currentStep()?.celebrate,
  );

  // The popover card is never recreated between steps (the `@if` around it
  // stays true for the whole tour), so a static animation class would only
  // ever play once. Toggling it off then back on — same pattern as
  // InvoiceTotalsSummaryComponent's totalPulse — is what makes docs/design-
  // system.md's "directional slide + fade between steps" actually replay on
  // every step change.
  protected readonly stepAnimating = signal(true);

  constructor() {
    // Re-measure the target every time the current step changes — covers
    // both a new anchorId and the anchor-less centered steps (null rect).
    // Also scrolls the anchor into view: on a long page the spotlighted
    // element can otherwise sit off-screen with nothing telling the artisan
    // where to look.
    effect(() => {
      this.tourService.currentStep();
      this.scrollToCurrentAnchorAndMeasure();
      this.bindAdvanceListener();
      this.stepAnimating.set(false);
      queueMicrotask(() => this.stepAnimating.set(true));
    });

    this.destroyRef.onDestroy(() => {
      this.advanceListenerCleanup?.();
      if (this.settleRafHandle !== null) {
        cancelAnimationFrame(this.settleRafHandle);
      }
    });
  }

  @HostListener('window:resize')
  @HostListener('window:scroll')
  protected onViewportChange(): void {
    this.recomputeTargetRect();
  }

  // scrollIntoView with `behavior: 'smooth'` doesn't resolve when the scroll
  // finishes, so this only measures the pre-scroll position — the
  // window:scroll listener above fires throughout the animation and keeps
  // re-measuring, converging on the right rect by the time it settles. Same
  // "good enough without precise measurement" spirit as POPOVER_ESTIMATE.
  private scrollToCurrentAnchorAndMeasure(): void {
    const anchorId = this.tourService.currentStep()?.anchorId;
    const element = anchorId ? this.anchorRegistry.get(anchorId)?.nativeElement : undefined;
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    this.recomputeTargetRect();
    this.keepMeasuringWhileSettling();
  }

  // Re-measures every frame for SETTLE_DURATION_MS — see the constant's own
  // comment for why neither the initial measurement nor the window scroll/
  // resize listeners alone are enough to converge on the anchor's real,
  // settled position.
  private keepMeasuringWhileSettling(): void {
    if (this.settleRafHandle !== null) {
      cancelAnimationFrame(this.settleRafHandle);
    }
    const deadline = performance.now() + SETTLE_DURATION_MS;
    const tick = (): void => {
      this.recomputeTargetRect();
      this.settleRafHandle = performance.now() < deadline ? requestAnimationFrame(tick) : null;
    };
    this.settleRafHandle = requestAnimationFrame(tick);
  }

  // "The tour doesn't respond when I click the highlighted thing" — a step
  // declaring `advanceOn` (see TourStepDefinition) gets a one-shot listener
  // on its own anchor (and any altAnchorIds — see 'add-line' in
  // tour-definitions.ts, where either of two buttons should carry the tour
  // forward) that calls next() itself, so actually doing the thing the step
  // describes (clicking a button, typing into a search field) is what
  // carries the tour forward, same as it would feel to a first-time user who
  // has no idea "Suivant" is a separate button they also need to press.
  // Passing the anchor id that actually fired lets TourService's
  // nextByAnchor pick a different next step depending on which one it was.
  // Re-bound on every step change; { once: true } means a step the artisan
  // advances via "Suivant" instead just leaves these listeners unfired,
  // harmlessly torn down on the next bindAdvanceListener() call.
  private bindAdvanceListener(): void {
    this.advanceListenerCleanup?.();
    this.advanceListenerCleanup = null;

    const step = this.tourService.currentStep();
    const advanceOn = step?.advanceOn;
    if (!advanceOn || !step?.anchorId) {
      return;
    }
    const anchorIds = [step.anchorId, ...(step.altAnchorIds ?? [])];
    const cleanups: Array<() => void> = [];
    for (const anchorId of anchorIds) {
      const element = this.anchorRegistry.get(anchorId)?.nativeElement;
      if (!element) {
        continue;
      }
      const handler = (): void => this.tourService.next(anchorId);
      element.addEventListener(advanceOn, handler, { once: true });
      cleanups.push(() => element.removeEventListener(advanceOn, handler));
    }
    if (cleanups.length > 0) {
      this.advanceListenerCleanup = () => cleanups.forEach((cleanup) => cleanup());
    }
  }

  private recomputeTargetRect(): void {
    const anchorId = this.tourService.currentStep()?.anchorId;
    if (!anchorId) {
      this.targetRect.set(null);
      return;
    }
    const element = this.anchorRegistry.get(anchorId)?.nativeElement;
    this.targetRect.set(element ? element.getBoundingClientRect() : null);
  }
}
