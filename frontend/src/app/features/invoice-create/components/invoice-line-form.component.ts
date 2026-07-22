import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { computeBilledQuantity } from '../calculation-preview';
import { WasteSurcharge } from '../../../core/models/invoice.model';
import {
  isAreaUnit,
  Unit,
  UNIT_LABELS,
  UNIT_OPTIONS,
  UNIT_PRICE_BUTTON_LABELS,
} from '../../../core/models/unit.model';
import { FieldHintComponent } from '../../../shared/components/field-hint.component';
import { TourAnchorDirective } from '../../../shared/tour/tour-anchor.directive';

export type InvoiceLineFormGroup = FormGroup<{
  description: FormControl<string>;
  unit: FormControl<Unit>;
  quantity: FormControl<number>;
  unitPriceEuros: FormControl<number>;
  wasteSurcharge: FormControl<WasteSurcharge>;
  packagingQuantity: FormControl<number | null>;
  roundUpToPackaging: FormControl<boolean>;
  productCode: FormControl<string | null>;
  // UI-only — never sent as part of the invoice-creation request, see
  // InvoiceCreateLinesStepPage.submit().
  saveAsNewProduct: FormControl<boolean>;
}>;

@Component({
  selector: 'app-invoice-line-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, FieldHintComponent, TourAnchorDirective],
  templateUrl: './invoice-line-form.component.html',
})
export class InvoiceLineFormComponent {
  readonly group = input.required<InvoiceLineFormGroup>();
  readonly index = input.required<number>();
  readonly remove = output<void>();

  // Phase 8 onboarding tour: only the first rendered line ever carries the
  // 'invoice-line-fields' anchor — the lines step always shows at least one
  // blank line by default, so this is what lets the tour spotlight it
  // without waiting for a click. Kept structural (an @if in the template,
  // not a value bound unconditionally) so the anchor is never registered
  // twice when more lines are added.
  readonly firstLineAnchor = input<boolean>(false);

  protected readonly unitOptions = UNIT_OPTIONS;
  protected readonly unitLabels = UNIT_LABELS;

  // Phase 7: the calculation mode is no longer a separate choice — picking
  // a unit that has area semantics (m²) is what turns on waste-surcharge
  // billing, exactly like the backend derives it (see unit.util.ts).
  protected isAreaMode(): boolean {
    return isAreaUnit(this.group().controls.unit.value);
  }

  // Whether "arrondir au conditionnement" is meaningful right now — it
  // still stays visible either way (nothing in this section pops in or
  // out), just disabled until there's a packaging quantity to round to.
  protected hasPackaging(): boolean {
    const packagingQuantity = this.group().controls.packagingQuantity.value;
    return packagingQuantity != null && packagingQuantity > 0;
  }

  protected unitPriceButtonLabel(): string {
    return UNIT_PRICE_BUTTON_LABELS[this.group().controls.unit.value];
  }

  // UX follow-up: an artisan reads a packaging size off a supplier's price
  // list as "45€/m², 405€ la boîte" — not as "9 m² par boîte" — so the
  // artisan enters both real prices and the app deduces the packaging
  // quantity, instead of asking them to do that division themselves. The
  // package-price signal is local, UI-only convenience — kept out of the
  // FormGroup (unlike every other field here) specifically so it never
  // leaks into InvoiceDraftStore or the API request; only the deduced
  // packagingQuantity (a real form control) is ever persisted.
  protected readonly packagePriceEuros = signal<number | null>(null);

  // Advanced escape hatch: an artisan who already knows the exact packaging
  // content (but not, or not precisely, the box price) can still type it
  // directly — same "autofill, not a lock" rule as every other soft
  // catalog/snapshot field in this codebase. Off by default since the
  // two-price flow above is the common case.
  protected readonly manualPackaging = signal(false);

