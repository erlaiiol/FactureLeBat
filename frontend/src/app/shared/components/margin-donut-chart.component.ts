import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MarginByEntry } from '../../core/models/report.model';

const EUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

// Phase 1.6: the five-slot categorical order validated in styles.css's
// --color-chart-1..5 comment (dataviz skill) — this fixed order is the
// CVD-safety mechanism, never reassigned per-render. A 6th distinct entry
// never reaches this component: ReportsService already caps every
// marginBy* list at TOP_ENTRIES_LIMIT (5).
const SLICE_STROKE_CLASSES = [
  'stroke-chart-1',
  'stroke-chart-2',
  'stroke-chart-3',
  'stroke-chart-4',
  'stroke-chart-5',
];
const LEGEND_DOT_CLASSES = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5'];

const RADIUS = 40;
const STROKE_WIDTH = 16;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
// A visible surface gap between adjacent slices (dataviz skill's mark
// spec) — shrinks each slice's visible arc length, not its share of the
// ring, so proportions stay accurate.
const GAP_LENGTH = 3;

interface Slice {
  label: string;
  amountLabel: string;
  percentLabel: string;
  strokeClass: string;
  dotClass: string;
  dasharray: string;
  dashoffset: number;
}

// A small owned SVG primitive, same "small owned UI primitive over a
// dependency" precedent as RevenueBarChartComponent — no charting library
// added for one donut. Renders as a ring (stroke-dasharray technique) with
// a legend that always carries the label + amount + share, so identity
// never depends on hue alone (dataviz skill's relief rule — this app's
// own chart-1..5 tokens WARN on light-surface contrast for two of the five
// slots). See docs/1.6/1.6-3-margin-stats-frontend.md.
@Component({
  selector: 'app-margin-donut-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (slices().length > 0) {
      <div class="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <svg
          viewBox="0 0 100 100"
          class="h-36 w-36 shrink-0"
          role="img"
          [attr.aria-label]="ariaLabel()"
        >
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            class="stroke-line"
            [attr.stroke-width]="strokeWidth"
          />
          <g transform="rotate(-90 50 50)">
            @for (slice of slices(); track slice.label) {
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke-linecap="round"
                [attr.stroke-width]="strokeWidth"
                [attr.stroke-dasharray]="slice.dasharray"
                [attr.stroke-dashoffset]="slice.dashoffset"
                [class]="slice.strokeClass"
              >
                <title>
                  {{ slice.label }} — {{ slice.amountLabel }} ({{ slice.percentLabel }})
                </title>
              </circle>
            }
          </g>
          <text
            x="50"
            y="47"
            text-anchor="middle"
            font-size="11"
            class="fill-current font-semibold text-ink"
          >
            {{ totalLabel() }}
          </text>
          <text x="50" y="60" text-anchor="middle" font-size="6" class="fill-current text-ink-soft">
            marge totale
          </text>
        </svg>
        <ul class="flex w-full min-w-0 flex-col gap-1.5 text-sm">
          @for (slice of slices(); track slice.label) {
            <li class="flex items-center justify-between gap-2">
              <span class="flex min-w-0 items-center gap-2">
                <span class="h-2.5 w-2.5 shrink-0 rounded-full {{ slice.dotClass }}"></span>
                <span class="truncate text-ink">{{ slice.label }}</span>
              </span>
              <span class="shrink-0 whitespace-nowrap text-ink-soft">
                {{ slice.amountLabel }} · {{ slice.percentLabel }}
              </span>
            </li>
          }
        </ul>
      </div>
    } @else {
      <p class="text-sm text-ink-soft">Aucune marge renseignée sur cette période.</p>
    }
  `,
})
export class MarginDonutChartComponent {
  readonly entries = input.required<MarginByEntry[]>();

  protected readonly strokeWidth = STROKE_WIDTH;

  protected readonly slices = computed<Slice[]>(() => {
    const entries = this.entries().filter((entry) => entry.marginExclVatCents > 0);
    const total = entries.reduce((sum, entry) => sum + entry.marginExclVatCents, 0);
    if (total <= 0) {
      return [];
    }
    let offset = 0;
    return entries.map((entry, index) => {
      const fraction = entry.marginExclVatCents / total;
      const fullLength = fraction * CIRCUMFERENCE;
      const visibleLength = Math.max(0, fullLength - GAP_LENGTH);
      const slice: Slice = {
        label: entry.label,
        amountLabel: EUR.format(entry.marginExclVatCents / 100),
        percentLabel: `${Math.round(fraction * 100)} %`,
        strokeClass: SLICE_STROKE_CLASSES[index % SLICE_STROKE_CLASSES.length],
        dotClass: LEGEND_DOT_CLASSES[index % LEGEND_DOT_CLASSES.length],
        dasharray: `${visibleLength} ${CIRCUMFERENCE - visibleLength}`,
        dashoffset: -offset,
      };
      offset += fullLength;
      return slice;
    });
  });

  protected readonly totalLabel = computed(() => {
    const total = this.entries().reduce((sum, entry) => sum + entry.marginExclVatCents, 0);
    return EUR.format(total / 100);
  });

  protected readonly ariaLabel = computed(
    () =>
      `Répartition de la marge : ${this.slices()
        .map((slice) => `${slice.label} ${slice.amountLabel}, ${slice.percentLabel}`)
        .join(', ')}`,
  );
}
