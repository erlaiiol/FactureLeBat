import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { BillingService } from '../../core/services/billing.service';
import { CompanyService } from '../../core/services/company.service';
import { LegalStatus } from '../../core/models/company.model';
import { DeclarationFrequency } from '../../core/models/report.model';
import { MailSettingsService } from '../../core/services/mail-settings.service';
import { ToastService } from '../../core/services/toast.service';
import { BigButtonComponent } from '../../shared/components/big-button.component';
import { FieldHintComponent } from '../../shared/components/field-hint.component';
import { TourService } from '../../shared/tour/tour.service';
import { delayedSkeleton } from '../../shared/utils/delayed-skeleton';

@Component({
  selector: 'app-company-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, BigButtonComponent, FieldHintComponent],
  templateUrl: './company-settings.page.html',
})
export class CompanySettingsPage {
  private readonly companyService = inject(CompanyService);
  private readonly mailSettingsService = inject(MailSettingsService);
  private readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly tourService = inject(TourService);
  protected readonly billingService = inject(BillingService);

  // Set by guestGuard's '?onboarding=1' when it routed a freshly
  // registered/logged-in artisan here because their company profile was
  // still the blank one DEFAULT_COMPANY_PROFILE creates at signup — the
  // signal for "continue on to the invoice they were headed for in the
  // first place" once this form is actually saved, rather than leaving them
  // stranded on the settings page with just an inline "Enregistré !".
  protected readonly onboarding = this.route.snapshot.queryParamMap.get('onboarding') === '1';

  // companyOnboardingGuard (app.routes.ts) calls canDeactivate() below on
  // every attempted navigation away from this page — these two signals
  // drive the warning banner that appears the moment that first blocks
  // someone, so "you can't leave yet" comes with a visible reason rather
  // than a silently-cancelled nav.
  private static readonly essentialFieldLabels = {
    name: "Nom de l'entreprise",
    siret: 'SIRET',
    addressLine1: 'Adresse',
    postalCode: 'Code postal',
    city: 'Ville',
    legalStatus: 'Statut',
  } as const;
  private readonly essentialControlNames = Object.keys(
    CompanySettingsPage.essentialFieldLabels,
  ) as (keyof typeof CompanySettingsPage.essentialFieldLabels)[];
  protected readonly onboardingBlocked = signal(false);
  protected readonly missingEssentialFields = signal<string[]>([]);

  // Phase 13 RGPD self-service deletion — a two-step reveal (button ->
  // inline confirm form) rather than a native confirm() dialog, matching
  // this app's own custom-component style everywhere else (e.g.
  // pdf-preview-modal) instead of a browser-native prompt.
  protected readonly deleteAccountRevealed = signal(false);
  protected readonly deleteAccountSaving = signal(false);
  protected readonly deleteAccountError = signal<string | null>(null);
  protected readonly deleteAccountForm = this.fb.nonNullable.group({ password: [''] });

  protected readonly loading = signal(true);
  protected readonly showSkeleton = delayedSkeleton(this.loading);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly toursReplayed = signal(false);

  protected readonly mailLoading = signal(true);
  protected readonly mailShowSkeleton = delayedSkeleton(this.mailLoading);
  protected readonly mailSaving = signal(false);
  protected readonly mailSaved = signal(false);
  protected readonly mailErrorMessage = signal<string | null>(null);
  protected readonly mailConfigured = signal(false);
  // Collapsed by default once we know whether SMTP is already configured —
  // expanded automatically for a first-time visitor (nothing to hide yet),
  // collapsed for someone who's already set it up (nothing to check twice).
  protected readonly smtpExpanded = signal(false);
  protected readonly smtpGuideOpen = signal(false);

