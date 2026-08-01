import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { ReferralController } from './referral.controller';
import { ReferralRepository } from './referral.repository';
import { ReferralService } from './referral.service';

// Imports BillingModule for BillingRepository.grantPlanDays (the same
// mechanism a promo code or admin grant already uses — see
// docs/roadmap.md Phase 29/30) and PlanGateService (to read the referrer's
// own current tier when scaling their reward, Phase 30). Exports
// ReferralService so AuthModule can generate a code at registration and
// grant the reward at email verification, without AuthModule reaching into
// BillingModule directly.
@Module({
  imports: [BillingModule],
  controllers: [ReferralController],
  providers: [ReferralRepository, ReferralService],
  exports: [ReferralService],
})
export class ReferralModule {}
