import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

const EXEMPT_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

// Every route reachable without a session (see app.routes.ts's top-level
// routes, outside the authGuard-wrapped protectedRoutes) — a failed refresh
// on one of these must never bounce the visitor away, since they were never
// expected to have a session there in the first place. Exact-match against
// the path only (query string stripped below): none of these are parent
// routes with children.
const PUBLIC_ROUTES = [
  '/',
  '/connexion',
  '/inscription',
  '/mot-de-passe-oublie',
  '/reinitialiser-mot-de-passe',
  '/verifier-email',
  '/cgu',
  '/confidentialite',
];

function isOnPublicRoute(url: string): boolean {
  const path = url.split('?')[0];
  // /partage/:token (InvoiceShareViewPage) isn't a fixed path like the rest
  // of this list — a recipient with no account whatsoever lands here, and
  // TourService's own unconditional onboarding fetch (see its own comment)
  // still runs on this route and still 401s for them exactly like it does
  // on every other public route.
  return PUBLIC_ROUTES.includes(path) || path.startsWith('/partage/');
}

// On a 401 from any authenticated API call, attempt one silent
// POST /auth/refresh and retry the original request — the artisan never
// sees a spurious "logged out" moment just because their 15-minute access
// token expired mid-session. If the refresh itself fails (no valid session
// left), route to /connexion instead of leaving the app stuck on a failed
// call — unless the visitor is already on a public route (e.g. a background
// call like TourService's onboarding fetch failing while anonymous on
// /inscription): they were never logged in to begin with, so there is
// nothing to redirect away from.
export const authRefreshInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);

  const isExempt =
    !req.url.startsWith(environment.apiBaseUrl) ||
    EXEMPT_PATHS.some((path) => req.url.includes(path));

  return next(req).pipe(
    catchError((error: unknown) => {
      if (isExempt || !(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }
      // Snapshot before attempting the refresh: if a fresh login/register/
      // logout happens while this refresh is in flight (e.g. this 401 came
      // from a stale request queued before the visitor re-authenticated on
      // /connexion), currentUser will have moved on to a new object by the
      // time we get to catchError below — every one of those setters
      // installs a brand new object, never mutates in place. In that case
      // this failure describes a session that no longer matters; forcing a
      // redirect now would yank the visitor back to /connexion moments
      // after they just logged in.
      const userBeforeRefresh = authService.currentUser();
      return authService.refreshSession().pipe(
        switchMap(() => next(req)),
        catchError((refreshError: unknown) => {
          const supersededByNewerAuth = authService.currentUser() !== userBeforeRefresh;
          if (!supersededByNewerAuth && !isOnPublicRoute(router.url)) {
            // Without this, a component mid-request (e.g. subscribe.page.ts
            // awaiting a Stripe checkout URL) gets torn down by the
            // navigation and its own error handler never runs — the artisan
            // just sees their click silently do nothing. The toast is what
            // actually explains the disappearance.
            toast.info('Votre session a expiré, merci de vous reconnecter.');
            void router.navigate(['/connexion']);
          }
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
