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

  protected readonly progressPercent = computed(() => {
    const count = this.tourService.stepCount();
    return count === 0 ? 0 : ((this.tourService.stepIndex() + 1) / count) * 100;
  });

  constructor() {
    // Re-measure the target every time the current step changes — covers
    // both a new anchorId and the anchor-less centered steps (null rect).
    effect(() => {
      this.tourService.currentStep();
      this.recomputeTargetRect();
    });
  }

  @HostListener('window:resize')
  @HostListener('window:scroll')
  protected onViewportChange(): void {
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
