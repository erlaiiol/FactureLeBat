import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../services/auth.service';

// Wraps every real feature route (see app.routes.ts) — calls GET /auth/me
// exactly once per app load (AuthService.ensureLoaded memoizes it) and
// redirects to /connexion when there's no valid session. ensureLoaded only
// ever throws for a genuine network failure (no wifi/4G, a request that
// never resolves) — everything else, including a confirmed "not logged
// in", resolves normally — so that's the one case this sends to
// OfflinePage instead of the login form, which would otherwise misleadingly
// suggest the artisan's credentials are the problem.
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.ensureLoaded().pipe(
    map((user) => (user !== null ? true : router.parseUrl('/connexion'))),
    catchError(() => of(router.parseUrl('/hors-ligne'))),
  );
};
