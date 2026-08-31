import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { BillingService } from '../services/billing.service';
import { PaywallService } from '../services/paywall.service';

// 1.2/manual-mode-free-tier revision: the one route-level exception to the
// app's "frustrate at the last moment" gating philosophy (see
// PaywallService's own comment) — mode vocal carries no free credit at all
// (unlike mode rapide's one lifetime invoice), so it's locked out entirely
// for a free company before it can even be entered, not just at final
// submission. Redirects back to the mode-choice screen and opens the same
// paywall modal every other 402 shows, rather than a dedicated page, so the
// upsell path stays identical everywhere.
//
// billingService.status() is populated once per login by an effect in
// app.ts, but that fetch can still be in flight when this guard runs (e.g. a
// hard refresh landing directly on /factures/nouvelle/vocal) — falls back to
// fetching it here rather than risking a false "blocked" on a stale null.
export const premiumRequiredGuard: CanActivateFn = () => {
  const billingService = inject(BillingService);
  const paywallService = inject(PaywallService);
  const router = inject(Router);

  const blockAndRedirect = () => {
    paywallService.show();
    return router.parseUrl('/factures/nouvelle');
  };

  const cached = billingService.status();
  if (cached) {
    return cached.hasPremiumAccess ? true : blockAndRedirect();
  }
  return billingService
    .refreshStatus()
    .pipe(map((status) => (status.hasPremiumAccess ? true : blockAndRedirect())));
};
