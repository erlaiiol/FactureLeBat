export type SubscriptionStatus = 'NONE' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';

// Phase 30: the 3 subscription tiers — mirrors the backend's PlanTier enum
// (generated/prisma/enums.ts).
export type PlanTier = 'ESSENTIEL' | 'PRO' | 'PREMIUM';

// Mirrors the backend's BillingStatus (billing/entities/billing-status.entity.ts).
export interface BillingStatus {
  subscriptionStatus: SubscriptionStatus;
  hasPremiumAccess: boolean;
  planTier: PlanTier | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  premiumGrantedUntil: string | null;
  grantedPlanTier: PlanTier | null;
  freeInvoiceUsed: boolean;
  stripeConfigured: boolean;
  customerCount: number;
  customerLimit: number | null;
  catalogItemCount: number;
  catalogItemLimit: number | null;
}

// Mirrors the backend's PlanCatalog (billing/entities/plan-catalog.entity.ts).
export interface PlanOption {
  tier: PlanTier;
  name: string;
  priceEuros: number;
  tagline: string;
  customerLimit: number | null;
  catalogItemLimit: number | null;
  features: { analytics: boolean; aiSourcing: boolean };
  prioritySupport: boolean;
  highlight: boolean;
  available: boolean;
}

export interface LaunchOffer {
  tier: PlanTier;
  active: boolean;
  expiresAt: string | null;
  discountedPriceEuros: number;
  durationMonths: number;
}

export interface PlanCatalog {
  plans: PlanOption[];
  launchOffer: LaunchOffer | null;
  referralFilleulDiscountPercent: number;
}
