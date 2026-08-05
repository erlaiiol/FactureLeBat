import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { BillingService } from '../services/billing.service';
import { PaywallService } from '../services/paywall.service';
import { TrialOfferService } from '../services/trial-offer.service';

// Phase 22: centralizes what was 7 duplicated `if (error.status === 402)
// this.paywallService.show()` call sites across invoice-create-preview-step
// and invoice-create-manual — one place for the iOS-specific paywall
// branching (PlatformService) to eventually special-case, instead of eight.
// Deliberately still rethrows: this only adds the "show the paywall" side
// effect globally, it never swallows the error — each call site keeps its
// own `if (error.status === 402) { ...; return; }` for whatever else it
// still needs to do locally (e.g. loadPreview's persistFreeEntities call,
// or simply skipping a generic error message).
//
// Phase 30 added two more 402 exceptions (CatalogLimitExceeded,
// PlanFeatureLocked) that are NOT the free-trial-invoice wall — this modal's
// copy ("Facture gratuite déjà utilisée") would be flatly wrong for a
// customer/product/service form hitting its catalog cap, or a sourcing/
// analytics screen locked behind a tier. Only the 'PremiumRequired'
// discriminator opens this modal; the other two are handled locally by
// their own screens (see e.g. customer-form's catalog-limit banner).
//
// Phase 33: an artisan who hit this wall without ever converting still has
// a live trial-offer countdown (see BillingService.status().trialOffer,
// kept fresh app-wide by app.ts) — shows that CTA instead of the generic
// paywall so the "1er mois à 2€" offer follows them from the first-invoice
// moment all the way to the point they actually get blocked, rather than
// only ever appearing once.
export const premiumGateInterceptor: HttpInterceptorFn = (req, next) => {
  const paywallService = inject(PaywallService);
  const trialOfferService = inject(TrialOfferService);
  const billingService = inject(BillingService);

  if (!req.url.startsWith(environment.apiBaseUrl)) {
    return next(req);
  }

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 402) {
        const body = error.error as { error?: string } | null;
        if (body?.error === 'PremiumRequired') {
          if (billingService.status()?.trialOffer) {
            trialOfferService.show();
          } else {
            paywallService.show();
          }
        }
      }
      return throwError(() => error);
    }),
  );
};
