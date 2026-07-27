import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { BillingRepository } from '../billing/billing.repository';
import { BillingService } from '../billing/billing.service';
import { REFERRAL_PARRAIN_REWARD_DAYS } from './referral.constants';
import { generateReferralCode } from './referral-code-generator.util';
import { ReferralRepository } from './referral.repository';

const MAX_GENERATION_ATTEMPTS = 5;

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

// Orchestration only, same role as PromoCodeService: no Prisma calls live
// here directly, only through ReferralRepository/BillingRepository.
@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  constructor(
    private readonly repository: ReferralRepository,
    private readonly billingRepository: BillingRepository,
    private readonly billingService: BillingService,
  ) {}

  // Called once, at Company creation time (UserRepository.createWithCompany
  // needs a value to write) — every company gets a code regardless of
  // whether it was itself referred by anyone.
  async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
      const code = generateReferralCode();
      if (!(await this.repository.referralCodeExists(code))) {
        return code;
      }
    }
    throw new ConflictException('Impossible de générer un code de parrainage unique, réessayez.');
  }

  async validateCode(rawCode: string): Promise<{ valid: boolean }> {
    const code = normalizeCode(rawCode);
    return { valid: await this.repository.referralCodeExists(code) };
  }

  // Called right after a brand-new company is created (email/password
  // registration only, see docs/roadmap.md Phase 29's Google-OAuth known
  // limitation). Never blocks/throws on an invalid or missing code — a
  // referral code is a nice-to-have at registration, not a requirement.
  // The reward itself is deliberately NOT granted here: see
  // grantRewardForVerifiedEmail below.
  async attributeReferral(rawCode: string | undefined, referredCompanyId: string): Promise<void> {
    if (!rawCode) {
      return;
    }
    const code = normalizeCode(rawCode);
    const referrerCompanyId = await this.repository.findCompanyIdByReferralCode(code);
    if (!referrerCompanyId || referrerCompanyId === referredCompanyId) {
      return;
    }
    await this.repository.create(referrerCompanyId, referredCompanyId);
  }

  // Fires from AuthService.verifyEmail(), right after emailVerifiedAt is
  // set — gating the reward on a verified inbox rather than on raw
  // registration is this feature's one anti-abuse speed bump against
  // bulk-fake-account farming (see docs/roadmap.md Phase 29). Idempotent:
  // a Referral's rewardGrantedAt is only ever set once. The reward is
  // asymmetric: the parrain gets a straight free month (stacks additively,
  // same mechanism as an admin grant/promo code), the filleul gets 5€ off
  // their first billing cycle instead (BillingService.grantReferralDiscount
  // — a Stripe coupon, not free days, since they're the one being
  // converted into a paying customer).
  async grantRewardForVerifiedEmail(referredCompanyId: string): Promise<void> {
    const referral = await this.repository.findByReferredCompanyId(referredCompanyId);
    if (!referral || referral.rewardGrantedAt) {
      return;
    }
    await Promise.all([
      this.billingRepository.grantPremiumDays(
        referral.referrerCompanyId,
        REFERRAL_PARRAIN_REWARD_DAYS,
      ),
      this.billingService.grantReferralDiscount(referral.referredCompanyId),
    ]);
    await this.repository.markRewardGranted(referral.id);
    this.logger.log(
      `Referral reward granted: parrain ${referral.referrerCompanyId} (+${REFERRAL_PARRAIN_REWARD_DAYS}j) / filleul ${referral.referredCompanyId} (remise)`,
    );
  }

  async getStatus(companyId: string): Promise<{
    code: string;
    confirmedReferrals: number;
    rewardDaysEarned: number;
  }> {
    const [code, confirmedReferrals] = await Promise.all([
      this.repository.getCompanyReferralCode(companyId),
      this.repository.countConfirmedReferrals(companyId),
    ]);
    return {
      code,
      confirmedReferrals,
      rewardDaysEarned: confirmedReferrals * REFERRAL_PARRAIN_REWARD_DAYS,
    };
  }
}
