import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CompanyProfile, UpdateCompanyRequest } from '../../core/models/company.model';
import { CompanyEssentialsGateService } from '../../core/services/company-essentials-gate.service';
import { CompanyService } from '../../core/services/company.service';
import { ToastService } from '../../core/services/toast.service';
import { BigButtonComponent } from './big-button.component';
import { FieldHintComponent } from './field-hint.component';
import { IconCloseComponent } from './icon-close.component';

function toUpdateCompanyRequest(profile: CompanyProfile): UpdateCompanyRequest {
  return {
    name: profile.name,
    siret: profile.siret,
    addressLine1: profile.addressLine1,
    addressLine2: profile.addressLine2 ?? undefined,
    postalCode: profile.postalCode,
    city: profile.city,
    email: profile.email ?? undefined,
    phone: profile.phone ?? undefined,
    invoiceMailCustomMessage: profile.invoiceMailCustomMessage ?? undefined,
    legalStatus: profile.legalStatus,
    vatRateBasisPoints: profile.vatRateBasisPoints,
    invoiceNumberPrefix: profile.invoiceNumberPrefix,
    declarationFrequency: profile.declarationFrequency,
    microEntrepreneurCeiling: profile.microEntrepreneurCeiling ?? undefined,
    defaultDepositPercentageBasisPoints: profile.defaultDepositPercentageBasisPoints ?? undefined,
    cotisationVenteBasisPoints: profile.cotisationVenteBasisPoints,
    cotisationPrestationBicBasisPoints: profile.cotisationPrestationBicBasisPoints,
    cotisationPrestationBncBasisPoints: profile.cotisationPrestationBncBasisPoints,
    versementLiberatoireOptIn: profile.versementLiberatoireOptIn,
    decennialInsuranceApplicable: profile.decennialInsuranceApplicable,
    decennialInsurerName: profile.decennialInsurerName ?? undefined,
    decennialInsurancePolicyNumber: profile.decennialInsurancePolicyNumber ?? undefined,
    decennialInsuranceCoverageArea: profile.decennialInsuranceCoverageArea ?? undefined,
    customFooterMessage: profile.customFooterMessage ?? undefined,
    customFooterOnFacture: profile.customFooterOnFacture,
    customFooterOnDevis: profile.customFooterOnDevis,
    earlyPaymentDiscountMention: profile.earlyPaymentDiscountMention ?? undefined,
    vatOnDebitsOption: profile.vatOnDebitsOption,
  };
}

// First-invoice-pipeline reversal: the tier-2 gate — mounted once at the app
// root (app.html), same "one shared overlay, triggered from anywhere"
// pattern as PaywallModalComponent. Only the 5 fields that print as legal
// mentions on the PDF (see company-essentials.util.ts) — never the full
// 567-line "Mon entreprise" form — so completing it takes seconds, not a
// detour through every VAT/URSSAF/SMTP section.
@Component({
  selector: 'app-company-essentials-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, BigButtonComponent, FieldHintComponent, IconCloseComponent],
  templateUrl: './company-essentials-modal.component.html',
})
export class CompanyEssentialsModalComponent {
  protected readonly gateService = inject(CompanyEssentialsGateService);
  private readonly companyService = inject(CompanyService);
  private readonly toastService = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  // The full profile, fetched fresh every time the modal opens — needed so
  // submit() can spread it into the PATCH /company full-replace payload
  // (UpdateCompanyDto requires every editable field, not just these 5 — see
  // CompanyRepository.update's own comment on why).
  private currentProfile: CompanyProfile | null = null;

  protected readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    siret: ['', [Validators.required, Validators.pattern(/^\d{14}$/)]],
    addressLine1: ['', Validators.required],
    postalCode: ['', Validators.required],
    city: ['', Validators.required],
  });

  constructor() {
    // Refetches on every open rather than once — the artisan may have
    // changed company data elsewhere (another tab, "Mon entreprise") since
    // this modal last closed.
    effect(() => {
      if (!this.gateService.visible()) {
        return;
      }
      this.loading.set(true);
      this.form.reset();
      this.companyService
        .getProfile()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (profile) => {
            this.loading.set(false);
            this.currentProfile = profile;
            this.form.patchValue({
              name: profile.name,
              siret: profile.siret,
              addressLine1: profile.addressLine1,
              postalCode: profile.postalCode,
              city: profile.city,
            });
          },
          error: () => {
            this.loading.set(false);
            this.toastService.error("Impossible de charger les informations de l'entreprise.");
          },
        });
    });
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.gateService.visible()) {
      this.dismiss();
    }
  }

  protected dismiss(): void {
    if (this.saving()) {
      return;
    }
    this.gateService.dismiss();
  }

  protected submit(): void {
    if (this.saving() || !this.currentProfile) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const request = { ...toUpdateCompanyRequest(this.currentProfile), ...this.form.getRawValue() };
    this.companyService
      .updateProfile(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (profile) => {
          this.saving.set(false);
          this.toastService.success(
            'Enregistré ! Complétez le reste (TVA, assurance décennale…) quand vous voulez, dans "Mon entreprise".',
          );
          this.gateService.resolveAfterSave(profile);
        },
        error: () => {
          this.saving.set(false);
          this.toastService.error('Erreur lors de l’enregistrement. Veuillez réessayer.');
        },
      });
  }
}
