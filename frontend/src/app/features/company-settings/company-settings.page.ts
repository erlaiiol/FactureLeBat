import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CompanyService } from '../../core/services/company.service';
import { LegalStatus } from '../../core/models/company.model';
import { MailSettingsService } from '../../core/services/mail-settings.service';
import { BigButtonComponent } from '../../shared/components/big-button.component';
import { FieldHintComponent } from '../../shared/components/field-hint.component';
import { TourService } from '../../shared/tour/tour.service';

@Component({
  selector: 'app-company-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, BigButtonComponent, FieldHintComponent],
  templateUrl: './company-settings.page.html',
})
export class CompanySettingsPage {
  private readonly companyService = inject(CompanyService);
  private readonly mailSettingsService = inject(MailSettingsService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly tourService = inject(TourService);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly toursReplayed = signal(false);

  protected readonly mailLoading = signal(true);
  protected readonly mailSaving = signal(false);
  protected readonly mailSaved = signal(false);
  protected readonly mailErrorMessage = signal<string | null>(null);
  protected readonly mailConfigured = signal(false);

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
          });
        },
        error: () => {
          this.loading.set(false);
          this.errorMessage.set("Impossible de charger les informations de l'entreprise.");
        },
      });

    this.mailSettingsService
      .getSettings()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => {
          this.mailLoading.set(false);
          this.mailConfigured.set(settings.configured);
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
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.saved.set(true);
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

  protected onTourEnabledChange(enabled: boolean): void {
    this.tourService.setTourEnabled(enabled);
  }

  protected replayTours(): void {
    this.tourService.replayTours();
    this.toursReplayed.set(true);
  }
}
