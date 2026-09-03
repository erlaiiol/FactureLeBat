import { MarginMode } from '../../generated/prisma/enums';

// Phase 1.6: shared shape between Product and Service's own margin
// declaration — see schema.prisma's comment on Product.marginMode.
export interface MarginConfig {
  marginMode: MarginMode | null;
  marginAmountCents: number | null;
  marginPercentageBasisPoints: number | null;
}

// Resolves how much of `baseAmountCents` (an invoice line's own
// lineTotalExclVatCents for a product, or a service line's amountCents) is
// margin, given the catalog item's own margin declaration — see
// docs/1.6/1.6-2-margin-analytics-backend.md's "per-line margin resolution".
// `unitCount` is the billed quantity (InvoiceLineWithTotal.billedQuantity,
// not the raw site quantity — margin should scale with what was actually
// charged, same basis lineTotalExclVatCents itself is computed from); always
// 1 for a service line, which is already a total amount, not a unit price
// times a quantity.
//
// `config` is undefined for a freehand line/service line with no catalog
// reference at all (or a since-deleted catalog item — impossible in
// practice, onDelete: SetNull always nulls productId/serviceId first) —
// there is genuinely no object to assume anything about, so this resolves
// to 0 and the caller buckets that revenue as uncategorized.
//
// `config.marginMode == null` is a different case: a *real* catalog
// Product/Service the artisan simply hasn't touched the margin field on
// yet. Requested directly by the user (2026-09-03): defaults to the full
// `baseAmountCents` — 100% margin — until the artisan configures a real
// value in that item's own "paramètres avancés." An untouched catalog item
// still counts as covered (see hasCatalogMarginObject in reports.service.ts),
// just at this optimistic default rather than the artisan's real number —
// the "Marge" tab's info tooltip explains this assumption explicitly.
export function resolveMarginCents(
  config: MarginConfig | undefined,
  baseAmountCents: number,
  unitCount: number,
): number {
  if (!config) {
    return 0;
  }
  if (config.marginMode == null) {
    return Math.max(baseAmountCents, 0);
  }
  if (config.marginMode === MarginMode.PERCENTAGE) {
    if (config.marginPercentageBasisPoints == null) {
      return 0;
    }
    return Math.round((baseAmountCents * config.marginPercentageBasisPoints) / 10_000);
  }
  if (config.marginAmountCents == null) {
    return 0;
  }
  // Clamped to what the line actually billed: a discounted line can end up
  // priced below what the catalog's marginAmountCents ≤ priceCents
  // invariant assumed at save time — see the doc section referenced above.
  return Math.min(Math.round(config.marginAmountCents * unitCount), Math.max(baseAmountCents, 0));
}
