import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RedistributionStrategy, ServiceLineVisibility } from '../../../core/models/invoice.model';
import { ServiceProfile } from '../../../core/models/service.model';

export type InvoiceServiceLineFormGroup = FormGroup<{
  serviceId: FormControl<string | null>;
  name: FormControl<string>;
  description: FormControl<string>;
  amountEuros: FormControl<number>;
  visibility: FormControl<ServiceLineVisibility>;
  redistributionStrategy: FormControl<RedistributionStrategy>;
  weights: FormArray<FormControl<number>>;
}>;

@Component({
  selector: 'app-invoice-service-line-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './invoice-service-line-form.component.html',
})
export class InvoiceServiceLineFormComponent {
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
      name: service.name,
      description: service.description ?? '',
      amountEuros: service.priceCents / 100,
      visibility: service.defaultVisibility,
    });
  }
}
