import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingRepository } from './billing.repository';
import { BillingService } from './billing.service';
import { PlanGateService } from './plan-gate.service';
import { PromoCodeRepository } from './promo-code/promo-code.repository';
import { PromoCodeService } from './promo-code/promo-code.service';
import { StripeClientService } from './stripe/stripe-client.service';

// Exports PlanGateService (consumed by InvoiceModule/CustomerModule/
// ProductModule/ServiceCatalogModule/SourcingModule/ReportsModule to gate
// whatever each of them gates — see docs/roadmap.md Phase 30),
// BillingRepository + PromoCodeService (consumed by AdminModule for the
// "grant plan"/promo-code-CRUD admin surface) — everything else (Stripe SDK
// plumbing, the billing HTTP routes themselves) stays private to this
// module.
@Module({
  controllers: [BillingController],
  providers: [
    BillingService,
    BillingRepository,
    PlanGateService,
    StripeClientService,
    PromoCodeRepository,
    PromoCodeService,
  ],
  exports: [PlanGateService, BillingRepository, PromoCodeService, BillingService],
})
export class BillingModule {}
