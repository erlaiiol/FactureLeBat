import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { computeBilledQuantity } from '../calculation-preview';
import { InvoiceDraftStore } from '../invoice-draft.store';
import { WasteSurcharge } from '../../../core/models/invoice.model';
import {
  isAreaUnit,
  Unit,
  UNIT_LABELS,
  UNIT_OPTIONS,
  UNIT_PRICE_BUTTON_LABELS,
} from '../../../core/models/unit.model';
import { FieldHintComponent } from '../../../shared/components/field-hint.component';
import { SourcingPanelComponent } from './sourcing-panel.component';

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
  // Phase 13.5, UI-only: see InvoiceLineDraft.catalogProductId.
  catalogProductId: FormControl<string | null>;
  // Phase 15: not rendered by this form — see InvoiceCreateLinesStepPage's
  // createLineGroup comment on why these still need to exist as controls.
  showUnitDetail: FormControl<boolean>;
  showBillingDetail: FormControl<boolean>;
}>;

@Component({
  selector: 'app-invoice-line-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, FieldHintComponent, SourcingPanelComponent],
  templateUrl: './invoice-line-form.component.html',
})
export class InvoiceLineFormComponent {
  // Phase 10: only reads the customer's freehand address to localize a
  // supplier search — the store is already a singleton shared by the whole
  // "nouvelle facture" flow, so injecting it here is simpler than threading
  // another input down from the lines-step page for one read-only field.
  private readonly draftStore = inject(InvoiceDraftStore);

  readonly group = input.required<InvoiceLineFormGroup>();
  readonly index = input.required<number>();
  readonly remove = output<void>();

  protected customerLocation(): string | null {
    return this.draftStore.customer().customerAddress || null;
  }

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

  // This line was toggled on from an existing catalog Product (see
  // InvoiceCreateLinesStepPage.addProductFromCatalog) rather than typed
  // freehand — its name identifies that stored Product, so it can't be
  // renamed from here (that would silently desync the line from what it
  // claims to reference; renaming the actual Product belongs in "Mes
  // produits"). Every other field stays editable, same "autofill, not a
  // lock" rule as elsewhere.
  protected isCatalogLinked(): boolean {
    return this.group().controls.catalogProductId.value != null;
  }

  protected saveToCatalogLabel(): string {
    return this.isCatalogLinked()
      ? 'Mettre à jour ce produit dans le catalogue'
      : 'Enregistrer ce produit dans mon catalogue';
  }

  protected toggleSaveToCatalog(): void {
    const control = this.group().controls.saveAsNewProduct;
    control.setValue(!control.value);
  }

  // A price the artisan already has (typed by hand, or prefilled from the
  // catalog) means there's nothing left to look up — the sourcing panel is
  // for finding a price, not for browsing suppliers once one is set.
  protected showSourcingPanel(): boolean {
    return !(this.group().controls.unitPriceEuros.value > 0);
  }

  // UX follow-up: an artisan describes a box the way it's physically
  // labeled — "8 planches" — not the way pricing math would derive it. Both
  // packaging fields are now entered directly (no more deducing content
  // from two prices, which drifted from reality whenever a supplier's
  // prices didn't divide evenly). The item-count field is local, UI-only
  // convenience — kept out of the FormGroup (unlike packagingQuantity)
  // specifically so it never leaks into InvoiceDraftStore or the API
  // request; it only enriches the recap below with a "N unités" figure.
  protected readonly packagingItemCount = signal<number | null>(null);

  // UX follow-up: most lines (labor, a lump-sum service, anything sold
  // "au détail") never touch packaging at all — showing these fields and
  // the round-up checkbox unconditionally cluttered every single line with
  // a cluster only some of them need. Collapsed behind this toggle instead:
  // hidden by default, revealed on request, and auto-revealed (see the
  // effect below) whenever the line already has a packagingQuantity so
  // existing data is never hidden behind a click.
  protected readonly packagingEnabled = signal(false);

  constructor() {
    // A required input's value isn't available until after construction, so
    // this runs as a one-shot effect instead of plain constructor code — it
    // only re-runs if `group` itself is ever reassigned, which doesn't
    // happen here in practice.
    effect(() => {
      const packagingQuantity = this.group().controls.packagingQuantity.value;
      if (packagingQuantity && packagingQuantity > 0) {
        this.packagingEnabled.set(true);
      }
    });
  }

  protected enablePackaging(): void {
    this.packagingEnabled.set(true);
  }

  // Reverting to a simple unit price clears packagingQuantity rather than
  // just hiding the section — an inert-but-still-set packagingQuantity
  // would silently keep rounding the billed quantity even though the
  // artisan can no longer see (or edit) that it's happening.
  protected disablePackaging(): void {
    this.packagingEnabled.set(false);
    this.packagingItemCount.set(null);
    this.group().controls.packagingQuantity.setValue(null);
  }

  protected onPackagingItemCountInput(rawValue: string): void {
    const count = Number(rawValue);
    this.packagingItemCount.set(Number.isFinite(count) && count > 0 ? count : null);
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
        let packagingPart = `arrondi à ${packageCount} conditionnement${packageCount > 1 ? 's' : ''} de ${this.quantityFormatter.format(packagingQuantity)} ${unit} = ${this.quantityFormatter.format(billedQuantity)} ${unit} facturés`;
        const itemCount = this.packagingItemCount();
        if (itemCount && itemCount > 0) {
          packagingPart += ` (${this.quantityFormatter.format(packageCount * itemCount)} unités)`;
        }
        parts.push(packagingPart);
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
