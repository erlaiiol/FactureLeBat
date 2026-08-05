import { PlanTier } from '../../generated/prisma/enums';

// Phase 30: single source of truth for the 3 subscription tiers — price,
// catalog caps, and feature flags. Every other module (GET /billing/plans
// for the frontend pricing UI, PlanGateService, AdminService/PromoCodeService
// for tier-aware grants) reads from here rather than duplicating a number,
// same "one place, never copied" convention as common/unit.util.ts's
// UNIT_LABELS. See docs/roadmap.md Phase 30 for the decoy-pricing rationale
// behind these specific numbers.
export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  priceEuros: number;
  tagline: string;
  // null = unlimited. Deliberately never gates devis/factures themselves —
  // see docs/roadmap.md Phase 30's "Decided with the user" section.
  customerLimit: number | null;
  catalogItemLimit: number | null; // Product + Service combined
  features: {
    analytics: boolean; // Phase 17 "Statistiques d'activité" (never the quarterly declaration — that stays free on every tier)
    aiSourcing: boolean; // Phase 10 "Assistant fournisseurs"
  };
  prioritySupport: boolean;
  highlight: boolean; // marketing badge ("Meilleure valeur") on the pricing UI
  // Whether an invoice/devis PDF from a company on this tier skips the
  // facturele.net signature block PdfService.buildFooter otherwise appends —
  // see InvoiceMapper.issuerFields' showWatermark. A plain per-tier benefit
  // flag, not a GatedFeature: nothing throws when it's false, it only
  // changes what gets rendered.
  removesWatermark: boolean;
}

// Ascending order — array index doubles as a rank, see isTierAtLeast/
// higherTier below. Never reorder without checking every caller that
// compares tiers positionally.
export const PLAN_TIER_ORDER: readonly PlanTier[] = [
  PlanTier.ESSENTIEL,
  PlanTier.PRO,
  PlanTier.PREMIUM,
];

export const PLAN_DEFINITIONS: Record<PlanTier, PlanDefinition> = {
  [PlanTier.ESSENTIEL]: {
    tier: PlanTier.ESSENTIEL,
    name: 'Essentiel',
    priceEuros: 7,
    tagline: 'Pour démarrer sereinement, sans complexité inutile.',
    customerLimit: 20,
    catalogItemLimit: 30,
    features: { analytics: false, aiSourcing: false },
    prioritySupport: false,
    highlight: false,
    removesWatermark: false,
  },
  [PlanTier.PRO]: {
    tier: PlanTier.PRO,
    name: 'Pro',
    priceEuros: 12,
    tagline: 'Pour une activité qui grandit : plus de place, vos statistiques.',
    customerLimit: 150,
    catalogItemLimit: 150,
    features: { analytics: true, aiSourcing: false },
    prioritySupport: false,
    highlight: false,
    removesWatermark: false,
  },
  [PlanTier.PREMIUM]: {
    tier: PlanTier.PREMIUM,
    name: 'Premium',
    priceEuros: 15,
    // Deliberately doesn't mention aiSourcing below — not mature enough to
    // sell yet, so marketing copy leans on analytics instead. The feature
    // itself stays gated and functional, just unadvertised.
    tagline: 'Tout, sans limite, avec vos statistiques les plus complètes.',
    customerLimit: null,
    catalogItemLimit: null,
    features: { analytics: true, aiSourcing: true },
    prioritySupport: true,
    highlight: true,
    removesWatermark: true,
  },
};

// Phase 33: limited-time "1er mois à 2€" Premium offer, started once per
// company the moment their invoice count goes from 0 to 1 (see
// PlanGateService.recordInvoiceCreated) and shown as a countdown CTA both
// right after that first invoice and again on the paywall if they haven't
// converted yet — see docs/roadmap.md Phase 33. Premium-only, same
// reasoning as the sitewide launch offer above (discounting every tier at
// once would blur the comparison the decoy pricing in Phase 30 relies on),
// but this one is per-company and earned by usage rather than calendar-wide.
export const TRIAL_OFFER_TIER = PlanTier.PREMIUM;
export const TRIAL_OFFER_PRICE_EUROS = 2;
export const TRIAL_OFFER_WINDOW_HOURS = 48;

export type CatalogKind = 'customer' | 'catalogItem';
export type GatedFeature = 'analytics' | 'aiSourcing';

// Short labels for GET /billing/plans and lock-screen copy — kept here
// alongside PLAN_DEFINITIONS rather than duplicated in the two gate
// exceptions that also need them.
export const CATALOG_KIND_LABELS: Record<CatalogKind, string> = {
  customer: 'clients enregistrés',
  catalogItem: 'articles au catalogue (produits + prestations)',
};

export const GATED_FEATURE_LABELS: Record<GatedFeature, string> = {
  analytics: "statistiques d'activité",
  aiSourcing: 'assistant IA fournisseurs',
};

export function isTierAtLeast(tier: PlanTier, required: PlanTier): boolean {
  return PLAN_TIER_ORDER.indexOf(tier) >= PLAN_TIER_ORDER.indexOf(required);
}

// Used to make a stacked grant never downgrade a tier already in effect
// (see BillingRepository.grantPlanDays) and to resolve "Stripe subscription
// tier OR grant tier, whichever is better" (see PlanGateService.
// getEffectivePlanTier) — both are the same "take the higher one" rule.
export function higherTier(a: PlanTier | null, b: PlanTier | null): PlanTier | null {
  if (!a) return b;
  if (!b) return a;
  return isTierAtLeast(a, b) ? a : b;
}