  constructor() {
    // Seed the package-price field from whatever packagingQuantity this line
    // already has (e.g. hydrated from a saved draft) so the two price
    // fields show sensible numbers immediately instead of starting blank.
    // A required input's value isn't available until after construction, so
    // this runs as a one-shot effect instead of plain constructor code —
    // it only re-runs if `group` itself is ever reassigned, which doesn't
    // happen here in practice.
    effect(() => {
      const packagingQuantity = this.group().controls.packagingQuantity.value;
      const unitPrice = this.group().controls.unitPriceEuros.value;
      if (packagingQuantity && packagingQuantity > 0 && Number.isFinite(unitPrice)) {
        this.packagePriceEuros.set(Math.round(unitPrice * packagingQuantity * 100) / 100);
      }
    });
  }

  protected enableManualPackaging(): void {
    this.manualPackaging.set(true);
  }

  // Leaving manual mode immediately re-derives packagingQuantity from
  // whatever the two price fields currently hold, so the two never silently
  // disagree once the artisan switches back.
  protected disableManualPackaging(): void {
    this.manualPackaging.set(false);
    this.recomputePackagingQuantity(
      this.group().controls.unitPriceEuros.value,
      this.packagePriceEuros(),
    );
  }

  protected onUnitPriceInput(rawValue: string): void {
    this.recomputePackagingQuantity(Number(rawValue), this.packagePriceEuros());
  }

  protected onPackagePriceInput(rawValue: string): void {
    const packagePrice = Number(rawValue);
    this.packagePriceEuros.set(Number.isFinite(packagePrice) ? packagePrice : null);
    this.recomputePackagingQuantity(this.group().controls.unitPriceEuros.value, packagePrice);
  }

  // The single place that deduces "how much is in one package" from the two
  // real prices — never runs while the artisan is using the manual override.
  private recomputePackagingQuantity(unitPrice: number, packagePrice: number | null): void {
    if (this.manualPackaging()) {
      return;
    }
    const packagingQuantityControl = this.group().controls.packagingQuantity;
    if (
      Number.isFinite(unitPrice) &&
      unitPrice > 0 &&
      packagePrice != null &&
      Number.isFinite(packagePrice) &&
      packagePrice > 0
    ) {
      packagingQuantityControl.setValue(Math.round((packagePrice / unitPrice) * 1000) / 1000);
    } else {
      packagingQuantityControl.setValue(null);
    }
  }

  private readonly quantityFormatter = new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 2,
  });
  private readonly euroFormatter = new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  });

  // The recap tying together the chantier's real need, the packaging
  // rounding, and the resulting line price — the three concepts artisans
  // report losing track of independently.
  protected quantitySummary(): string {
    const controls = this.group().controls;
    const quantity = controls.quantity.value;
    const unitPrice = controls.unitPriceEuros.value;
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice)) {
      return 'Renseignez la quantité et le prix pour voir le total de cette ligne.';
    }

    const unit = this.unitLabels[controls.unit.value];
    const packagingQuantity = controls.packagingQuantity.value;
    const { neededQuantity, billedQuantity } = computeBilledQuantity({
      unit: controls.unit.value,
      quantity,
      wasteSurcharge: controls.wasteSurcharge.value,
      packagingQuantity,
      roundUpToPackaging: controls.roundUpToPackaging.value,
    });

    const parts: string[] = [`${this.quantityFormatter.format(quantity)} ${unit} pour le chantier`];

    if (this.isAreaMode() && controls.wasteSurcharge.value !== 'NONE') {
      parts.push(`+ chutes = ${this.quantityFormatter.format(neededQuantity)} ${unit} à couvrir`);
    }

    if (packagingQuantity && packagingQuantity > 0) {
      if (controls.roundUpToPackaging.value) {
        const packageCount = Math.ceil(neededQuantity / packagingQuantity);
        parts.push(
          `arrondi à ${packageCount} conditionnement${packageCount > 1 ? 's' : ''} de ${this.quantityFormatter.format(packagingQuantity)} ${unit} = ${this.quantityFormatter.format(billedQuantity)} ${unit} facturés`,
        );
      } else {
        parts.push(
          `${this.quantityFormatter.format(billedQuantity)} ${unit} facturés, sans arrondi de conditionnement`,
        );
      }
    }

    parts.push(`soit ${this.euroFormatter.format(billedQuantity * unitPrice)} pour cette ligne`);

    return parts.join(' → ');
  }
}
