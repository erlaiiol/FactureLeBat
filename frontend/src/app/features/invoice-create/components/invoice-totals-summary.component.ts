import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CentsToEurosPipe } from '../../../shared/pipes/cents-to-euros.pipe';
import { TotalsPreview } from '../calculation-preview';

@Component({
  selector: 'app-invoice-totals-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CentsToEurosPipe],
  template: `
    <div class="flex flex-col items-end gap-1 rounded-xl bg-slate-100 p-4">
      <div class="flex w-56 justify-between text-slate-700">
        <span>Sous-total HT</span>
        <span>{{ totals().subtotalExclVatCents | centsToEuros }}</span>
      </div>
      @if (vatApplicable()) {
        <div class="flex w-56 justify-between text-slate-700">
          <span>TVA</span>
          <span>{{ totals().vatAmountCents | centsToEuros }}</span>
        </div>
      } @else {
        <div class="w-56 text-right text-xs text-slate-500">TVA non applicable</div>
      }
      <div class="flex w-56 justify-between text-lg font-bold text-slate-900">
        <span>Total TTC</span>
        <span>{{ totals().totalInclVatCents | centsToEuros }}</span>
      </div>
    </div>
  `,
})
export class InvoiceTotalsSummaryComponent {
  readonly totals = input.required<TotalsPreview>();
  readonly vatApplicable = input.required<boolean>();
}
