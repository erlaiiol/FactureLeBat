import { HttpException, HttpStatus } from '@nestjs/common';

// Thrown by PlanGateService.assertCanUseFacturX when a free-tier company has
// already used its FACTURX_FREE_MONTHLY_LIMIT distinct invoices' worth of
// Factur-X this calendar month (generate/download, PA transmission, or an
// explicitly-requested emailed Factur-X attachment — see
// Invoice.facturXFirstUsedAt's own schema comment). Same 402 status as
// PremiumRequiredException/CatalogLimitExceededException, but its own
// discriminator ('FacturXQuotaExceeded') so the frontend's shared
// premium-gate interceptor (which reacts to PremiumRequired only) doesn't
// fire the free-trial-invoice paywall for this — "facture gratuite déjà
// utilisée" would be the wrong message here. The invoice board and the
// post-creation success screen handle this locally instead (see
// plan-error.util.ts's facturXQuotaMessage).
export class FacturXQuotaExceededException extends HttpException {
  constructor(limit: number) {
    super(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        error: 'FacturXQuotaExceeded',
        message: `Limite de ${limit} factures électroniques (Factur-X) atteinte pour ce mois-ci. Passez à une offre payante pour continuer.`,
        limit,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
