import { ChangeDetectionStrategy, Component, effect, input, signal } from '@angular/core';
import { CentsToEurosPipe } from '../../../shared/pipes/cents-to-euros.pipe';
import { TotalsPreview } from '../calculation-preview';

const PULSE_DURATION_MS = 400;

@Component({
  selector: 'app-invoice-totals-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CentsToEurosPipe],
  template: `
    <div class="flex flex-col items-end gap-1 rounded-xl bg-secondary-subtle p-4">
      <div class="flex w-56 justify-between text-ink">
        <span>Sous-total HT</span>
        <span class="font-mono">{{ totals().subtotalExclVatCents | centsToEuros }}</span>
      </div>
      @if (vatApplicable()) {
        <div class="flex w-56 justify-between text-ink">
          <span>TVA</span>
          <span class="font-mono">{{ totals().vatAmountCents | centsToEuros }}</span>
        </div>
      } @else {
        <div class="w-56 text-right text-xs text-ink-soft">TVA non applicable</div>
      }
      <div class="flex w-56 justify-between text-lg font-bold text-ink">
        <span>Total TTC</span>
        <span class="font-mono" [class.anim-total-pulse]="pulsing()">
          {{ totals().totalInclVatCents | centsToEuros }}
        </span>
      </div>
    </div>
  `,
})
export class InvoiceTotalsSummaryComponent {
  readonly totals = input.required<TotalsPreview>();
  readonly vatApplicable = input.required<boolean>();

  protected readonly pulsing = signal(false);
  private previousTotalCents: number | null = null;

  constructor() {
    // docs/design-system.md's totalPulse: fires only on a real change to the
    // displayed total (never on first render), ties the Phase 5/6 "the total
    // always visibly increments" requirement to an actual felt animation.
    effect(() => {
      const totalCents = this.totals().totalInclVatCents;
      if (this.previousTotalCents !== null && totalCents !== this.previousTotalCents) {
        this.pulsing.set(false);
        queueMicrotask(() => {
          this.pulsing.set(true);
          setTimeout(() => this.pulsing.set(false), PULSE_DURATION_MS);
        });
      }
      this.previousTotalCents = totalCents;
    });
  }
}
