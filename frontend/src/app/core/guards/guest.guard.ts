import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';

// Phase 13.3: the inverse of authGuard — guards the public landing page at
// '/'. A visitor with no session sees the marketing page; a signed-in
// artisan landing on '/' (e.g. a bookmark from before they had an account)
// is sent straight back into the app instead of the pitch meant for
// strangers.
export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService
    .ensureLoaded()
    .pipe(map((user) => (user === null ? true : router.parseUrl('/factures/nouvelle'))));
};
