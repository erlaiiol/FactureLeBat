import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import { CentsToEurosPipe } from '../../../shared/pipes/cents-to-euros.pipe';
import { TotalsPreview } from '../calculation-preview';

const PULSE_DURATION_MS = 400;

// Shared "this field is editable" affordance (manual mode only, see
// `editable`): a low-key tint at rest that most inputs elsewhere on the
// manual canvas already use (see invoice-create-manual.page.html), stronger
// on hover/focus so the field never looks inert. `secondary-subtle` is a
// semantic token (styles.css's @theme + :root.dark override), so this reads
// correctly in both themes without any dark: variant of its own.
const EDITABLE_FIELD_CLASSES =
  'w-28 rounded bg-secondary-subtle/40 px-1 text-right font-mono outline-none transition-colors hover:bg-secondary-subtle focus:bg-secondary-subtle focus:border-primary';

@Component({
  selector: 'app-invoice-totals-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CentsToEurosPipe],
  template: `
    <div class="flex flex-col items-end gap-1 rounded-xl bg-secondary-subtle p-4">
      <div class="flex w-56 justify-between text-ink">
        <span>Sous-total HT</span>
        @if (editable()) {
          <input
            type="text"
            [class]="editableFieldClasses"
            [value]="totals().subtotalExclVatCents | centsToEuros"
            (focus)="onFocus($event)"
            (input)="subtotalOverrideChange.emit($any($event.target).value)"
          />
        } @else {
          <span class="font-mono">{{ totals().subtotalExclVatCents | centsToEuros }}</span>
        }
      </div>
      @if (vatApplicable()) {
        <div class="flex w-56 justify-between text-ink">
          <span>TVA</span>
          @if (editable()) {
            <input
              type="text"
              [class]="editableFieldClasses"
              [value]="totals().vatAmountCents | centsToEuros"
              (focus)="onFocus($event)"
              (input)="vatOverrideChange.emit($any($event.target).value)"
            />
          } @else {
            <span class="font-mono">{{ totals().vatAmountCents | centsToEuros }}</span>
          }
        </div>
      } @else {
        <div class="w-56 text-right text-xs text-ink-soft">TVA non applicable</div>
      }
      <div class="flex w-56 items-center justify-between text-lg font-bold text-ink">
        <span>Total TTC</span>
        @if (editable()) {
          <input
            type="text"
            [class]="editableFieldClasses + ' text-lg'"
            [class.anim-total-pulse]="pulsing()"
            [value]="totals().totalInclVatCents | centsToEuros"
            (focus)="onFocus($event)"
            (input)="totalOverrideChange.emit($any($event.target).value)"
          />
        } @else {
          <span class="font-mono" [class.anim-total-pulse]="pulsing()">
            {{ totals().totalInclVatCents | centsToEuros }}
          </span>
        }
      </div>
    </div>
  `,
})
export class InvoiceTotalsSummaryComponent {
  readonly totals = input.required<TotalsPreview>();
  readonly vatApplicable = input.required<boolean>();

  // Manual mode only (see docs/roadmap.md Phase 9.5 bis) — mode rapide's
  // totals stay a pure computed display, entirely derived from the
  // catalog/form-driven lines, never a value the artisan types directly.
  readonly editable = input(false);
  readonly subtotalOverrideChange = output<string>();
  readonly vatOverrideChange = output<string>();
  readonly totalOverrideChange = output<string>();

  protected readonly editableFieldClasses = EDITABLE_FIELD_CLASSES;

  protected readonly pulsing = signal(false);
  private previousTotalCents: number | null = null;

  // Selects the whole formatted value on focus — editing "150,00 €" a
  // character at a time makes no sense for a field whose whole point is
  // "type a new number", same as clicking into any spreadsheet cell.
  protected onFocus(event: FocusEvent): void {
    (event.target as HTMLInputElement).select();
  }

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
