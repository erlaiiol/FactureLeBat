import { PlanTier, SubscriptionStatus } from '../../../generated/prisma/enums';

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
}
