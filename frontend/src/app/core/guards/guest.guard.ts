import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { CompanyService } from '../services/company.service';

// Phase 13.3: the inverse of authGuard — guards the public landing page at
// '/'. A visitor with no session sees the marketing page; a signed-in
// artisan landing on '/' (e.g. right after registering/logging in, or a
// bookmark from before they had an account) is sent straight back into the
// app instead of the pitch meant for strangers.
//
// Registration used to send everyone straight to '/factures/nouvelle' —
// but a brand new company profile is still the blank one
// DEFAULT_COMPANY_PROFILE creates at signup (backend's
// company.constants.ts), siret included, so a first invoice created before
// that's filled in would need correcting (or the invoice re-issuing) later.
// Routing through '/entreprise' first — only while it's still that blank
// profile — closes that gap without adding a route guard that would nag a
// returning artisan who's simply choosing not to fill it in yet on every
// other navigation.
export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const companyService = inject(CompanyService);
  const router = inject(Router);

  return authService.ensureLoaded().pipe(
    switchMap((user) => {
      if (user === null) {
        return of(true);
      }
      return companyService.getProfile().pipe(
        map((profile) =>
          router.parseUrl(profile.siret === '' ? '/entreprise?onboarding=1' : '/factures/nouvelle'),
        ),
        // Fail open: a company-profile fetch hiccup must never strand an
        // otherwise-authenticated artisan on the marketing landing page.
        catchError(() => of(router.parseUrl('/factures/nouvelle'))),
      );
    }),
  );
};
