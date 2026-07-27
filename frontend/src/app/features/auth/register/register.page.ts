import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { PlatformService } from '../../../core/services/platform.service';
import { ReferralService } from '../../../core/services/referral.service';
import { BigButtonComponent } from '../../../shared/components/big-button.component';
import { ReferralCodePromptComponent } from '../../../shared/components/referral-code-prompt.component';

@Component({
  selector: 'app-register-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, BigButtonComponent, ReferralCodePromptComponent],
  templateUrl: './register.page.html',
})
export class RegisterPage {
  private readonly authService = inject(AuthService);
  private readonly referralService = inject(ReferralService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly platformService = inject(PlatformService);

  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly googleLoginUrl = this.authService.googleLoginUrl();

  // Phase 29: a tapped referral link (web share, or a mobile Universal/App
  // Link — see app.component's appUrlOpen listener) carries ?ref=CODE.
  // Prefilled here but never locked — same "autofill, not a lock"
  // convention as every other prefill in this app (see conventions.md):
  // the field below stays fully editable.
  protected readonly refCodeFromQuery = this.route.snapshot.queryParamMap.get('ref');

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    // Mandatory — see RegisterDto.acceptTerms on the backend. Deliberately
    // its own control, never bundled with newsletterOptIn below.
    acceptTerms: [false, Validators.requiredTrue],
    // Unchecked by default — RGPD requires this stay an independent,
    // explicit opt-in.
    newsletterOptIn: [false],
    referralCode: [this.refCodeFromQuery ?? ''],
  });

  // Live feedback only — never blocks submission (see RegisterDto.referralCode
  // on the backend: an unknown/invalid code is always silently ignored
  // rather than rejected). null = no code typed yet / feedback still in
  // flight, true/false = the last debounced check's result.
  protected readonly referralCodeValid = signal<boolean | null>(null);

  constructor() {
    this.form.controls.referralCode.valueChanges
      .pipe(
        debounceTime(400),
        distinctUntilChanged(),
        switchMap((code) => {
          const trimmed = code.trim();
          if (!trimmed) {
            this.referralCodeValid.set(null);
            return [];
          }
          return this.referralService.validateCode(trimmed);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ valid }) => this.referralCodeValid.set(valid),
        error: () => this.referralCodeValid.set(null),
      });
  }

  protected onReferralCodeConfirmed(code: string): void {
    this.form.controls.referralCode.setValue(code);
  }

  protected submit(): void {
    if (this.saving()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);

    const { referralCode, ...rest } = this.form.getRawValue();
    this.authService
      .register({ ...rest, referralCode: referralCode.trim() || undefined })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          void this.router.navigateByUrl('/');
        },
        error: (error: HttpErrorResponse) => {
          this.saving.set(false);
          this.errorMessage.set(
            error.status === 409
              ? 'Un compte existe déjà avec cet email.'
              : 'Erreur lors de la création du compte. Veuillez réessayer.',
          );
        },
      });
  }
}