  // Logo shown top-right on invoice/devis PDFs (PdfService.buildHeader) once
  // uploaded — see CompanyService.uploadLogo/removeLogo/logoUrl.
  protected readonly hasLogo = signal(false);
  protected readonly logoUploading = signal(false);
  protected readonly logoError = signal<string | null>(null);
  // Bumped on every successful upload/remove so the <img> URL changes and
  // the browser can't serve a stale cached image (GET /company/logo is
  // cacheable for a few minutes — see CompanyController.serveLogo).
  protected readonly logoCacheBust = signal(Date.now());

  protected readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    siret: ['', [Validators.required, Validators.pattern(/^\d{14}$/)]],
    addressLine1: ['', Validators.required],
    addressLine2: [''],
    postalCode: ['', Validators.required],
    city: ['', Validators.required],
    email: [''],
    phone: [''],
    legalStatus: ['MICRO_ENTREPRENEUR' as LegalStatus, Validators.required],
    // Entered as a plain percentage (e.g. 20) and converted to basis points on submit.
    vatRatePercent: [20, [Validators.required, Validators.min(0), Validators.max(100)]],
    // Phase 17: which period the quarterly report screen preselects.
    declarationFrequency: ['TRIMESTRIELLE' as DeclarationFrequency, Validators.required],
    // Entered as a plain euro amount and converted to cents on submit — null
    // (not 0) means "no ceiling set", same "null is the not-set value"
    // convention as ProductFormPage's packagingQuantity.
    microEntrepreneurCeilingEuros: this.fb.control<number | null>(null, Validators.min(0)),
    // Phase 17 (charges estimate): entered as plain percentages, converted
    // to basis points on submit — same boundary-conversion convention as
    // vatRatePercent. Pre-filled with the official rates in effect when this
    // was built (see schema.prisma's comment on
    // Company.cotisationVenteBasisPoints for why they're editable rather
    // than hardcoded).
    cotisationVentePercent: [12.3, [Validators.required, Validators.min(0), Validators.max(100)]],
    cotisationPrestationBicPercent: [
      21.2,
      [Validators.required, Validators.min(0), Validators.max(100)],
    ],
    cotisationPrestationBncPercent: [
      21.1,
      [Validators.required, Validators.min(0), Validators.max(100)],
    ],
    versementLiberatoireOptIn: [false],
  });

  // Phase 12: the artisan's own SMTP account, used to send invoices for
  // real from their address. Password is never prefilled (write-only,
  // never returned by GET) — re-entering it on every save is the deliberate
  // trade-off documented on the backend's UpdateMailSettingsDto.
  protected readonly mailForm = this.fb.nonNullable.group({
    host: ['', Validators.required],
    port: [587, [Validators.required, Validators.min(1), Validators.max(65535)]],
    secure: [true],
    user: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  constructor() {
    this.companyService
      .getProfile()
      // Unsubscribes automatically on destroy: without this, a slow response
      // arriving after the artisan has already navigated away would still
      // try to patch a form that no longer exists in the DOM.
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (profile) => {
          this.loading.set(false);
          this.hasLogo.set(profile.hasLogo);
          this.form.patchValue({
            name: profile.name,
            siret: profile.siret,
            addressLine1: profile.addressLine1,
            addressLine2: profile.addressLine2 ?? '',
            postalCode: profile.postalCode,
            city: profile.city,
            email: profile.email ?? '',
            phone: profile.phone ?? '',
            legalStatus: profile.legalStatus,
            vatRatePercent: profile.vatRateBasisPoints / 100,
            declarationFrequency: profile.declarationFrequency,
            microEntrepreneurCeilingEuros: profile.microEntrepreneurCeiling
              ? profile.microEntrepreneurCeiling / 100
              : null,
            cotisationVentePercent: profile.cotisationVenteBasisPoints / 100,
            cotisationPrestationBicPercent: profile.cotisationPrestationBicBasisPoints / 100,
            cotisationPrestationBncPercent: profile.cotisationPrestationBncBasisPoints / 100,
            versementLiberatoireOptIn: profile.versementLiberatoireOptIn,
          });
        },
        error: () => {
          this.loading.set(false);
          this.errorMessage.set("Impossible de charger les informations de l'entreprise.");
        },
      });

    // Only worth the extra work once a blocked attempt has actually shown
    // the banner — keeps it in sync live as the artisan fixes fields,
    // instead of requiring another failed nav attempt to clear it.
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (!this.onboardingBlocked()) {
        return;
      }
      const missing = this.computeMissingEssentialFields();
      this.missingEssentialFields.set(missing);
      if (missing.length === 0) {
        this.onboardingBlocked.set(false);
      }
    });

    this.mailSettingsService
      .getSettings()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => {
          this.mailLoading.set(false);
          this.mailConfigured.set(settings.configured);
          this.smtpExpanded.set(!settings.configured);
          this.mailForm.patchValue({
            host: settings.host ?? '',
            port: settings.port ?? 587,
            secure: settings.secure,
            user: settings.user ?? '',
          });
        },
        error: () => {
          this.mailLoading.set(false);
          this.mailErrorMessage.set("Impossible de charger la configuration d'envoi d'email.");
        },
      });
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
    this.saving.set(true);
    this.saved.set(false);
    this.errorMessage.set(null);

    this.companyService
      .updateProfile({
        name: value.name,
        siret: value.siret,
        addressLine1: value.addressLine1,
        addressLine2: value.addressLine2 || undefined,
        postalCode: value.postalCode,
        city: value.city,
        email: value.email || undefined,
        phone: value.phone || undefined,
        legalStatus: value.legalStatus,
        vatRateBasisPoints: Math.round(value.vatRatePercent * 100),
        declarationFrequency: value.declarationFrequency,
        microEntrepreneurCeiling:
          value.microEntrepreneurCeilingEuros != null
            ? Math.round(value.microEntrepreneurCeilingEuros * 100)
            : undefined,
        cotisationVenteBasisPoints: Math.round(value.cotisationVentePercent * 100),
        cotisationPrestationBicBasisPoints: Math.round(value.cotisationPrestationBicPercent * 100),
        cotisationPrestationBncBasisPoints: Math.round(value.cotisationPrestationBncPercent * 100),
        versementLiberatoireOptIn: value.versementLiberatoireOptIn,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.saved.set(true);
          if (this.onboarding) {
            // Same "confirm, then move on" delay as ResetPasswordPage — long
            // enough to register the "Enregistré !" before the navigation.
            setTimeout(() => void this.router.navigateByUrl('/factures/nouvelle'), 1200);
          }
        },
        error: () => {
          this.saving.set(false);
          this.errorMessage.set('Erreur lors de l’enregistrement. Veuillez réessayer.');
        },
      });
  }

  protected submitMail(): void {
    if (this.mailSaving()) {
      return; // already in flight — ignore a fast double click/tap
    }
    if (this.mailForm.invalid) {
      this.mailForm.markAllAsTouched();
      return;
    }

    const value = this.mailForm.getRawValue();
    this.mailSaving.set(true);
    this.mailSaved.set(false);
    this.mailErrorMessage.set(null);

    this.mailSettingsService
      .updateSettings(value)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => {
          this.mailSaving.set(false);
          this.mailSaved.set(true);
          this.mailConfigured.set(settings.configured);
          // The password just proved itself against the real SMTP server —
          // clearing it avoids leaving the artisan's app password sitting in
          // the DOM/form state any longer than needed.
          this.mailForm.patchValue({ password: '' });
        },
        // A 400 here means the SMTP connection itself was rejected (bad
        // host/port/credentials) — the backend's message names the actual
        // reason (auth failure, connection refused…), genuinely actionable
        // for the artisan fixing their own SMTP settings, so it's shown
        // as-is rather than replaced with a generic message.
        error: (error: HttpErrorResponse) => {
          this.mailSaving.set(false);
          this.mailErrorMessage.set(
            error.status === 400 && typeof error.error?.message === 'string'
              ? error.error.message
              : "Erreur lors de l'enregistrement. Veuillez réessayer.",
          );
        },
      });
  }

  // companyOnboardingGuard's CanDeactivate hook. Only ever refuses
  // navigation during the first-login redirect (`onboarding=1`) and only
  // for the fields that actually print on an invoice — the VAT/déclaration
  // section below has sane defaults already, so it's never what's blocking
  // someone here.
  // Public, not protected: companyOnboardingGuard (a CanDeactivateFn outside
  // this class) needs to call it directly.
  canDeactivate(): boolean {
    if (!this.onboarding) {
      return true;
    }
    const missing = this.computeMissingEssentialFields();
    if (missing.length === 0) {
      return true;
    }
    this.essentialControlNames.forEach((name) => this.form.controls[name].markAsTouched());
    this.missingEssentialFields.set(missing);
    this.onboardingBlocked.set(true);
    this.toastService.error(
      "Complétez d'abord ces informations avant de continuer — elles apparaissent sur vos factures.",
    );
    return false;
  }

  // Same PNG/JPEG-only, 2 MB bound as CompanyController.uploadLogo — checked
  // client-side purely to fail fast with a clear message; the backend
  // re-validates regardless (magic bytes included), never trusts this.
  protected onLogoFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // lets the same file be re-picked after an error
    if (!file) {
      return;
    }
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      this.logoError.set('Le logo doit être une image PNG ou JPEG.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      this.logoError.set('Le logo ne doit pas dépasser 2 Mo.');
      return;
    }

    this.logoUploading.set(true);
    this.logoError.set(null);
    this.companyService
      .uploadLogo(file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.logoUploading.set(false);
          this.hasLogo.set(true);
          this.logoCacheBust.set(Date.now());
        },
        error: () => {
          this.logoUploading.set(false);
          this.logoError.set("Impossible d'envoyer ce logo pour le moment.");
        },
      });
  }

  protected removeLogo(): void {
    if (this.logoUploading()) {
      return;
    }
    this.logoUploading.set(true);
    this.logoError.set(null);
    this.companyService
      .removeLogo()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.logoUploading.set(false);
          this.hasLogo.set(false);
        },
        error: () => {
          this.logoUploading.set(false);
          this.logoError.set('Impossible de retirer ce logo pour le moment.');
        },
      });
  }

  protected logoUrl(): string {
    return this.companyService.logoUrl(this.logoCacheBust());
  }

  private computeMissingEssentialFields(): string[] {
    return this.essentialControlNames
      .filter((name) => this.form.controls[name].invalid)
      .map((name) => CompanySettingsPage.essentialFieldLabels[name]);
  }

  protected onTourEnabledChange(enabled: boolean): void {
    this.tourService
      .setTourEnabled(enabled)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () => this.toastService.error('Impossible de mettre à jour ce réglage.'),
      });
  }

  protected replayTours(): void {
    this.tourService
      .replayTours()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.toursReplayed.set(true),
        error: () => this.toastService.error('Impossible de réinitialiser les visites guidées.'),
      });
  }

  protected confirmDeleteAccount(): void {
    if (this.deleteAccountSaving()) {
      return;
    }
    this.deleteAccountSaving.set(true);
    this.deleteAccountError.set(null);

    const { password } = this.deleteAccountForm.getRawValue();
    this.authService
      .deleteAccount(password || undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toastService.success('Compte supprimé.');
          void this.router.navigateByUrl('/connexion');
        },
        error: (error: HttpErrorResponse) => {
          this.deleteAccountSaving.set(false);
          this.deleteAccountError.set(
            error.status === 403
              ? 'Mot de passe incorrect.'
              : 'Erreur lors de la suppression. Veuillez réessayer.',
          );
        },
      });
  }
}
