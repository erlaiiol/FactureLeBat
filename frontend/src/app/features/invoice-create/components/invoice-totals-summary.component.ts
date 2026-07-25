import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { CompanyProfile } from '../../../core/models/company.model';
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

const VAT_NON_APPLICABLE_VALUE = 'NON_APPLICABLE';

// The real French VAT rates relevant to a construction artisan's invoicing —
// no 15% (doesn't exist), 5.5%/10% are the two reduced rates that apply to
// travaux depending on the nature of the job (energy-efficiency renovation
// vs. everything else on housing over 2 years old), 20% is the standard
// rate. 2.1% (press/medicines) is deliberately excluded, it's never
// relevant to this app's audience.
const FIXED_VAT_RATE_OPTIONS: readonly { basisPoints: number; label: string }[] = [
  { basisPoints: 550, label: formatRateLabel(550) },
  { basisPoints: 1000, label: formatRateLabel(1000) },
  { basisPoints: 2000, label: formatRateLabel(2000) },
];

function formatRateLabel(basisPoints: number): string {
  return `${(basisPoints / 100).toString().replace('.', ',')} %`;
}

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
      @if (editable()) {
        <div class="flex w-56 items-center justify-between text-ink">
          <span class="flex items-center gap-1">
            <select
              class="rounded border-none bg-secondary-subtle/40 px-1 py-0.5 text-xs text-ink outline-none transition-colors hover:bg-secondary-subtle focus:bg-secondary-subtle"
              aria-label="Régime de TVA de cette facture"
              [value]="selectedVatOptionValue()"
              (change)="onVatSelectChange($event)"
            >
              <option [value]="nonApplicableValue">TVA non applicable</option>
              @for (option of vatRateOptions(); track option.basisPoints) {
                <option [value]="option.basisPoints">TVA {{ option.label }}</option>
              }
            </select>
            <!-- Native details/summary: a "click to reveal" tooltip with no
                 extra state to manage, closes itself on a second click. -->
            <details class="relative">
              <summary
                class="cursor-pointer list-none text-ink-soft hover:text-ink"
                aria-label="Statut TVA de votre entreprise"
                title="Statut TVA de votre entreprise"
              >
                ⓘ
              </summary>
              <div
                class="absolute bottom-full right-0 z-10 mb-1 w-64 rounded-lg border border-line bg-surface p-2 text-xs font-normal text-ink shadow-lg"
              >
                {{ legalStatusTooltip() }}
              </div>
            </details>
          </span>
          @if (vatApplicable()) {
            <input
              type="text"
              [class]="editableFieldClasses"
              [value]="totals().vatAmountCents | centsToEuros"
              (focus)="onFocus($event)"
              (input)="vatOverrideChange.emit($any($event.target).value)"
            />
          }
        </div>
      } @else if (vatApplicable()) {
        <div class="flex w-56 justify-between text-ink">
          <span>TVA</span>
          <span class="font-mono">{{ totals().vatAmountCents | centsToEuros }}</span>
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

  // The next two are only meaningful when editable() — GUIDED mode's
  // (non-editable) usage doesn't pass them and never reads them.
  //
  // vatRateBasisPoints is the *effective* rate (already resolved by the
  // store: explicit choice, or the company default) — same "component
  // renders, store resolves" split as vatApplicable above.
  readonly vatRateBasisPoints = input(0);
  // The company profile itself, purely to render the default-regime
  // tooltip and to surface the company's own rate as a select option even
  // when it isn't one of the three standard ones.
  readonly company = input<CompanyProfile | null>(null);
  readonly vatChoiceChange = output<{ applicable: boolean; rateBasisPoints: number }>();

  protected readonly editableFieldClasses = EDITABLE_FIELD_CLASSES;
  protected readonly nonApplicableValue = VAT_NON_APPLICABLE_VALUE;

  protected readonly pulsing = signal(false);
  private previousTotalCents: number | null = null;

  protected readonly selectedVatOptionValue = computed(() =>
    this.vatApplicable() ? String(this.vatRateBasisPoints()) : VAT_NON_APPLICABLE_VALUE,
  );

  // The three real French rates relevant to this app's audience, plus a 4th
  // option only when the company's own configured rate (company-settings'
  // free-form % field) isn't one of those three — so the select never shows
  // a default that silently doesn't match any option.
  protected readonly vatRateOptions = computed(() => {
    const company = this.company();
    const companyRate = company?.vatRateBasisPoints;
    const companyDefaultApplicable = company?.legalStatus === 'COMPANY';
    if (
      !companyDefaultApplicable ||
      companyRate === undefined ||
      FIXED_VAT_RATE_OPTIONS.some((option) => option.basisPoints === companyRate)
    ) {
      return FIXED_VAT_RATE_OPTIONS;
    }
    return [
      ...FIXED_VAT_RATE_OPTIONS,
      {
        basisPoints: companyRate,
        label: `${formatRateLabel(companyRate)} (taux de votre entreprise)`,
      },
    ].sort((a, b) => a.basisPoints - b.basisPoints);
  });

  // Statut de l'entreprise + son régime par défaut — l'artisan reste libre
  // de choisir autre chose pour ce document précis (voir le sélecteur
  // ci-dessus), ce tooltip ne fait qu'expliquer ce que serait le régime
  // "par défaut".
  protected readonly legalStatusTooltip = computed(() => {
    const company = this.company();
    if (!company) {
      return '';
    }
    if (company.legalStatus === 'MICRO_ENTREPRENEUR') {
      return (
        'Statut de votre entreprise : Micro-entrepreneur (franchise en base de TVA). ' +
        'Par défaut, TVA non applicable sur vos factures (art. 293 B du CGI) — ' +
        'sauf si vous avez opté pour le paiement de la TVA. Vous pouvez néanmoins choisir un autre régime pour ce document précis.'
      );
    }
    return (
      'Statut de votre entreprise : Entreprise (assujettie à la TVA). ' +
      `Par défaut, TVA ${formatRateLabel(company.vatRateBasisPoints)} sur vos factures. ` +
      'Vous pouvez néanmoins choisir un autre régime pour ce document précis.'
    );
  });

  // Selects the whole formatted value on focus — editing "150,00 €" a
  // character at a time makes no sense for a field whose whole point is
  // "type a new number", same as clicking into any spreadsheet cell.
  protected onFocus(event: FocusEvent): void {
    (event.target as HTMLInputElement).select();
  }

  protected onVatSelectChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.vatChoiceChange.emit(
      value === VAT_NON_APPLICABLE_VALUE
        ? { applicable: false, rateBasisPoints: 0 }
        : { applicable: true, rateBasisPoints: Number(value) },
    );
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
