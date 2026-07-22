import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CustomerService } from '../../core/services/customer.service';
import { BigButtonComponent } from '../../shared/components/big-button.component';
import { FieldHintComponent } from '../../shared/components/field-hint.component';

@Component({
  selector: 'app-customer-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, BigButtonComponent, FieldHintComponent],
  templateUrl: './customer-form.page.html',
})
export class CustomerFormPage {
  private readonly customerService = inject(CustomerService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly customerId = this.route.snapshot.paramMap.get('id');
  protected readonly isEditing = this.customerId !== null;

  protected readonly loading = signal(this.isEditing);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    companyName: [''],
    address: [''],
    email: [''],
    phone: [''],
    siret: ['', Validators.pattern(/^$|^\d{14}$/)],
  });

  constructor() {
    if (this.customerId) {
      this.customerService
        .getById(this.customerId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (customer) => {
            this.loading.set(false);
            this.form.patchValue({
              name: customer.name,
              companyName: customer.companyName ?? '',
              address: customer.address ?? '',
              email: customer.email ?? '',
              phone: customer.phone ?? '',
              siret: customer.siret ?? '',
            });
          },
          error: () => {
            this.loading.set(false);
            this.errorMessage.set('Impossible de charger ce client.');
          },
        });
    }
  }

  protected submit(): void {
    if (this.saving()) {
      return; // already in flight — ignore a fast double click/tap
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const payload = {
      name: value.name,
      companyName: value.companyName || undefined,
      address: value.address || undefined,
      email: value.email || undefined,
      phone: value.phone || undefined,
      siret: value.siret || undefined,
    };

    this.saving.set(true);
    this.errorMessage.set(null);

    const request = this.customerId
      ? this.customerService.update(this.customerId, payload)
      : this.customerService.create(payload);

    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        void this.router.navigate(['/clients']);
      },
      error: () => {
        this.saving.set(false);
        this.errorMessage.set('Erreur lors de l’enregistrement. Veuillez réessayer.');
      },
    });
  }
}
