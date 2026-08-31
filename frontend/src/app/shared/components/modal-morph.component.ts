import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  ViewChild,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  FlipRect,
  playModalMorphClose,
  playModalMorphOpen,
  prefersReducedMotion,
  shrinkRectForFallback,
} from '../utils/flip-morph';
import { LastClickOriginService } from '../utils/last-click-origin.service';

// docs/front/front-1-global-shell-and-overlays.md's `modalMorph`: a shared
// presentational wrapper every modal component adopts instead of each
// reimplementing the same open/close choreography. Purely reactive to
// `open` — callers don't change how/when they flip that input (backdrop
// click, an "X" button, Escape, a parent-owned isOpen() computed all still
// work exactly as before), they just wrap their existing panel markup in
// this component instead of a raw `@if` + backdrop `<div>`.
//
// The panel stays mounted (`visible`) for the whole close animation before
// this component actually removes it — Angular's `@if` has no built-in
// "delay removal until an animation finishes" concept (this app doesn't use
// @angular/animations), so that lag is tracked explicitly via `state`
// rather than derived from `open` directly.
type MorphState = 'closed' | 'opening' | 'open' | 'closing';

@Component({
  selector: 'app-modal-morph',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './modal-morph.component.html',
})
export class ModalMorphComponent {
  private readonly lastClickOrigin = inject(LastClickOriginService);
  private readonly injector = inject(Injector);

  readonly open = input.required<boolean>();
  readonly ariaLabel = input<string | undefined>(undefined);
  readonly panelClass = input('');
  readonly backdropClose = output<void>();

  @ViewChild('panel') private readonly panelRef?: ElementRef<HTMLElement>;

  // `visible` mounts/unmounts the backdrop+panel; `contentVisible` hides the
  // projected content specifically, so the panel keeps its real, measurable
  // layout size the whole time (needed for the FLIP math) while what's
  // inside stays masked until the open animation is done — see the doc's
  // "content never distorts" rule.
  protected readonly visible = signal(false);
  protected readonly contentVisible = signal(false);

  private state: MorphState = 'closed';
  private currentAnimation: Animation | null = null;
  private lastOpenOrigin: FlipRect | null = null;

  constructor() {
    effect(() => {
      if (this.open()) {
        this.handleOpen();
      } else {
        this.handleClose();
      }
    });
  }

  private handleOpen(): void {
    if (this.state === 'open' || this.state === 'opening') {
      return;
    }
    const reopening = this.state === 'closing';
    this.state = 'opening';
    this.visible.set(true);

    if (prefersReducedMotion()) {
      this.state = 'open';
      this.contentVisible.set(true);
      return;
    }

    // Reopening mid-close reuses the same origin it was already closing
    // towards, so the reversal reads as one continuous motion rather than
    // jumping to a freshly-captured (and by now likely wrong) click.
    const capturedOrigin = reopening
      ? this.lastOpenOrigin
      : this.lastClickOrigin.consumeRecentOrigin();

    this.currentAnimation?.cancel();
    afterNextRender(
      {
        mixedReadWrite: () => {
          if (this.state !== 'opening') {
            return; // superseded by another close/open before this frame ran
          }
          const panel = this.panelRef?.nativeElement;
          if (!panel) {
            this.state = 'open';
            this.contentVisible.set(true);
            return;
          }
          const origin = capturedOrigin ?? shrinkRectForFallback(panel.getBoundingClientRect());
          this.lastOpenOrigin = origin;
          const animation = playModalMorphOpen(panel, origin);
          this.currentAnimation = animation;
          animation.finished
            .then(() => {
              if (this.state === 'opening') {
                this.state = 'open';
                this.contentVisible.set(true);
              }
            })
            .catch(() => {
              // cancelled by a subsequent close — handleClose owns the outcome
            });
        },
      },
      { injector: this.injector },
    );
  }

  private handleClose(): void {
    if (this.state === 'closed' || this.state === 'closing') {
      return;
    }
    this.state = 'closing';
    this.contentVisible.set(false);

    const panel = this.panelRef?.nativeElement;
    if (prefersReducedMotion() || !panel) {
      this.state = 'closed';
      this.visible.set(false);
      return;
    }

    this.currentAnimation?.cancel();
    const target = this.lastOpenOrigin ?? shrinkRectForFallback(panel.getBoundingClientRect());
    const animation = playModalMorphClose(panel, target);
    this.currentAnimation = animation;
    animation.finished
      .then(() => {
        if (this.state === 'closing') {
          this.state = 'closed';
          this.visible.set(false);
        }
      })
      .catch(() => {
        // cancelled by a subsequent open — handleOpen owns the outcome
      });
  }
}
