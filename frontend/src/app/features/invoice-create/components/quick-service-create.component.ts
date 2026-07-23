import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  ServicePricingMode,
  ServiceProfile,
  ServiceVisibility,
} from '../../../core/models/service.model';
import { ServiceCatalogService } from '../../../core/services/service-catalog.service';
import { BigButtonComponent } from '../../../shared/components/big-button.component';
import { FieldHintComponent } from '../../../shared/components/field-hint.component';

// Fixed "+ Prestation" panel's "Nouvelle prestation" entry: a minimal
// essential-fields-only creation form (name/tarification/prix ou %), the
// service-side counterpart to QuickProductCreateComponent — same "autofill,
// not a lock" rule, the result is one ordinary catalog Service, fully
// editable afterwards from "Mes prestations".
@Component({
  selector: 'app-quick-service-create',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, BigButtonComponent, FieldHintComponent],
  templateUrl: './quick-service-create.component.html',
})
export class QuickServiceCreateComponent {
  private readonly fb = inject(FormBuilder);
  private readonly serviceCatalogService = inject(ServiceCatalogService);
  private readonly destroyRef = inject(DestroyRef);

  readonly created = output<ServiceProfile>();
  readonly cancel = output<void>();

  protected readonly showAllFields = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    pricingMode: this.fb.nonNullable.control<ServicePricingMode>('FIXED'),
    priceEuros: [0, [Validators.min(0)]],
    percentage: [0, [Validators.min(0.01), Validators.max(100)]],
    description: [''],
    defaultVisibility: this.fb.nonNullable.control<ServiceVisibility>('VISIBLE'),
    code: [''],
  });

  protected isPercentageMode(): boolean {
    return this.form.controls.pricingMode.value === 'PERCENTAGE';
  }

  protected setPricingMode(mode: ServicePricingMode): void {
    this.form.controls.pricingMode.setValue(mode);
  }

  protected toggleAllFields(): void {
    this.showAllFields.set(!this.showAllFields());
  }

  protected submit(): void {
    if (this.saving()) {
      return; // already in flight — ignore a fast double click/tap
    }
    const pricingControl =
      this.form.controls.pricingMode.value === 'FIXED'
        ? this.form.controls.priceEuros
        : this.form.controls.percentage;
    if (this.form.controls.name.invalid || pricingControl.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    this.saving.set(true);
    this.errorMessage.set(null);

    this.serviceCatalogService
      .create({
        name: value.name,
        description: value.description || undefined,
        pricingMode: value.pricingMode,
        priceCents: value.pricingMode === 'FIXED' ? Math.round(value.priceEuros * 100) : undefined,
        percentageBasisPoints:
          value.pricingMode === 'PERCENTAGE' ? Math.round(value.percentage * 100) : undefined,
        defaultVisibility: value.defaultVisibility,
        code: value.code || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (service) => {
          this.saving.set(false);
          this.created.emit(service);
        },
        error: () => {
          this.saving.set(false);
          this.errorMessage.set(
            'Erreur lors de la création de la prestation — vérifiez le code s’il y en a un.',
          );
        },
      });
  }
}
