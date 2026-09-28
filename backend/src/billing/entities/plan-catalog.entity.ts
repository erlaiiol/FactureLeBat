import { PlanTier } from '../../../generated/prisma/enums';

// GET /billing/plans's response shape — the 3 tier definitions plus which
// ones are actually purchasable on this deployment (Stripe price
// configured, see StripeClientService.isTierAvailable) and the current
// launch-offer state, so the frontend pricing UI never hardcodes a price,
// a cap, or a feature list. Public (no auth) — pricing is not sensitive,
// and it's also what a logged-out landing page would show.
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
  // Phase 1.7: this tier's App Store product id (APPLE_PRODUCT_ID_*), or
  // null if not configured on this deployment — the frontend's iOS purchase
  // buttons read this instead of hardcoding a product id, same "backend is
  // the single source of truth for pricing" reasoning `available` already
  // has for Stripe.
  appleProductId: string | null;
}

export interface LaunchOffer {
  tier: PlanTier;
  active: boolean;
  expiresAt: Date | null;
  discountedPriceEuros: number;
  durationMonths: number;
}

export interface PlanCatalog {
  plans: PlanOption[];
  launchOffer: LaunchOffer | null;
  referralFilleulDiscountPercent: number;
}
