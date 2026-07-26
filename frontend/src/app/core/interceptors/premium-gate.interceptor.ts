import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PaywallService } from '../services/paywall.service';

// Phase 22: centralizes what was 7 duplicated `if (error.status === 402)
// this.paywallService.show()` call sites across invoice-create-preview-step
// and invoice-create-manual — one place for the iOS-specific paywall
// branching (PlatformService) to eventually special-case, instead of eight.
// Deliberately still rethrows: this only adds the "show the paywall" side
// effect globally, it never swallows the error — each call site keeps its
// own `if (error.status === 402) { ...; return; }` for whatever else it
// still needs to do locally (e.g. loadPreview's persistFreeEntities call,
// or simply skipping a generic error message).
export const premiumGateInterceptor: HttpInterceptorFn = (req, next) => {
  const paywallService = inject(PaywallService);

  if (!req.url.startsWith(environment.apiBaseUrl)) {
    return next(req);
  }

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 402) {
        paywallService.show();
      }
      return throwError(() => error);
    }),
  );
};
