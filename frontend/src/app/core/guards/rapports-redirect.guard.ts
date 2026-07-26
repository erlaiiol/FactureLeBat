import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

// Phase 18: '/rapports' was merged into '/statistiques' as its "Rapport &
// déclaration" tab (see StatsReportsPage). A plain `redirectTo: 'statistiques?vue=rapport'`
// string does NOT carry the query param through — Angular's redirectTo only
// resolves path segments, not an embedded querystring — so this guard
// redirects via router.parseUrl() instead, the same way guestGuard does,
// which parses the full URL (path + query) correctly.
export const rapportsRedirectGuard: CanActivateFn = () => {
  const router = inject(Router);
  return router.parseUrl('/statistiques?vue=rapport');
};
