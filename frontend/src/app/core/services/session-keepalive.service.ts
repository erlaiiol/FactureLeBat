import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { isNetworkError } from '../utils/is-network-error.util';
import { AuthService } from './auth.service';
import { ClientLogService } from './client-log.service';

// A resume right after the previous check (quick app-switch to copy an
// email address) doesn't need another round-trip.
export const RESUME_MIN_INTERVAL_MS = 60_000;
// Below the backend's 15-minute access-token lifetime (JWT_ACCESS_EXPIRES_IN)
// — so while the app stays open, a check always lands before the access
// token expires and the silent refresh happens here, off the critical path,
// instead of as a 401-refresh-retry in the middle of e.g. a PDF preview.
export const PERIODIC_INTERVAL_MS = 10 * 60_000;

export type SessionCheckReason = 'resume' | 'periodic';

// Regular session checks for the native shells (and the web tab, via
// visibilitychange), on top of the boot-time GET /auth/me every guard
// already awaits (AuthService.ensureLoaded = the "app opened cold" check):
//   - on resume (app back to the foreground) — iOS/Android can keep the
//     WebView alive for days in the background, long past the access
//     token's lifetime, and the refresh token itself may have expired or
//     been revoked (password changed elsewhere) in the meantime;
//   - every PERIODIC_INTERVAL_MS while in the foreground.
// Each check is AuthService.revalidate(): a 401 goes through
// authRefreshInterceptor's silent refresh, and only a genuinely dead session
// ends on /connexion (with the "session expirée" toast) — right when the
// artisan opens the app, not mid-invoice. A network failure is ignored: no
// signal says nothing about the session.
@Injectable({ providedIn: 'root' })
export class SessionKeepAliveService {
  private readonly authService = inject(AuthService);
  private readonly clientLog = inject(ClientLogService);

  private started = false;
  private checking = false;
  private lastCheckAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  // Idempotent — App's constructor calls it once at boot. The boot itself
  // counts as a check (ensureLoaded's GET /auth/me), hence lastCheckAt.
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.lastCheckAt = Date.now();
    this.startTimer();

    if (Capacitor.isNativePlatform()) {
      void CapacitorApp.addListener('appStateChange', ({ isActive }) =>
        this.onVisibilityChange(isActive),
      );
    } else {
      document.addEventListener('visibilitychange', () =>
        this.onVisibilityChange(document.visibilityState === 'visible'),
      );
    }
  }

  check(reason: SessionCheckReason): void {
    if (this.checking || !this.authService.isAuthenticated()) {
      return;
    }
    if (reason === 'resume' && Date.now() - this.lastCheckAt < RESUME_MIN_INTERVAL_MS) {
      return;
    }
    this.checking = true;
    this.lastCheckAt = Date.now();
    // Captured up front: by the time the error lands, a failed refresh has
    // already cleared currentUser, and the report itself goes out without a
    // valid session — this is the only way to tell *whose* session died.
    const userId = this.authService.currentUser()?.id;
    this.authService.revalidate().subscribe({
      next: () => {
        this.checking = false;
        // A working round-trip is the best moment to ship anything queued.
        this.clientLog.scheduleFlush();
      },
      error: (error: unknown) => {
        this.checking = false;
        if (isNetworkError(error)) {
          return;
        }
        const status = error instanceof HttpErrorResponse ? error.status : undefined;
        this.clientLog.report({
          kind: 'session_check',
          status,
          message: `${reason}: session invalid (user ${userId ?? 'unknown'})`,
        });
      },
    });
  }

  private onVisibilityChange(isActive: boolean): void {
    if (isActive) {
      this.check('resume');
      this.startTimer();
    } else {
      this.stopTimer();
    }
  }

  private startTimer(): void {
    if (this.timer !== null) {
      return;
    }
    this.timer = setInterval(() => this.check('periodic'), PERIODIC_INTERVAL_MS);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
