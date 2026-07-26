import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RevenueMonthPoint } from '../../core/models/report.model';

const MONTH_LABELS = [
  'Jan',
  'Fév',
  'Mar',
  'Avr',
  'Mai',
  'Juin',
  'Juil',
  'Août',
  'Sep',
  'Oct',
  'Nov',
  'Déc',
];

const EUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

interface Bar {
  monthLabel: string;
  amountLabel: string;
  heightPercent: number;
  x: number;
}

// A small owned SVG primitive, same "small owned UI primitives over a
// dependency" precedent as the tour engine (Phase 8) and manual-mode resize
// handles (Phase 9.5) — no charting library added for what's ultimately one
// bar chart. Bars use the app's primary semantic color (design-system.md),
// same accent as every other "main action/figure" in the app.
@Component({
  selector: 'app-revenue-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.viewBox]="'0 0 ' + chartWidth() + ' 140'"
      class="h-40 w-full"
      role="img"
      [attr.aria-label]="ariaLabel()"
      preserveAspectRatio="none"
    >
      @for (bar of bars(); track bar.x) {
        <rect
          [attr.x]="bar.x"
          [attr.y]="100 - bar.heightPercent"
          [attr.width]="barWidth"
          [attr.height]="bar.heightPercent"
          rx="2"
          class="fill-primary"
        >
          <title>{{ bar.monthLabel }} — {{ bar.amountLabel }}</title>
        </rect>
        <text
          [attr.x]="bar.x + barWidth / 2"
          y="118"
          text-anchor="middle"
          font-size="9"
          class="fill-current text-ink-soft"
        >
          {{ bar.monthLabel }}
        </text>
      }
    </svg>
  `,
})
export class RevenueBarChartComponent {
  readonly points = input.required<RevenueMonthPoint[]>();

  protected readonly barWidth = 18;
  private readonly gap = 8;

  protected readonly chartWidth = computed(
    () => this.points().length * (this.barWidth + this.gap) + this.gap,
  );

  protected readonly bars = computed<Bar[]>(() => {
    const points = this.points();
    const max = Math.max(1, ...points.map((point) => point.totalExclVatCents));
    return points.map((point, index) => ({
      monthLabel: monthLabel(point.month),
      amountLabel: EUR.format(point.totalExclVatCents / 100),
      heightPercent: (point.totalExclVatCents / max) * 100,
      x: this.gap + index * (this.barWidth + this.gap),
    }));
  });

  protected readonly ariaLabel = computed(
    () =>
      `Chiffre d'affaires encaissé par mois : ${this.bars()
        .map((bar) => `${bar.monthLabel} ${bar.amountLabel}`)
        .join(', ')}`,
  );
}

function monthLabel(month: string): string {
  const [, monthNumber] = month.split('-');
  return MONTH_LABELS[Number(monthNumber) - 1] ?? month;
}
