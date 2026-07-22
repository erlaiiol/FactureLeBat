import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { computeBilledQuantity } from '../calculation-preview';
import { WasteSurcharge } from '../../../core/models/invoice.model';
import { isAreaUnit, Unit, UNIT_LABELS, UNIT_OPTIONS } from '../../../core/models/unit.model';
import { FieldHintComponent } from '../../../shared/components/field-hint.component';

export type InvoiceLineFormGroup = FormGroup<{
  description: FormControl<string>;
  unit: FormControl<Unit>;
  quantity: FormControl<number>;
  unitPriceEuros: FormControl<number>;
  wasteSurcharge: FormControl<WasteSurcharge>;
  packagingQuantity: FormControl<number | null>;
  roundUpToPackaging: FormControl<boolean>;
}>;

@Component({
  selector: 'app-invoice-line-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, FieldHintComponent],
  templateUrl: './invoice-line-form.component.html',
})
export class InvoiceLineFormComponent {
  readonly group = input.required<InvoiceLineFormGroup>();
  readonly index = input.required<number>();
  readonly remove = output<void>();

  protected readonly unitOptions = UNIT_OPTIONS;
  protected readonly unitLabels = UNIT_LABELS;

  // Phase 7: the calculation mode is no longer a separate choice — picking
  // a unit that has area semantics (m²) is what turns on waste-surcharge
  // billing, exactly like the backend derives it (see unit.util.ts).
  protected isAreaMode(): boolean {
    return isAreaUnit(this.group().controls.unit.value);
  }

  // Phase 8.5: the "arrondir au conditionnement" toggle only makes sense
  // once a packaging quantity has actually been entered — hidden otherwise
  // rather than shown disabled, same "click, don't write" spirit as the
  // rest of this form.
  protected hasPackaging(): boolean {
    const packagingQuantity = this.group().controls.packagingQuantity.value;
    return packagingQuantity != null && packagingQuantity > 0;
  }

  // UX follow-up: "prix unitaire" is the field actually sent to the backend
  // (unitPriceEuros below), but an artisan buying glue in boxes knows the
  // box's real price, not a derived per-m² figure. This toggle and the
  // package-price input are local, UI-only convenience — they compute
  // unitPriceEuros for the artisan instead of asking them to do the
  // division themselves. Kept out of the FormGroup (unlike every other
  // field here) specifically so they never leak into InvoiceDraftStore or
  // the API request.
  protected readonly priceEntryMode = signal<'PER_UNIT' | 'PER_PACKAGE'>('PER_UNIT');
  protected readonly packagePriceEuros = signal<number | null>(null);

  protected setPriceEntryMode(mode: 'PER_UNIT' | 'PER_PACKAGE'): void {
    if (mode === 'PER_PACKAGE') {
      const packagingQuantity = this.group().controls.packagingQuantity.value;
      if (packagingQuantity) {
        this.packagePriceEuros.set(
          Math.round(this.group().controls.unitPriceEuros.value * packagingQuantity * 100) / 100,
        );
      }
    }
    this.priceEntryMode.set(mode);
  }

  protected onPackagePriceInput(rawValue: string): void {
    const packagePrice = Number(rawValue);
    this.packagePriceEuros.set(Number.isFinite(packagePrice) ? packagePrice : null);

    const packagingQuantity = this.group().controls.packagingQuantity.value;
    if (Number.isFinite(packagePrice) && packagingQuantity && packagingQuantity > 0) {
      this.group().controls.unitPriceEuros.setValue(
        Math.round((packagePrice / packagingQuantity) * 100) / 100,
      );
    }
  }

  // Whichever way the artisan chooses to enter the price, show the other
  // one alongside it — so they can always check it against what their
  // supplier actually shows, per-unit or per-box.
  protected priceHint(): string {
    const packagingQuantity = this.group().controls.packagingQuantity.value;
    const unit = this.unitLabels[this.group().controls.unit.value];

    if (this.priceEntryMode() === 'PER_PACKAGE') {
      if (!packagingQuantity || this.packagePriceEuros() == null) {
        return `Le prix à l'unité (${unit}) sera calculé automatiquement à partir du prix du conditionnement.`;
      }
      const perUnit = this.group().controls.unitPriceEuros.value.toFixed(2);
      return `${this.packagePriceEuros()} € pour ${packagingQuantity} ${unit} → ${perUnit} €/${unit}, calculé automatiquement.`;
    }

    const unitPrice = this.group().controls.unitPriceEuros.value;
    if (packagingQuantity && packagingQuantity > 0 && unitPrice > 0) {
      const packagePrice = (unitPrice * packagingQuantity).toFixed(2);
      return `Le prix pour une seule unité (${unit}), hors chutes éventuelles — soit ${packagePrice} € pour un conditionnement de ${packagingQuantity} ${unit}.`;
    }
    return `Le prix pour une seule unité (${unit}), hors chutes éventuelles.`;
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
