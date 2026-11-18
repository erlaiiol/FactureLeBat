import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import {
  Observable,
  catchError,
  finalize,
  map,
  of,
  shareReplay,
  switchMap,
  tap,
  throwError,
} from 'rxjs';
import { environment } from '../../../environments/environment';
import { DemoProfile, LoginRequest, PublicUser, RegisterRequest } from '../models/auth.model';
import { isNetworkError } from '../utils/is-network-error.util';
import { isSessionEpochOutdated, markSessionEpochCurrent } from './session-epoch';
import { ToastService } from './toast.service';

// Auth session state, providedIn: 'root' — same "shared, constructed-once"
// pattern as ThemeService/TourService/InvoiceDraftStore. Tokens themselves
// never touch this service: they live in httpOnly cookies the browser
// manages on its own, so there is nothing to persist here beyond the
// current user snapshot (and that snapshot is intentionally NOT persisted
// to localStorage — a page refresh always re-derives it from the server via
// fetchMe(), which is the only source of truth for "am I actually still
// logged in").
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly baseUrl = `${environment.apiBaseUrl}/auth`;

  readonly currentUser = signal<PublicUser | null>(null);
  readonly isAuthenticated = computed(() => this.currentUser() !== null);

  // Memoized so the app only ever calls GET /auth/me once at boot (the
  // authGuard on every top-level route awaits this) — repeated navigations
  // reuse the same in-flight/completed request instead of re-checking the
  // server on every route change.
  private meRequest: Observable<PublicUser | null> | null = null;

  // Dedupes concurrent silent-refresh attempts (see authRefreshInterceptor):
  // several requests can 401 at once when the access token expires, and
  // they must all wait on the SAME refresh call rather than each firing
  // their own — unlike meRequest above, this is cleared once the call
  // settles so a later 401 can trigger a fresh refresh.
  private refreshInFlight$: Observable<PublicUser> | null = null;

  register(payload: RegisterRequest): Observable<PublicUser> {
    return this.http
      .post<PublicUser>(`${this.baseUrl}/register`, payload, { withCredentials: true })
      .pipe(tap((user) => this.signedIn(user)));
  }

  login(payload: LoginRequest): Observable<PublicUser> {
    return this.http
      .post<PublicUser>(`${this.baseUrl}/login`, payload, { withCredentials: true })
      .pipe(tap((user) => this.signedIn(user)));
  }

  // Always safe to call, DEMO_MODE or not — resolves to [] rather than
  // erroring when it's off, so the login page can render nothing instead of
  // a quick-login section that would 503 on click.
  demoProfiles(): Observable<DemoProfile[]> {
    return this.http.get<DemoProfile[]>(`${this.baseUrl}/demo-profiles`);
  }

  demoLogin(key: string): Observable<PublicUser> {
    return this.http
      .post<PublicUser>(`${this.baseUrl}/demo-login`, { key }, { withCredentials: true })
      .pipe(tap((user) => this.signedIn(user)));
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/logout`, {}, { withCredentials: true }).pipe(
      tap(() => {
        this.currentUser.set(null);
        this.meRequest = null;
      }),
    );
  }

  // Called by authGuard/guestGuard on every top-level navigation. Resolves
  // to null (not an error) on a 401 — "not logged in" is an expected
  // outcome, not a failure the console should scream about. A genuine
  // network failure (no wifi/4G on a cold app launch, or a request that
  // never resolves at all — see isNetworkError) is a different situation
  // entirely: the artisan might have a perfectly valid session, they just
  // have no signal, so this rethrows instead of collapsing it into the same
  // "not logged in" outcome — both guards catch it and route to
  // OfflinePage rather than showing a misleading login form.
  //
  // Checks the signal first: register()/login() set currentUser directly
  // without going through this method, so a guard check right after either
  // one must trust that fresh state rather than replaying whatever
  // meRequest cached from an earlier (pre-login) call — otherwise the very
  // first protected navigation after registering would incorrectly bounce
  // back to /connexion on a stale "not logged in" result.
  ensureLoaded(): Observable<PublicUser | null> {
    const current = this.currentUser();
    if (current) {
      return of(current);
    }
    if (!this.meRequest) {
      this.meRequest = this.http
        .get<PublicUser>(`${this.baseUrl}/me`, { withCredentials: true })
        .pipe(
          // Boot-time "this update needs a fresh login" check — see
          // session-epoch.ts. Only an actually logged-in user is affected;
          // the epoch is marked current once we know no older session is
          // left on this device (logged in now, logged out, or just forced
          // out), so this can never loop.
          switchMap((user) =>
            isSessionEpochOutdated() ? this.forceReloginAfterUpdate() : of(user),
          ),
          tap((user) => {
            this.currentUser.set(user);
            markSessionEpochCurrent();
          }),
          catchError((error: unknown) => {
            this.currentUser.set(null);
            if (isNetworkError(error)) {
              // Never cache a network failure via the shareReplay below —
              // the artisan's very next attempt (tapping "Réessayer" on
              // OfflinePage once they're back online) must hit the server
              // again, not replay this same rejection forever.
              this.meRequest = null;
              return throwError(() => error);
            }
            // Not logged in (401) — no older session to force out either.
            markSessionEpochCurrent();
            return of(null);
          }),
          shareReplay(1),
        );
    }
    return this.meRequest;
  }

  // Server-side logout (revokes the refresh token, clears the cookies — the
  // endpoint is @Public, so it works even with an expired access token),
  // then resolves to "not logged in" so authGuard routes to /connexion.
  // A network failure is rethrown (→ OfflinePage, epoch left outdated so the
  // next launch tries again); any other logout failure still lands the
  // artisan on /connexion — a fresh login there replaces the old cookies.
  private forceReloginAfterUpdate(): Observable<null> {
    return this.http.post<void>(`${this.baseUrl}/logout`, {}, { withCredentials: true }).pipe(
      catchError((error: unknown) => (isNetworkError(error) ? throwError(() => error) : of(null))),
      map(() => null),
      tap(() => this.toast.info("L'application a été mise à jour : merci de vous reconnecter.")),
    );
  }

  // Unlike ensureLoaded (memoized, boot-time only), always hits the server —
  // SessionKeepAliveService calls this when the native app comes back to the
  // foreground and periodically while it stays there, so a session that died
  // in the background (refresh token expired/revoked, password changed on
  // another device) is caught right away instead of on the artisan's next
  // tap, mid-task. A 401 here goes through authRefreshInterceptor exactly
  // like any other call: silent refresh first, /connexion only if that fails.
  revalidate(): Observable<PublicUser> {
    return this.http
      .get<PublicUser>(`${this.baseUrl}/me`, { withCredentials: true })
      .pipe(tap((user) => this.currentUser.set(user)));
  }

  // Every fresh sign-in (password, register, demo, Google, Apple) — a
  // session created by *this* build is by definition on the current epoch,
  // so the next cold start must not force it out (see session-epoch.ts).
  // Not used by refreshSession/revalidate: those continue an existing
  // session, whose epoch is exactly what's in question.
  private signedIn(user: PublicUser): void {
    this.currentUser.set(user);
    markSessionEpochCurrent();
  }

  // Local-only "you are logged out now" — for when the server already
  // considers the session dead (a failed refresh), so there's nothing to
  // POST /auth/logout to. Without it, guestGuard saw the stale currentUser
  // and bounced the artisan from /connexion straight back into the app.
  clearSession(): void {
    this.currentUser.set(null);
    this.meRequest = null;
  }

  refreshSession(): Observable<PublicUser> {
    if (!this.refreshInFlight$) {
      this.refreshInFlight$ = this.http
        .post<PublicUser>(`${this.baseUrl}/refresh`, {}, { withCredentials: true })
        .pipe(
          tap((user) => this.currentUser.set(user)),
          finalize(() => {
            this.refreshInFlight$ = null;
          }),
          shareReplay(1),
        );
    }
    return this.refreshInFlight$;
  }

  forgotPassword(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}/forgot-password`, { email });
  }

  resetPassword(token: string, newPassword: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}/reset-password`, {
      token,
      newPassword,
    });
  }

  // currentPassword omitted = a Google/Apple-only account setting its first
  // password (see the backend's AuthService.changePassword). The current
  // session survives; every other one is logged out server-side.
  changePassword(newPassword: string, currentPassword?: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.baseUrl}/change-password`,
      { currentPassword, newPassword },
      { withCredentials: true },
    );
  }

  verifyEmail(token: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}/verify-email`, { token });
  }

  resendVerification(): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.baseUrl}/resend-verification`,
      {},
      { withCredentials: true },
    );
  }

  deleteAccount(password?: string): Observable<void> {
    return this.http
      .delete<void>(`${this.baseUrl}/account`, { body: { password }, withCredentials: true })
      .pipe(
        tap(() => {
          this.currentUser.set(null);
          this.meRequest = null;
        }),
      );
  }

  googleLoginUrl(): string {
    return `${this.baseUrl}/google`;
  }

  // Native counterpart to googleLoginUrl's browser-redirect flow — see
  // GoogleNativeLoginService for why the native app takes a completely
  // different path (its own ID token, not a redirect the WebView would
  // navigate to) to reach the exact same backend account-linking logic.
  googleTokenLogin(idToken: string): Observable<PublicUser> {
    return this.http
      .post<PublicUser>(
        `${this.baseUrl}/google/token-login`,
        { idToken },
        { withCredentials: true },
      )
      .pipe(tap((user) => this.signedIn(user)));
  }

  // Browser-redirect counterpart to appleTokenLogin below, mirroring
  // googleLoginUrl — used on web directly, and by
  // AppleAndroidLoginService's system-browser bridge indirectly (that one
  // hits /auth/apple/mobile-start instead, a variant of this same flow with
  // a different redirect_uri — see AuthController).
  appleLoginUrl(): string {
    return `${this.baseUrl}/apple`;
  }

  // Native counterpart to appleLoginUrl above — used directly by
  // AppleNativeLoginService's iOS ASAuthorizationController flow, and
  // indirectly by Android's browser+deep-link bridge (DeepLinkService),
  // which POSTs here with platform: 'android' once it recovers
  // code/id_token from the app's own facturele.net/auth/apple-mobile-return
  // App Link — see AuthController.appleTokenLogin for why the backend needs
  // to know which of the two to distinguish (different expected token
  // audience).
  appleTokenLogin(
    identityToken: string,
    authorizationCode?: string,
    platform?: 'ios' | 'android',
  ): Observable<PublicUser> {
    return this.http
      .post<PublicUser>(
        `${this.baseUrl}/apple/token-login`,
        { identityToken, authorizationCode, platform },
        { withCredentials: true },
      )
      .pipe(tap((user) => this.signedIn(user)));
  }
}
