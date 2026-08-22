import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { of, switchMap } from 'rxjs';
import { AuthService } from '../services/auth.service';

// Phase 13.3: the inverse of authGuard — guards the public landing page at
// '/'. A visitor with no session sees the marketing page; a signed-in
// artisan landing on '/' (e.g. right after registering/logging in, or a
// bookmark from before they had an account) is sent straight back into the
// app instead of the pitch meant for strangers.
//
// First-invoice-pipeline reversal: this used to detour through
// '/entreprise?onboarding=1' first while the company profile was still
// blank (DEFAULT_COMPANY_PROFILE, backend's company.constants.ts) — removed
// once InvoiceDraftStore.vatRegimeConfirmed (the one field that actually
// affects a calculated total) and CompanyEssentialsGateService (name/SIRET/
// address, gated at PDF-send/download time instead) made that detour
// unnecessary: every artisan now goes straight to '/factures/nouvelle',
// company profile complete or not.
export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService
    .ensureLoaded()
    .pipe(switchMap((user) => of(user === null ? true : router.parseUrl('/factures/nouvelle'))));
};
