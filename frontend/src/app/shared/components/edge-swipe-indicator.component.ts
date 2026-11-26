import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { EdgeSwipeNavigationService } from '../../core/services/edge-swipe-navigation.service';

// The visual half of EdgeSwipeNavigationService — mounted once at the app
// root. A round chevron that slides in from the edge the finger started on,
// following it vertically, and fills with the primary color once releasing
// would navigate (same moment as the light haptic tick).
@Component({
  selector: 'app-edge-swipe-indicator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (drag(); as drag) {
      <div
        class="pointer-events-none fixed z-[60] flex h-11 w-11 items-center justify-center rounded-full border shadow-lg transition-colors duration-100"
        [class.left-0]="drag.side === 'left'"
        [class.right-0]="drag.side === 'right'"
        [class.bg-primary]="armed()"
        [class.text-primary-fg]="armed()"
        [class.border-primary]="armed()"
        [class.bg-surface]="!armed()"
        [class.text-ink]="!armed()"
        [class.border-line]="!armed()"
        [style.top.px]="drag.y - 22"
        [style.transform]="transform()"
        [style.opacity]="opacity()"
        aria-hidden="true"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          @if (drag.side === 'left') {
            <path d="M15 18l-6-6 6-6" />
          } @else {
            <path d="M9 18l6-6-6-6" />
          }
        </svg>
      </div>
    }
  `,
})
export class EdgeSwipeIndicatorComponent {
  private readonly edgeSwipe = inject(EdgeSwipeNavigationService);

  protected readonly drag = this.edgeSwipe.drag;
  protected readonly armed = computed(() => (this.drag()?.progress ?? 0) >= 1);

  // Hidden just past the edge at rest, 16px inside it once armed.
  protected readonly transform = computed(() => {
    const drag = this.drag();
    if (!drag) {
      return '';
    }
    const offset = -48 + Math.min(drag.progress, 1) * 64;
    return `translateX(${drag.side === 'left' ? offset : -offset}px)`;
  });

  protected readonly opacity = computed(() => Math.min(1, (this.drag()?.progress ?? 0) * 2));
}
