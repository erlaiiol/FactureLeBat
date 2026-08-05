import { PlanTier, SubscriptionStatus } from '../../../generated/prisma/enums';

// Phase 33: the per-company "1er mois à 2€" countdown, present only while
// PlanGateService.isTrialOfferActive is true — the frontend renders its
// countdown CTA straight off `expiresAt` (a real, server-persisted
// deadline) rather than starting its own timer, so a page reload never
// resets it. Absent (not just active: false) once expired or converted, so
// the frontend never has to also re-check the deadline itself.
export interface TrialOffer {
  tier: PlanTier;
  expiresAt: Date;
  discountedPriceEuros: number;
  normalPriceEuros: number;
}

// GET /billing/status's response shape — everything the frontend needs to
// decide what to render on /abonnement and whether to show a paywall nudge,
// without the client ever computing hasPremiumAccess/the effective tier
// itself (see PlanGateService, the single source of truth this mirrors).
// Phase 30 adds planTier plus catalog usage/limits so "Mon abonnement" can
// show "18/20 clients" without a second round trip.
export interface BillingStatus {
  subscriptionStatus: SubscriptionStatus;
  hasPremiumAccess: boolean;
  planTier: PlanTier | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  premiumGrantedUntil: Date | null;
  grantedPlanTier: PlanTier | null;
  freeInvoiceUsed: boolean;
  stripeConfigured: boolean;
  customerCount: number;
  customerLimit: number | null;
  catalogItemCount: number;
  catalogItemLimit: number | null;
  trialOffer: TrialOffer | null;
}
