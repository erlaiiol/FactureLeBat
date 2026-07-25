import { SubscriptionStatus } from '../../../generated/prisma/enums';

// GET /billing/status's response shape — everything the frontend needs to
// decide what to render on /abonnement and whether to show a "Passer
// premium" nudge, without the client ever computing hasPremiumAccess
// itself (see PremiumGateService, the single source of truth this mirrors).
export interface BillingStatus {
  subscriptionStatus: SubscriptionStatus;
  hasPremiumAccess: boolean;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  premiumGrantedUntil: Date | null;
  freeInvoiceUsed: boolean;
  stripeConfigured: boolean;
}
