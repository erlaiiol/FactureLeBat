import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { BillingService } from '../../core/services/billing.service';
import { CompanyService } from '../../core/services/company.service';
import { LegalStatus } from '../../core/models/company.model';
import {
  ESSENTIAL_COMPANY_FIELD_LABELS,
  EssentialCompanyField,
} from '../../core/models/company-essentials.util';
import { DeclarationFrequency } from '../../core/models/report.model';
import { MailSettingsService } from '../../core/services/mail-settings.service';
import { ReceivedInvoiceService } from '../../core/services/received-invoice.service';
import { ToastService } from '../../core/services/toast.service';
import { BigButtonComponent } from '../../shared/components/big-button.component';
import { FieldHintComponent } from '../../shared/components/field-hint.component';
import { TourService } from '../../shared/tour/tour.service';
import { delayedSkeleton } from '../../shared/utils/delayed-skeleton';
import {
  daysUntil,
  E_INVOICING_EMISSION_DEADLINE,
  E_INVOICING_RECEPTION_DEADLINE,
} from '../../core/utils/e-invoicing-deadlines.util';

@Component({
  selector: 'app-company-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, BigButtonComponent, FieldHintComponent],
  templateUrl: './company-settings.page.html',
})
export class CompanySettingsPage {
  private readonly companyService = inject(CompanyService);
  private readonly mailSettingsService = inject(MailSettingsService);
  private readonly receivedInvoiceService = inject(ReceivedInvoiceService);
  private readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly tourService = inject(TourService);
  protected readonly billingService = inject(BillingService);

  // First-invoice-pipeline reversal: this page is no longer a forced
  // first-run gate (see guest.guard.ts, InvoiceDraftStore.vatRegimeConfirmed,
  // CompanyEssentialsGateService) — this stays as a purely informational,
  // never-blocking indicator of what's still missing for a legally valid
  // invoice, computed straight off the form's own validators.
  private readonly essentialControlNames = Object.keys(
    ESSENTIAL_COMPANY_FIELD_LABELS,
  ) as EssentialCompanyField[];
  protected readonly missingEssentials = signal<string[]>([]);

  // BTP mandatory mention (art. L243-2 du Code des assurances): the three
  // detail fields below only become Validators.required while
  // decennialInsuranceApplicable is checked — see setDecennialValidators.
  private readonly decennialControlNames = [
    'decennialInsurerName',
    'decennialInsurancePolicyNumber',
    'decennialInsuranceCoverageArea',
  ] as const;

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

  // Phase 1.2-4 (2026 e-invoicing reform): SUPER PDP connection status —
  // `configured` is app-wide (SUPERPDP_CLIENT_ID/SECRET set on this
  // deployment at all), `connected` is per-company (this artisan completed
  // the OAuth2 consent). Same "boots fine without it, gate the button
  // instead" posture as billing's own stripeConfigured.
  protected readonly superPdpConfigured = signal(false);
  protected readonly superPdpConnected = signal(false);
  protected readonly superPdpStatusLoading = signal(true);
  protected readonly superPdpBusy = signal(false);

