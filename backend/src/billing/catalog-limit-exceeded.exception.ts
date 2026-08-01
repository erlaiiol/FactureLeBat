import { HttpException, HttpStatus } from '@nestjs/common';
import { CATALOG_KIND_LABELS, CatalogKind } from './plan-config';

// Thrown by PlanGateService.assertCatalogCapacity when a company tries to
// add a customer/product/service beyond its tier's cap — see
// docs/roadmap.md Phase 30. Same 402 status as PremiumRequiredException,
// but a distinct `error` discriminator ('CatalogLimitExceeded') so the
// frontend's shared premium-gate interceptor (which reacts to *any* 402 to
// show the free-trial invoice paywall modal) does NOT fire for this one —
// the customer/product/service form pages handle it locally with their own
// upsell message instead, since "facture gratuite déjà utilisée" would be a
// wrong and confusing thing to show here.
export class CatalogLimitExceededException extends HttpException {
  constructor(kind: CatalogKind, limit: number, currentCount: number, tierName: string) {
    super(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        error: 'CatalogLimitExceeded',
        message: `Limite de ${limit} ${CATALOG_KIND_LABELS[kind]} atteinte pour l'offre ${tierName}. Passez à une offre supérieure pour continuer.`,
        kind,
        limit,
        currentCount,
        tierName,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
