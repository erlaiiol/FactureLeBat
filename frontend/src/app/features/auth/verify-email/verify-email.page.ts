import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, of, switchMap } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';

type VerifyState = 'loading' | 'success' | 'error';

@Component({
  selector: 'app-verify-email-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './verify-email.page.html',
})
export class VerifyEmailPage {
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);

  protected readonly state = signal<VerifyState>('loading');

  constructor() {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.state.set('error');
      return;
    }
    this.authService
      .verifyEmail(token)
      .pipe(
        // Forces a fresh access token so currentUser().emailVerified flips
        // to true immediately (the JWT's emailVerified claim would
        // otherwise only catch up whenever it next expires/refreshes) —
        // the verification banner elsewhere in the app disappears right
        // away instead of up to 15 minutes later. Best-effort: a failure
        // here shouldn't turn a successful verification into an error page.
        switchMap(() => this.authService.refreshSession().pipe(catchError(() => of(null)))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => this.state.set('success'),
        error: () => this.state.set('error'),
      });
  }
}
