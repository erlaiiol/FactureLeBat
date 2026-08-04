// Phase 32: FIXED is a plain euro amount (fixedAmountCents); PERCENTAGE
// stores a share of the invoice's product + visible-service subtotal instead
// (percentageBasisPoints) — see InvoiceDraftStore.resolvedDiscountAmountCents
// for where that share gets turned into a concrete amountCents at
// line-activation time, same "computed at build time, not typed per
// invoice" precedent as a PERCENTAGE Service.
export type DiscountType = 'FIXED' | 'PERCENTAGE';

export interface DiscountProfile {
  id: string;
  name: string;
  discountType: DiscountType;
  fixedAmountCents: number | null;
  // Basis points, same convention as CompanyProfile.vatRateBasisPoints —
  // 1000 = 10.00%. Only meaningful when discountType is PERCENTAGE.
  percentageBasisPoints: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertDiscountRequest {
  name: string;
  discountType: DiscountType;
  fixedAmountCents?: number;
  percentageBasisPoints?: number;
}
