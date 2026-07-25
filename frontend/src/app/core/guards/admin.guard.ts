import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';

// Guards /admin/* — the real enforcement is server-side (RolesGuard +
// @Roles(ADMIN), see backend/src/admin/admin.controller.ts), this is
// defense-in-depth so a non-admin hitting the URL directly is bounced
// straight back into the app instead of seeing an empty/erroring admin
// shell that then 403s on every request it makes.
export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService
    .ensureLoaded()
    .pipe(map((user) => (user?.role === 'ADMIN' ? true : router.parseUrl('/factures/nouvelle'))));
};
