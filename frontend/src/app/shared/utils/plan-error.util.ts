import { HttpErrorResponse } from '@angular/common/http';

// Phase 30: the two new 402 exceptions PlanGateService throws beyond
// PremiumRequired (see docs/roadmap.md Phase 30) — CatalogLimitExceeded
// (customer/product/service create) and PlanFeatureLocked (analytics/AI
// assistant). Both carry a ready-to-display French `message` in the error
// body (see backend's CatalogLimitExceededException/
// PlanFeatureLockedException), so callers just need to detect which one
// happened and pull that message out, rather than reconstructing it.
export function catalogLimitMessage(error: unknown): string | null {
  return planErrorMessage(error, 'CatalogLimitExceeded');
}

export function planFeatureLockedMessage(error: unknown): string | null {
  return planErrorMessage(error, 'PlanFeatureLocked');
}

// 1.2/facturx-monthly-quota revision: PlanGateService.assertCanUseFacturX's
// own 402 (backend's FacturXQuotaExceededException) — same "own
// discriminator, own local message" pattern as the two above, kept out of
// the shared premium-gate interceptor for the same reason (its generic
// free-trial-invoice paywall copy would be wrong here).
export function facturXQuotaMessage(error: unknown): string | null {
  return planErrorMessage(error, 'FacturXQuotaExceeded');
}

function planErrorMessage(error: unknown, discriminator: string): string | null {
  if (!(error instanceof HttpErrorResponse) || error.status !== 402) {
    return null;
  }
  const body = error.error as { error?: string; message?: string } | null;
  if (body?.error !== discriminator) {
    return null;
  }
  return body.message ?? null;
}
