import { PlanTier } from '../../generated/prisma/enums';

// Phase 30 (was a single flat REFERRAL_PARRAIN_REWARD_DAYS = 30 in Phase
// 29): the parrain's reward now scales with their own plan tier at the
// moment the reward fires, always granted as Premium days (a "taste of the
// top tier") — see docs/roadmap.md Phase 30. A referrer with no active plan
// at all gets the Essentiel-level reward as the floor: referring is never
// worthless, just less rewarding than it is for a paying subscriber, which
// is itself an extra incentive to upgrade. The filleul's side is a Stripe
// discount instead (-30% on their first billing cycle, whichever tier they
// pick) — see BillingService.grantReferralDiscount /
// StripeClientService's REFERRAL_DISCOUNT_PERCENT_OFF.
export const REFERRAL_PARRAIN_REWARD_DAYS_BY_TIER: Record<PlanTier, number> = {
  [PlanTier.ESSENTIEL]: 10,
  [PlanTier.PRO]: 20,
  [PlanTier.PREMIUM]: 30,
};

export const REFERRAL_PARRAIN_REWARD_FLOOR_DAYS =
  REFERRAL_PARRAIN_REWARD_DAYS_BY_TIER[PlanTier.ESSENTIEL];
