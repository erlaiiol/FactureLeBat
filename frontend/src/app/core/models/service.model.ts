export type ServiceVisibility = 'VISIBLE' | 'REDISTRIBUTED';

// Phase 13.5: FIXED is the pre-existing typed-euro-amount behavior;
// PERCENTAGE stores a share of the invoice instead — see
// InvoiceDraftStore.resolvePercentageAmountCents for where that share gets
// turned into a concrete amountCents at line-activation time.
export type ServicePricingMode = 'FIXED' | 'PERCENTAGE';

export interface ServiceProfile {
  id: string;
  name: string;
  description: string | null;
  pricingMode: ServicePricingMode;
  priceCents: number | null;
  // Basis points, same convention as CompanyProfile.vatRateBasisPoints —
  // 3000 = 30.00%. Only meaningful when pricingMode is PERCENTAGE.
  percentageBasisPoints: number | null;
  defaultVisibility: ServiceVisibility;
  // Phase 11: short artisan-defined reference (e.g. "MO-POSE") — optional,
  // unique when set. Same shape as ProductProfile.code.
  code: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertServiceRequest {
  name: string;
  description?: string;
  pricingMode: ServicePricingMode;
  priceCents?: number;
  percentageBasisPoints?: number;
  defaultVisibility: ServiceVisibility;
  code?: string;
}
