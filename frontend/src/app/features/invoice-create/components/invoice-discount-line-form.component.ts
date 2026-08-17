import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { DiscountProfile, DiscountType } from '../../../core/models/discount.model';
import { FieldHintComponent } from '../../../shared/components/field-hint.component';
import { IconCheckComponent } from '../../../shared/components/icon-check.component';
import { InvoiceDraftStore } from '../invoice-draft.store';

export type InvoiceDiscountLineFormGroup = FormGroup<{
  discountId: FormControl<string | null>;
  name: FormControl<string>;
  // Phase 32: FIXED (default) is a typed-euro-amount, authoritative via
  // fixedAmountEuros below. PERCENTAGE ignores fixedAmountEuros — see
  // InvoiceDraftStore.resolvedDiscountAmountCents, which recomputes this
  // line's real amount live instead.
  discountType: FormControl<DiscountType>;
  fixedAmountEuros: FormControl<number>;
  percentageBasisPoints: FormControl<number | null>;
  // UI-only, see InvoiceDiscountLineDraft.catalogDiscountId.
  catalogDiscountId: FormControl<string | null>;
  // UI-only, see InvoiceDiscountLineDraft.saveAsNewDiscount.
  saveAsNewDiscount: FormControl<boolean>;
  // Phase 34, UI-only: see InvoiceDiscountLineDraft.targetLineClientId/
  // targetServiceLineClientId.
  targetLineClientId: FormControl<string | null>;
  targetServiceLineClientId: FormControl<string | null>;
}>;

// Phase 34: one selectable target for the "Appliquer sur" picker — a plain
// invoice line or service line already added to the draft, keyed by its
// stable clientId (see InvoiceLineDraft.clientId) rather than its
// (mutation-prone) array index.
export interface DiscountTargetOption {
  clientId: string;
  label: string;
}

@Component({
  selector: 'app-invoice-discount-line-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DecimalPipe, FieldHintComponent, IconCheckComponent],
  templateUrl: './invoice-discount-line-form.component.html',
})
export class InvoiceDiscountLineFormComponent {
  private readonly draftStore = inject(InvoiceDraftStore);

  readonly group = input.required<InvoiceDiscountLineFormGroup>();
  readonly index = input.required<number>();
  readonly discounts = input.required<DiscountProfile[]>();
  // Phase 34: the invoice's current product/material lines and service
  // lines, offered as "Appliquer sur" targets — kept in sync with the
  // parent page's own FormArrays (see InvoiceCreateLinesStepPage).
  readonly lineOptions = input.required<DiscountTargetOption[]>();
  readonly serviceLineOptions = input.required<DiscountTargetOption[]>();
  readonly remove = output<void>();

  // Encodes the mutually-exclusive targetLineClientId/targetServiceLineClientId
  // pair as a single <select> value: '' (general total), `line:<clientId>`,
  // or `service:<clientId>`.
  protected currentTargetValue(): string {
    const controls = this.group().controls;
    if (controls.targetLineClientId.value) {
      return `line:${controls.targetLineClientId.value}`;
    }
    if (controls.targetServiceLineClientId.value) {
      return `service:${controls.targetServiceLineClientId.value}`;
    }
    return '';
  }

  protected onTargetSelected(rawValue: string): void {
    if (!rawValue) {
      this.group().patchValue({ targetLineClientId: null, targetServiceLineClientId: null });
      return;
    }
    const [kind, clientId] = rawValue.split(':');
    if (kind === 'line') {
      this.group().patchValue({ targetLineClientId: clientId, targetServiceLineClientId: null });
    } else if (kind === 'service') {
      this.group().patchValue({ targetLineClientId: null, targetServiceLineClientId: clientId });
    }
  }

  protected hasTarget(): boolean {
    return this.currentTargetValue() !== '';
  }

  // The targeted line/service line's own name — read for the percentage
  // hint text below; null once its target has been removed from the draft
  // (see InvoiceDraftStore.discountPercentageBaseCents' same fallback).
  protected targetLabel(): string | null {
    const controls = this.group().controls;
    if (controls.targetLineClientId.value) {
      return (
        this.lineOptions().find((option) => option.clientId === controls.targetLineClientId.value)
          ?.label ?? null
      );
    }
    if (controls.targetServiceLineClientId.value) {
      return (
        this.serviceLineOptions().find(
          (option) => option.clientId === controls.targetServiceLineClientId.value,
        )?.label ?? null
      );
    }
    return null;
  }

  protected isPercentageMode(): boolean {
    return this.group().controls.discountType.value === 'PERCENTAGE';
  }

  // percentageBasisPoints stores basis points (1000 = 10.00%, same
  // convention as CompanyProfile.vatRateBasisPoints) — displayed/typed as a
  // plain percentage, converted at the boundary.
  protected displayPercentage(): number {
    const basisPoints = this.group().controls.percentageBasisPoints.value;
    return basisPoints != null ? basisPoints / 100 : 0;
  }

  protected onPercentageInput(rawValue: string): void {
    const percent = Number(rawValue);
    const basisPoints = Number.isFinite(percent) ? Math.round(percent * 100) : 0;
    this.group().controls.percentageBasisPoints.setValue(basisPoints);
  }

  // Same "can't rename what it references" rule as InvoiceServiceLineFormComponent.
  protected isCatalogLinked(): boolean {
    return this.group().controls.catalogDiscountId.value != null;
  }

  protected saveToCatalogLabel(): string {
    const willSave = this.group().controls.saveAsNewDiscount.value;
    if (this.isCatalogLinked()) {
      return willSave
        ? 'Mettre à jour cette remise dans le catalogue'
        : 'Ne pas mettre à jour dans le catalogue';
    }
    return willSave
      ? 'Enregistrer cette remise dans mon catalogue'
      : 'Ne pas enregistrer dans mon catalogue';
  }

  protected toggleSaveToCatalog(): void {
    const control = this.group().controls.saveAsNewDiscount;
    control.setValue(!control.value);
  }

  // Live, read-only amount for a PERCENTAGE remise — "computed at build
  // time, not typed per invoice" (same Phase 13.5 precedent as a
  // PERCENTAGE service line). Reads the store's canonical discounts (kept in
  // sync by the parent page's valueChanges subscription) rather than
  // this.group().getRawValue() directly, so it reacts to every other
  // line/service-line/discount changing too, not just this one.
  protected resolvedAmountCents(): number {
    const discountLine = this.draftStore.discountLines()[this.index()];
    return discountLine ? this.draftStore.resolvedDiscountAmountCents(discountLine) : 0;
  }

  protected onDiscountSelected(discountId: string): void {
    if (!discountId) {
      return;
    }
    const discount = this.discounts().find((d) => d.id === discountId);
    if (!discount) {
      return;
    }
    // Autofill only — every field stays fully editable afterward, same
    // "autofill, not a lock" rule as the customer/import pickers elsewhere.
    this.group().patchValue({
      discountId: discount.id,
      catalogDiscountId: discount.id,
      name: discount.name,
      discountType: discount.discountType,
      fixedAmountEuros:
        discount.discountType === 'FIXED' ? (discount.fixedAmountCents ?? 0) / 100 : 0,
      percentageBasisPoints: discount.percentageBasisPoints,
    });
  }
}
