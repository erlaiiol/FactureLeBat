import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ServicePricingMode, ServiceVisibility } from '../../core/models/service.model';
import { ServiceCatalogService } from '../../core/services/service-catalog.service';
import { BigButtonComponent } from '../../shared/components/big-button.component';
import { FieldHintComponent } from '../../shared/components/field-hint.component';

@Component({
  selector: 'app-service-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, BigButtonComponent, FieldHintComponent],
  templateUrl: './service-form.page.html',
})
export class ServiceFormPage {
  private readonly serviceCatalogService = inject(ServiceCatalogService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly serviceId = this.route.snapshot.paramMap.get('id');
  protected readonly isEditing = this.serviceId !== null;

  protected readonly loading = signal(this.isEditing);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  // Phase 13.5: FIXED (default) is today's typed-euro-amount behavior;
  // PERCENTAGE lets the artisan define e.g. a reusable "Marge 30%" service
  // instead of recomputing a markup by hand on every invoice — see
  // InvoiceDraftStore.resolvePercentageAmountCents for where the percentage
  // actually gets turned into a euro amount, at line-activation time.
  // priceEuros/percentage are two separate controls (only one required,
  // depending on pricingMode) rather than one shared field, so switching
  // modes never silently carries a stale number from the other one over.
  protected readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    description: [''],
    pricingMode: this.fb.nonNullable.control<ServicePricingMode>('FIXED'),
    priceEuros: [0, [Validators.min(0)]],
    // Entered as a plain percentage (e.g. 30 for 30%) and converted to
    // basis points on submit — same boundary-conversion convention as the
    // euro fields, applied to Company.vatRateBasisPoints's basis-point unit.
    percentage: [0, [Validators.min(0.01), Validators.max(100)]],
    defaultVisibility: this.fb.nonNullable.control<ServiceVisibility>('VISIBLE'),
    code: [''],
  });

  protected isPercentageMode(): boolean {
    return this.form.controls.pricingMode.value === 'PERCENTAGE';
  }

  protected setPricingMode(mode: ServicePricingMode): void {
    this.form.controls.pricingMode.setValue(mode);
  }

  constructor() {
    if (this.serviceId) {
      this.serviceCatalogService
        .getById(this.serviceId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (service) => {
            this.loading.set(false);
            this.form.patchValue({
              name: service.name,
              description: service.description ?? '',
              pricingMode: service.pricingMode,
              priceEuros: service.priceCents != null ? service.priceCents / 100 : 0,
              percentage:
                service.percentageBasisPoints != null ? service.percentageBasisPoints / 100 : 0,
              defaultVisibility: service.defaultVisibility,
              code: service.code ?? '',
            });
          },
          error: () => {
            this.loading.set(false);
            this.errorMessage.set('Impossible de charger cette prestation.');
          },
        });
    }
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
    const payload = {
      name: value.name,
      description: value.description || undefined,
      pricingMode: value.pricingMode,
      priceCents: value.pricingMode === 'FIXED' ? Math.round(value.priceEuros * 100) : undefined,
      percentageBasisPoints:
        value.pricingMode === 'PERCENTAGE' ? Math.round(value.percentage * 100) : undefined,
      defaultVisibility: value.defaultVisibility,
      code: value.code || undefined,
    };

    this.saving.set(true);
    this.errorMessage.set(null);

    const request = this.serviceId
      ? this.serviceCatalogService.update(this.serviceId, payload)
      : this.serviceCatalogService.create(payload);

    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        void this.router.navigate(['/prestations']);
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.errorMessage.set(
          error.status === 409
            ? 'Ce code de prestation est déjà utilisé par une autre prestation.'
            : 'Erreur lors de l’enregistrement. Veuillez réessayer.',
        );
      },
    });
  }
}
