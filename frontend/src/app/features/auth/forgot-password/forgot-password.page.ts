import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { BigButtonComponent } from '../../../shared/components/big-button.component';

@Component({
  selector: 'app-forgot-password-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, BigButtonComponent],
  templateUrl: './forgot-password.page.html',
})
export class ForgotPasswordPage {
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly saving = signal(false);
  // Same message shown on success and on failure — the backend itself
  // never reveals whether the email exists (see AuthService.requestPasswordReset
  // on the backend), so the frontend can't either.
  protected readonly sent = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected submit(): void {
    if (this.saving() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.authService
      .forgotPassword(this.form.getRawValue().email)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.sent.set(true);
        },
        // Even a 503 (mail not configured on this deployment) shows the
        // same neutral confirmation — surfacing "mail is disabled" here
        // would itself be an information leak about the deployment.
        error: () => {
          this.saving.set(false);
          this.sent.set(true);
        },
      });
  }
}
