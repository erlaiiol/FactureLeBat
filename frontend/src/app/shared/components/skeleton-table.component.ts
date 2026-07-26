import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

// asyncReveal's placeholder for the admin table screens (admin-users,
// admin-promo-codes): a header bar plus `rows` pulsing rows inside the same
// rounded/bordered wrapper the real table uses, so the table's own final
// size is already occupied while the request is in flight.
@Component({
  selector: 'app-skeleton-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overflow-hidden rounded-2xl border border-line">
      <div class="h-10 bg-secondary-subtle"></div>
      <div class="flex flex-col gap-px bg-line">
        @for (row of rowsArray(); track $index) {
          <div class="anim-skeleton h-12 bg-surface"></div>
        }
      </div>
    </div>
  `,
})
export class SkeletonTableComponent {
  readonly rows = input(5);
  protected readonly rowsArray = computed(() => Array.from({ length: this.rows() }));
}
