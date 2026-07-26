import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

// asyncReveal's placeholder for the "flat list of row cards" shape shared by
// customer-list/product-list/service-list — one generic component instead
// of the same pulsing-div markup copy-pasted across all three.
@Component({
  selector: 'app-skeleton-rows',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-3">
      @for (row of rowsArray(); track $index) {
        <div class="anim-skeleton h-[4.5rem] rounded-xl"></div>
      }
    </div>
  `,
})
export class SkeletonRowsComponent {
  readonly count = input(4);
  protected readonly rowsArray = computed(() => Array.from({ length: this.count() }));
}
