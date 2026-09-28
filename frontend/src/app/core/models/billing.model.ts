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
  // Phase 1.7: the Apple IAP counterpart to subscriptionStatus above —
  // managed through iOS Settings, not the Stripe portal, so subscribe.page
  // branches on this separately rather than folding it into subscriptionStatus.
  appleSubscriptionStatus: SubscriptionStatus;
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
  // Phase 1.7: mirrors stripeConfigured — whether this deployment can
  // accept native iOS purchases at all. subscribe.page.ts's iOS purchase
  // buttons fall back to "indisponible pour le moment" when false, same
  // posture the Stripe cards already have via stripeConfigured.
  appleConfigured: boolean;
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
  // Phase 1.7: this tier's App Store product id, or null if Apple IAP isn't
  // configured for it on this deployment — subscribe.page.ts's iOS purchase
  // buttons read this instead of hardcoding a product id.
  appleProductId: string | null;
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
