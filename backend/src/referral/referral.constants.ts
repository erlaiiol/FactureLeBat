// Phase 29: the parrain earns this many premium days per confirmed
// referral, granted through the same BillingRepository.grantPremiumDays
// mechanism as a promo code or an admin grant (see docs/roadmap.md). The
// filleul's reward is a Stripe discount instead, not free days — see
// BillingService.grantReferralDiscount.
export const REFERRAL_PARRAIN_REWARD_DAYS = 30;
