import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { TourAnchorRegistryService } from './tour-anchor-registry.service';
import { computePopoverPosition, TourSize } from './tour-position.util';
import { TourService } from './tour.service';

// Rough, fixed estimate of the popover's footprint — good enough for
// clamped positioning without measuring the real rendered element, since a
// few px of slack is invisible on a spotlight overlay like this one.
const POPOVER_ESTIMATE: TourSize = { width: 320, height: 220 };

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

  protected readonly targetRect = signal<DOMRect | null>(null);

  protected readonly popoverPosition = computed(() =>
    computePopoverPosition(this.targetRect(), POPOVER_ESTIMATE, {
      width: window.innerWidth,
      height: window.innerHeight,
    }),
  );

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
    const x = rect.left - 8;
    const y = rect.top - 8;
    const width = rect.width + 16;
    const height = rect.height + 16;
    const inner = `M${x},${y} H${x + width} V${y + height} H${x} Z`;
    return `${outer} ${inner}`;
  });

  protected readonly progressPercent = computed(() => {
    const count = this.tourService.stepCount();
    return count === 0 ? 0 : ((this.tourService.stepIndex() + 1) / count) * 100;
  });

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
      this.stepAnimating.set(false);
      queueMicrotask(() => this.stepAnimating.set(true));
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
