import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { merge } from 'rxjs';
import { CustomerService } from '../../core/services/customer.service';
import { ToastService } from '../../core/services/toast.service';
import { BigButtonComponent } from '../../shared/components/big-button.component';
import { FieldHintComponent } from '../../shared/components/field-hint.component';
import { TourAnchorDirective } from '../../shared/tour/tour-anchor.directive';
import { catalogLimitMessage } from '../../shared/utils/plan-error.util';

@Component({
  selector: 'app-customer-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, BigButtonComponent, FieldHintComponent, TourAnchorDirective],
  templateUrl: './customer-form.page.html',
})
export class CustomerFormPage {
  private readonly customerService = inject(CustomerService);
  private readonly toastService = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly customerId = this.route.snapshot.paramMap.get('id');
  protected readonly isEditing = this.customerId !== null;

  protected readonly loading = signal(this.isEditing);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  // Phase 30: catalog-size cap reached (Essentiel/Pro) — distinct from
  // errorMessage so the template can offer a "Voir les offres" CTA instead
  // of a plain "réessayer" framing, since retrying changes nothing here.
  protected readonly catalogLimitReached = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    isProfessional: [false],
    companyName: [''],
    address: [''],
    email: [''],
    phone: [''],
    siret: ['', Validators.pattern(/^$|^\d{14}$/)],
    description: [''],
  });

  // Phase 1.1-7: "Client professionnel" auto-follows companyName/siret live
  // — as soon as the artisan clicks the checkbox directly (see
  // onProfessionalCheckboxClick), their choice sticks for the rest of this
  // form session, even if they go on to edit companyName/siret afterward.
  private professionalManuallySet = false;

  constructor() {
    if (this.customerId) {
      this.customerService
        .getById(this.customerId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (customer) => {
            this.loading.set(false);
            // emitEvent: false — patching the persisted isProfessional here
            // must not be immediately overwritten by the auto-follow
            // subscription below, which would wrongly force it back to
            // Boolean(companyName || siret) even for a deliberately-set
            // sole-trader professional with no companyName/siret on file.
            this.form.patchValue(
              {
                name: customer.name,
                isProfessional: customer.isProfessional,
                companyName: customer.companyName ?? '',
                address: customer.address ?? '',
                email: customer.email ?? '',
                phone: customer.phone ?? '',
                siret: customer.siret ?? '',
                description: customer.description ?? '',
              },
              { emitEvent: false },
            );
          },
          error: () => {
            this.loading.set(false);
            this.errorMessage.set('Impossible de charger ce client.');
          },
        });
    }

    merge(this.form.controls.companyName.valueChanges, this.form.controls.siret.valueChanges)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.professionalManuallySet) {
          return;
        }
        const derived = Boolean(
          this.form.controls.companyName.value || this.form.controls.siret.value,
        );
        this.form.controls.isProfessional.setValue(derived, { emitEvent: false });
      });
  }

  // The one direct interaction with the checkbox — locks in the artisan's
  // own choice from here on, same "own declaration, never a lock the app
  // silently overrides" spirit as the field itself (see
  // schema.prisma's comment on Customer.isProfessional).
  protected onProfessionalCheckboxClick(): void {
    this.professionalManuallySet = true;
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
      isProfessional: value.isProfessional,
      companyName: value.companyName || undefined,
      address: value.address || undefined,
      email: value.email || undefined,
      phone: value.phone || undefined,
      siret: value.siret || undefined,
      description: value.description || undefined,
    };

    this.saving.set(true);
    this.errorMessage.set(null);
    this.catalogLimitReached.set(false);

    const request = this.customerId
      ? this.customerService.update(this.customerId, payload)
      : this.customerService.create(payload);

    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this.toastService.success(this.isEditing ? 'Client modifié.' : 'Client enregistré.');
        void this.router.navigate(['/clients']);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        const limitMessage = catalogLimitMessage(error);
        if (limitMessage) {
          this.catalogLimitReached.set(true);
          this.errorMessage.set(limitMessage);
        } else {
          this.errorMessage.set('Erreur lors de l’enregistrement. Veuillez réessayer.');
        }
      },
    });
  }

  protected goToSubscribe(): void {
    void this.router.navigateByUrl('/abonnement');
  }
}
