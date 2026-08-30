import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { DemoProfile } from '../../../core/models/auth.model';
import {
  GoogleNativeLoginCancelledError,
  GoogleNativeLoginService,
} from '../../../core/services/google-native-login.service';
import { PlatformService } from '../../../core/services/platform.service';
import { BigButtonComponent } from '../../../shared/components/big-button.component';
import { IconAppleComponent } from '../../../shared/components/icon-apple.component';
import { IconEyeComponent } from '../../../shared/components/icon-eye.component';
import { IconEyeOffComponent } from '../../../shared/components/icon-eye-off.component';
import { IconGoogleComponent } from '../../../shared/components/icon-google.component';
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
    IconGoogleComponent,
    IconAppleComponent,
  ],
  templateUrl: './login.page.html',
})
export class LoginPage {
  private readonly authService = inject(AuthService);
  private readonly googleNativeLoginService = inject(GoogleNativeLoginService);
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

  // Native counterpart to the [href]="googleLoginUrl" anchor rendered on
  // web (see login.page.html) — the app shell can't use that browser
  // redirect at all, see GoogleNativeLoginService for why.
  protected async googleLoginNative(): Promise<void> {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);

    try {
      const idToken = await this.googleNativeLoginService.login();
      await firstValueFrom(this.authService.googleTokenLogin(idToken));
      void this.router.navigateByUrl('/');
    } catch (error) {
      if (!(error instanceof GoogleNativeLoginCancelledError)) {
        // The toast below is deliberately generic (Google Cloud Console
        // misconfig vs a real outage look identical to an artisan) — this
        // is the one place the real reason survives, visible via
        // chrome://inspect (CAPACITOR_DEBUG=1 make android-prod) instead of
        // guessing blind. See docs/deployment.md's Native Google Sign-In
        // section for the Android OAuth client / SHA-1 checklist this
        // usually turns out to be.
        console.error('Google native login failed:', error);
        this.errorMessage.set('Connexion avec Google indisponible.');
      }
    } finally {
      this.saving.set(false);
    }
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
