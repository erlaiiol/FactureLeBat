import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingRepository } from './billing.repository';
import { BillingService } from './billing.service';
import { PremiumGateService } from './premium-gate.service';
import { PromoCodeRepository } from './promo-code/promo-code.repository';
import { PromoCodeService } from './promo-code/promo-code.service';
import { StripeClientService } from './stripe/stripe-client.service';

// Exports PremiumGateService (consumed by InvoiceModule to gate create/
// preview), BillingRepository + PromoCodeService (consumed by AdminModule
// for the "grant premium"/promo-code-CRUD admin surface) — everything else
// (Stripe SDK plumbing, the billing HTTP routes themselves) stays private
// to this module.
@Module({
  controllers: [BillingController],
  providers: [
    BillingService,
    BillingRepository,
    PremiumGateService,
    StripeClientService,
    PromoCodeRepository,
    PromoCodeService,
  ],
  exports: [PremiumGateService, BillingRepository, PromoCodeService, BillingService],
})
export class BillingModule {}