  // Phase 1.2-6 (2026 e-invoicing reform): deadline-awareness copy — computed
  // once from the real clock, not re-derived per render (a settings page
  // visit doesn't need to tick live). Reception count is null until the
  // artisan is actually connected (there's nothing to have received
  // otherwise), matching the "connect first" posture the reception inbox
  // itself (1.2-5) already uses.
  protected readonly reception = {
    deadline: E_INVOICING_RECEPTION_DEADLINE,
    daysLeft: daysUntil(E_INVOICING_RECEPTION_DEADLINE),
  };
  protected readonly emission = {
    deadline: E_INVOICING_EMISSION_DEADLINE,
    daysLeft: daysUntil(E_INVOICING_EMISSION_DEADLINE),
  };
  protected readonly receivedInvoiceCount = signal<number | null>(null);
  // Phase 1.3-7 (2026 e-invoicing reform, workflow automation): a plain
  // UI-only reveal for the "En savoir plus sur vos obligations" disclosure
  // — closed by default, no persistence across visits (not a preference
  // worth remembering, unlike e.g. the SMTP section's own expanded state).
  protected readonly obligationsExpanded = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    siret: ['', [Validators.required, Validators.pattern(/^\d{14}$/)]],
    // Phase 1.2-2 (2026 e-invoicing reform): optional, blank for a
    // franchise-en-base artisan who has no VAT number at all.
    vatNumber: ['', Validators.pattern(/^FR[0-9A-Z]{2}\d{9}$/)],
    addressLine1: ['', Validators.required],
    addressLine2: [''],
    postalCode: ['', Validators.required],
    city: ['', Validators.required],
    email: [''],
    phone: [''],
    invoiceMailCustomMessage: ['', Validators.maxLength(500)],
    legalStatus: ['MICRO_ENTREPRENEUR' as LegalStatus, Validators.required],
    // Entered as a plain percentage (e.g. 20) and converted to basis points on submit.
    vatRatePercent: [20, [Validators.required, Validators.min(0), Validators.max(100)]],
    // Phase 17: which period the quarterly report screen preselects.
    declarationFrequency: ['TRIMESTRIELLE' as DeclarationFrequency, Validators.required],
    // Entered as a plain euro amount and converted to cents on submit — null
    // (not 0) means "no ceiling set", same "null is the not-set value"
    // convention as ProductFormPage's packagingQuantity.
    microEntrepreneurCeilingEuros: this.fb.control<number | null>(null, Validators.min(0)),
    // Phase 1.1-3: entered as a plain percentage, converted to basis points
    // on submit — same null-means-unset convention as
    // microEntrepreneurCeilingEuros above.
    defaultDepositPercent: this.fb.control<number | null>(null, [
      Validators.min(0),
      Validators.max(100),
    ]),
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
    // BTP mandatory mention (art. L243-2 du Code des assurances) — the three
    // detail fields below only become Validators.required while this is
    // checked (see the valueChanges subscription in the constructor).
    decennialInsuranceApplicable: [false],
    decennialInsurerName: [''],
    decennialInsurancePolicyNumber: [''],
    decennialInsuranceCoverageArea: [''],
    // Phase 1.1-6: free-text footer mention, independently toggleable per
    // document type — no cross-field validators, unlike the decennial
    // fields above, since an artisan is free to enable a toggle before
    // writing the message.
    customFooterMessage: ['', Validators.maxLength(1000)],
    customFooterOnFacture: [false],
    customFooterOnDevis: [false],
    // Phase 1.1-7: Art. L441-9's escompte-policy mention — pre-filled by the
    // backend's own DB default (see schema.prisma's comment on
    // Company.earlyPaymentDiscountMention), editable like every other
    // footer field above.
    earlyPaymentDiscountMention: ['', Validators.maxLength(500)],
    // Phase 1.1-8 (2026 e-invoicing reform): "option pour le paiement de la
    // taxe d'après les débits" — same plain boolean toggle as
    // customFooterOnFacture above.
    vatOnDebitsOption: [false],
    // Phase 1.3-1 (2026 e-invoicing reform, workflow automation): three
    // independent toggles for how hands-off the pipeline should be — see
    // schema.prisma's comment on Company.autoAttachFacturX and friends.
    // autoTransmitViaPa/autoSyncReceivedInvoices are rendered disabled in
    // the template until superPdpConnected() (see the "Facturation
    // électronique" section below), but still live in this same form group
    // so a save always sends all three regardless of which are editable
    // right now.
    autoAttachFacturX: [false],
    autoTransmitViaPa: [false],
    autoSyncReceivedInvoices: [false],
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
            vatNumber: profile.vatNumber ?? '',
            addressLine1: profile.addressLine1,
            addressLine2: profile.addressLine2 ?? '',
            postalCode: profile.postalCode,
            city: profile.city,
            email: profile.email ?? '',
            phone: profile.phone ?? '',
            invoiceMailCustomMessage: profile.invoiceMailCustomMessage ?? '',
            legalStatus: profile.legalStatus,
            vatRatePercent: profile.vatRateBasisPoints / 100,
            declarationFrequency: profile.declarationFrequency,
            microEntrepreneurCeilingEuros: profile.microEntrepreneurCeiling
              ? profile.microEntrepreneurCeiling / 100
              : null,
            defaultDepositPercent: profile.defaultDepositPercentageBasisPoints
              ? profile.defaultDepositPercentageBasisPoints / 100
              : null,
            cotisationVentePercent: profile.cotisationVenteBasisPoints / 100,
            cotisationPrestationBicPercent: profile.cotisationPrestationBicBasisPoints / 100,
            cotisationPrestationBncPercent: profile.cotisationPrestationBncBasisPoints / 100,
            versementLiberatoireOptIn: profile.versementLiberatoireOptIn,
            decennialInsuranceApplicable: profile.decennialInsuranceApplicable,
            decennialInsurerName: profile.decennialInsurerName ?? '',
            decennialInsurancePolicyNumber: profile.decennialInsurancePolicyNumber ?? '',
            decennialInsuranceCoverageArea: profile.decennialInsuranceCoverageArea ?? '',
            customFooterMessage: profile.customFooterMessage ?? '',
            customFooterOnFacture: profile.customFooterOnFacture,
            customFooterOnDevis: profile.customFooterOnDevis,
            earlyPaymentDiscountMention: profile.earlyPaymentDiscountMention ?? '',
            vatOnDebitsOption: profile.vatOnDebitsOption,
            autoAttachFacturX: profile.autoAttachFacturX,
            autoTransmitViaPa: profile.autoTransmitViaPa,
            autoSyncReceivedInvoices: profile.autoSyncReceivedInvoices,
          });
          this.missingEssentials.set(this.computeMissingEssentials());
        },
        error: () => {
          this.loading.set(false);
          this.errorMessage.set("Impossible de charger les informations de l'entreprise.");
        },
      });

    // Purely informational — kept live as the artisan types, no blocking
    // behavior attached (see CompanyEssentialsGateService for the actual
    // gate, at PDF-send/download time rather than on this page).
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.missingEssentials.set(this.computeMissingEssentials()));

    // Same "only required while the box is checked" pattern as
    // microEntrepreneurCeilingEuros being optional — an artisan outside the
    // BTP never has to see these three fields turn red.
    this.form.controls.decennialInsuranceApplicable.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((applicable) => this.setDecennialValidators(applicable));
    this.setDecennialValidators(this.form.controls.decennialInsuranceApplicable.value);

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

    this.companyService
      .getSuperPdpStatus()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (status) => {
          this.superPdpStatusLoading.set(false);
          this.superPdpConfigured.set(status.configured);
          this.superPdpConnected.set(status.connected);
          if (status.connected) {
            this.loadReceivedInvoiceCount();
          }
        },
        error: () => {
          this.superPdpStatusLoading.set(false);
        },
      });

    // The backend redirects back here with ?super_pdp=connected|error after
    // the artisan completes (or fails/cancels) the OAuth2 consent —
    // stripped from the URL immediately so a page refresh doesn't re-show
    // the toast.
    const superPdpParam = this.route.snapshot.queryParamMap.get('super_pdp');
    if (superPdpParam === 'connected') {
      this.superPdpConnected.set(true);
      this.loadReceivedInvoiceCount();
      this.toastService.success('SUPER PDP connecté avec succès.');
      this.router.navigate([], { queryParams: {}, replaceUrl: true });
    } else if (superPdpParam === 'error') {
      this.toastService.error('La connexion à SUPER PDP a échoué. Réessayez.');
      this.router.navigate([], { queryParams: {}, replaceUrl: true });
    }

    // Phase 1.3-1: autoTransmitViaPa/autoSyncReceivedInvoices only make
    // sense once SUPER PDP is connected — kept disabled via the reactive
    // form's own control.disable()/enable() (never the template `disabled`
    // attribute directly on a formControlName element, which reactive forms
    // explicitly warns against) so the two stay in lockstep with
    // superPdpConnected() regardless of which of the three places sets it
    // (initial status fetch, the OAuth callback redirect, disconnecting).
    effect(() => {
      const gatedControls = [
        this.form.controls.autoTransmitViaPa,
        this.form.controls.autoSyncReceivedInvoices,
      ];
      for (const control of gatedControls) {
        if (this.superPdpConnected()) {
          control.enable({ emitEvent: false });
        } else {
          control.disable({ emitEvent: false });
        }
      }
    });
  }

  // A real browser navigation (not an HttpClient call) — GET /company/
  // super-pdp/connect 302s straight to SUPER PDP's own consent screen.
  protected connectSuperPdp(): void {
    window.location.href = this.companyService.superPdpConnectUrl();
  }

  protected disconnectSuperPdp(): void {
    if (this.superPdpBusy()) {
      return;
    }
    this.superPdpBusy.set(true);
    this.companyService
      .disconnectSuperPdp()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.superPdpBusy.set(false);
          this.superPdpConnected.set(false);
          this.receivedInvoiceCount.set(null);
          this.toastService.success('SUPER PDP déconnecté.');
        },
        error: () => {
          this.superPdpBusy.set(false);
          this.toastService.error('Impossible de déconnecter SUPER PDP pour le moment.');
        },
      });
  }

  // Read-only count for the readiness summary — reuses the reception
  // inbox's own list() (locally-stored invoices, no live SUPER PDP call),
  // never triggers a sync from here.
  private loadReceivedInvoiceCount(): void {
    this.receivedInvoiceService
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (invoices) => this.receivedInvoiceCount.set(invoices.length),
        error: () => this.receivedInvoiceCount.set(null),
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
        vatNumber: value.vatNumber || undefined,
        addressLine1: value.addressLine1,
        addressLine2: value.addressLine2 || undefined,
        postalCode: value.postalCode,
        city: value.city,
        email: value.email || undefined,
        phone: value.phone || undefined,
        invoiceMailCustomMessage: value.invoiceMailCustomMessage || undefined,
        legalStatus: value.legalStatus,
        vatRateBasisPoints: Math.round(value.vatRatePercent * 100),
        declarationFrequency: value.declarationFrequency,
        microEntrepreneurCeiling:
          value.microEntrepreneurCeilingEuros != null
            ? Math.round(value.microEntrepreneurCeilingEuros * 100)
            : undefined,
        defaultDepositPercentageBasisPoints:
          value.defaultDepositPercent != null
            ? Math.round(value.defaultDepositPercent * 100)
            : undefined,
        cotisationVenteBasisPoints: Math.round(value.cotisationVentePercent * 100),
        cotisationPrestationBicBasisPoints: Math.round(value.cotisationPrestationBicPercent * 100),
        cotisationPrestationBncBasisPoints: Math.round(value.cotisationPrestationBncPercent * 100),
        versementLiberatoireOptIn: value.versementLiberatoireOptIn,
        decennialInsuranceApplicable: value.decennialInsuranceApplicable,
        decennialInsurerName: value.decennialInsuranceApplicable
          ? value.decennialInsurerName
          : undefined,
        decennialInsurancePolicyNumber: value.decennialInsuranceApplicable
          ? value.decennialInsurancePolicyNumber
          : undefined,
        decennialInsuranceCoverageArea: value.decennialInsuranceApplicable
          ? value.decennialInsuranceCoverageArea
          : undefined,
        customFooterMessage: value.customFooterMessage || undefined,
        customFooterOnFacture: value.customFooterOnFacture,
        customFooterOnDevis: value.customFooterOnDevis,
        earlyPaymentDiscountMention: value.earlyPaymentDiscountMention || undefined,
        vatOnDebitsOption: value.vatOnDebitsOption,
        autoAttachFacturX: value.autoAttachFacturX,
        autoTransmitViaPa: value.autoTransmitViaPa,
        autoSyncReceivedInvoices: value.autoSyncReceivedInvoices,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.saved.set(true);
          this.missingEssentials.set(this.computeMissingEssentials());
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

  private computeMissingEssentials(): string[] {
    return this.essentialControlNames
      .filter((name) => this.form.controls[name].invalid)
      .map((name) => ESSENTIAL_COMPANY_FIELD_LABELS[name]);
  }

  // Toggles Validators.required on the three decennial detail fields —
  // called both on every decennialInsuranceApplicable change and once at
  // startup, since the form starts with the box unchecked before the real
  // profile value is patched in above.
  private setDecennialValidators(applicable: boolean): void {
    const validators = applicable ? [Validators.required] : [];
    for (const name of this.decennialControlNames) {
      const control = this.form.controls[name];
      control.setValidators(validators);
      control.updateValueAndValidity({ emitEvent: false });
    }
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
