import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';

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
  return PUBLIC_ROUTES.includes(url.split('?')[0]);
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

  const isExempt =
    !req.url.startsWith(environment.apiBaseUrl) ||
    EXEMPT_PATHS.some((path) => req.url.includes(path));

  return next(req).pipe(
    catchError((error: unknown) => {
      if (isExempt || !(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }
      return authService.refreshSession().pipe(
        switchMap(() => next(req)),
        catchError((refreshError: unknown) => {
          if (!isOnPublicRoute(router.url)) {
            void router.navigate(['/connexion']);
          }
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
