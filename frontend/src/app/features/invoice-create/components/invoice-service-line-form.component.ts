import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RedistributionStrategy, ServiceLineVisibility } from '../../../core/models/invoice.model';
import { ActivityCategory } from '../../../core/models/report.model';
import { ServicePricingMode, ServiceProfile } from '../../../core/models/service.model';
import { FieldHintComponent } from '../../../shared/components/field-hint.component';
import { IconCheckComponent } from '../../../shared/components/icon-check.component';
import { LineBadgeComponent } from '../../../shared/components/line-badge.component';
import { InvoiceDraftStore } from '../invoice-draft.store';

export type InvoiceServiceLineFormGroup = FormGroup<{
  serviceId: FormControl<string | null>;
  name: FormControl<string>;
  description: FormControl<string>;
  amountEuros: FormControl<number>;
  visibility: FormControl<ServiceLineVisibility>;
  redistributionStrategy: FormControl<RedistributionStrategy>;
  weights: FormArray<FormControl<number>>;
  // Phase 13.5: FIXED (default) is today's typed-euro-amount behavior,
  // authoritative via amountEuros above. PERCENTAGE ignores amountEuros —
  // see InvoiceDraftStore.resolvedServiceAmountCents, which recomputes this
  // line's real amount live instead.
  pricingMode: FormControl<ServicePricingMode>;
  percentageBasisPoints: FormControl<number | null>;
  // UI-only, see InvoiceServiceLineDraft.catalogServiceId.
  catalogServiceId: FormControl<string | null>;
  // UI-only, see InvoiceServiceLineDraft.saveAsNewService.
  saveAsNewService: FormControl<boolean>;
  // Phase 17, UI-only: see InvoiceServiceLineDraft.activityCategory.
  activityCategory: FormControl<ActivityCategory | null>;
}>;

@Component({
  selector: 'app-invoice-service-line-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    DecimalPipe,
    FieldHintComponent,
    IconCheckComponent,
    LineBadgeComponent,
  ],
  templateUrl: './invoice-service-line-form.component.html',
})
export class InvoiceServiceLineFormComponent {
  private readonly draftStore = inject(InvoiceDraftStore);

  readonly group = input.required<InvoiceServiceLineFormGroup>();
  readonly index = input.required<number>();
  readonly services = input.required<ServiceProfile[]>();
  // Labels (line descriptions) for the invoice's current product/material
  // lines, in order — used only to name each weight input when the
  // WEIGHTED strategy is selected. The `weights` FormArray itself is kept
  // in sync with these by the parent page (see syncServiceLineWeights).
  readonly lineLabels = input.required<string[]>();
  readonly remove = output<void>();

  protected isRedistributed(): boolean {
    return this.group().controls.visibility.value === 'REDISTRIBUTED';
  }

  protected isWeighted(): boolean {
    return this.group().controls.redistributionStrategy.value === 'WEIGHTED';
  }

  protected weightControls(): FormControl<number>[] {
    return this.group().controls.weights.controls;
  }

  protected isPercentageMode(): boolean {
    return this.group().controls.pricingMode.value === 'PERCENTAGE';
  }

  // percentageBasisPoints stores basis points (3000 = 30.00%, same
  // convention as CompanyProfile.vatRateBasisPoints) — displayed/typed as a
  // plain percentage, converted at the boundary since the control itself
  // must stay in basis points for InvoiceDraftStore.resolvedServiceAmountCents.
  protected displayPercentage(): number {
    const basisPoints = this.group().controls.percentageBasisPoints.value;
    return basisPoints != null ? basisPoints / 100 : 0;
  }

  protected onPercentageInput(rawValue: string): void {
    const percent = Number(rawValue);
    const basisPoints = Number.isFinite(percent) ? Math.round(percent * 100) : 0;
    this.group().controls.percentageBasisPoints.setValue(basisPoints);
  }

  // Same "can't rename what it references" rule as InvoiceLineFormComponent.
  protected isCatalogLinked(): boolean {
    return this.group().controls.catalogServiceId.value != null;
  }

  protected saveToCatalogLabel(): string {
    const willSave = this.group().controls.saveAsNewService.value;
    if (this.isCatalogLinked()) {
      return willSave
        ? 'Mettre à jour cette prestation dans le catalogue'
        : 'Ne pas mettre à jour dans le catalogue';
    }
    return willSave
      ? 'Enregistrer cette prestation dans mon catalogue'
      : 'Ne pas enregistrer dans mon catalogue';
  }

  protected toggleSaveToCatalog(): void {
    const control = this.group().controls.saveAsNewService;
    control.setValue(!control.value);
  }

  // Live, read-only amount for a PERCENTAGE line — "computed at build time,
  // not typed per invoice" (docs/roadmap.md Phase 13.5). Reads the store's
  // canonical serviceLines (kept in sync by the parent page's valueChanges
  // subscription) rather than this.group().getRawValue() directly, so it
  // reacts to every other line/service-line changing too, not just this one.
  protected resolvedAmountCents(): number {
    const serviceLine = this.draftStore.serviceLines()[this.index()];
    return serviceLine ? this.draftStore.resolvedServiceAmountCents(serviceLine) : 0;
  }

  protected onServiceSelected(serviceId: string): void {
    if (!serviceId) {
      return;
    }
    const service = this.services().find((s) => s.id === serviceId);
    if (!service) {
      return;
    }
    // Autofill only — every field stays fully editable afterward, same
    // "autofill, not a lock" rule as the customer/import pickers elsewhere.
    this.group().patchValue({
      serviceId: service.id,
      catalogServiceId: service.id,
      name: service.name,
      description: service.description ?? '',
      pricingMode: service.pricingMode,
      amountEuros: service.pricingMode === 'FIXED' ? (service.priceCents ?? 0) / 100 : 0,
      percentageBasisPoints: service.percentageBasisPoints,
      visibility: service.defaultVisibility,
    });
  }
}
