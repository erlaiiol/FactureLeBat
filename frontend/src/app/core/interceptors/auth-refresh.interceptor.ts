import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';

const EXEMPT_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

// On a 401 from any authenticated API call, attempt one silent
// POST /auth/refresh and retry the original request — the artisan never
// sees a spurious "logged out" moment just because their 15-minute access
// token expired mid-session. If the refresh itself fails (no valid session
// left), route to /connexion instead of leaving the app stuck on a failed
// call.
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
          void router.navigate(['/connexion']);
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
