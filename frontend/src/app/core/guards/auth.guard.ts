import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';

// Wraps every real feature route (see app.routes.ts) — calls GET /auth/me
// exactly once per app load (AuthService.ensureLoaded memoizes it) and
// redirects to /connexion when there's no valid session.
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService
    .ensureLoaded()
    .pipe(map((user) => (user !== null ? true : router.parseUrl('/connexion'))));
};
