export type SubscriptionStatus = 'NONE' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';

// Mirrors the backend's BillingStatus (billing/entities/billing-status.entity.ts).
export interface BillingStatus {
  subscriptionStatus: SubscriptionStatus;
  hasPremiumAccess: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  premiumGrantedUntil: string | null;
  freeInvoiceUsed: boolean;
  stripeConfigured: boolean;
}
