import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { DemoProfile } from '../../../core/models/auth.model';
import { PlatformService } from '../../../core/services/platform.service';
import { BigButtonComponent } from '../../../shared/components/big-button.component';
import { IconEyeComponent } from '../../../shared/components/icon-eye.component';
import { IconEyeOffComponent } from '../../../shared/components/icon-eye-off.component';
import { ReferralCodePromptComponent } from '../../../shared/components/referral-code-prompt.component';

@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    BigButtonComponent,
    ReferralCodePromptComponent,
    IconEyeComponent,
    IconEyeOffComponent,
  ],
  templateUrl: './login.page.html',
})
export class LoginPage {
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  protected readonly platformService = inject(PlatformService);

  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly googleLoginUrl = this.authService.googleLoginUrl();
  protected readonly passwordVisible = signal(false);

  // Empty on every real deployment (DEMO_MODE unset server-side, see
  // AuthService.getDemoProfiles on the backend) — the section below simply
  // doesn't render in that case.
  protected readonly demoProfiles = signal<DemoProfile[]>([]);

  // "Rester connecté" defaults checked — matches the product's low-friction
  // philosophy (docs/roadmap.md Phase 13).
  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
    rememberMe: [true],
  });

  constructor() {
    this.authService
      .demoProfiles()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (profiles) => this.demoProfiles.set(profiles),
        // A demo-less deployment never having this route matter is the
        // common case — fail silently, same as the section just not
        // rendering when the list is empty.
        error: () => this.demoProfiles.set([]),
      });
  }

  // Login itself never creates an account — confirming a code here just
  // routes to /inscription with it attached, same as tapping a shared
  // referral link would (see register.page.ts's refCodeFromQuery/autofill).
  protected onReferralCodeConfirmed(code: string): void {
    void this.router.navigate(['/inscription'], { queryParams: { ref: code } });
  }

  protected demoLogin(key: string): void {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);

    this.authService
      .demoLogin(key)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          void this.router.navigateByUrl('/');
        },
        error: () => {
          this.saving.set(false);
          this.errorMessage.set('Connexion démo indisponible.');
        },
      });
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

    this.authService
      .login(this.form.getRawValue())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          void this.router.navigateByUrl('/');
        },
        error: () => {
          this.saving.set(false);
          this.errorMessage.set('Email ou mot de passe incorrect.');
        },
      });
  }
}
