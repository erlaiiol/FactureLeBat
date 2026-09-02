export type SubscriptionStatus = 'NONE' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';

// Phase 30: the 3 subscription tiers — mirrors the backend's PlanTier enum
// (generated/prisma/enums.ts).
export type PlanTier = 'ESSENTIEL' | 'PRO' | 'PREMIUM';

// Phase 33: the per-company "1er mois à 2€" countdown — present only while
// it's actually live, see PlanGateService.isTrialOfferActive on the
// backend. expiresAt is a real, server-persisted deadline: the countdown
// components below must render straight off it and never invent their own
// timer, so a page reload can't reset it.
export interface TrialOffer {
  tier: PlanTier;
  expiresAt: string;
  discountedPriceEuros: number;
  normalPriceEuros: number;
}

// Mirrors the backend's BillingStatus (billing/entities/billing-status.entity.ts).
export interface BillingStatus {
  subscriptionStatus: SubscriptionStatus;
  hasPremiumAccess: boolean;
  planTier: PlanTier | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  premiumGrantedUntil: string | null;
  grantedPlanTier: PlanTier | null;
  // Specifically mode rapide's (GUIDED) one lifetime free credit — mode
  // manuel stays free and unlimited on every tier and never sets this true.
  freeInvoiceUsed: boolean;
  stripeConfigured: boolean;
  customerCount: number;
  customerLimit: number | null;
  catalogItemCount: number;
  catalogItemLimit: number | null;
  // Calendar-month count of distinct invoices whose Factur-X was
  // generated/downloaded/transmitted/emailed — facturXFreeLimit is null on
  // every paid tier (unlimited), FACTURX_FREE_MONTHLY_LIMIT on free.
  facturXUsedThisMonth: number;
  facturXFreeLimit: number | null;
  trialOffer: TrialOffer | null;
}

// Mirrors the backend's PlanCatalog (billing/entities/plan-catalog.entity.ts).
export interface PlanOption {
  tier: PlanTier;
  name: string;
  priceEuros: number;
  tagline: string;
  customerLimit: number | null;
  catalogItemLimit: number | null;
  features: { analytics: boolean; aiSourcing: boolean; dossiers: boolean };
  prioritySupport: boolean;
  highlight: boolean;
  removesWatermark: boolean;
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
