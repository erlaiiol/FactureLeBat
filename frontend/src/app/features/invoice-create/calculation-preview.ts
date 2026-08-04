import { WasteSurcharge } from '../../core/models/invoice.model';
import { isAreaUnit, Unit } from '../../core/models/unit.model';

// Mirrors the backend's InvoiceCalculationService formulas so the create
// screen can show a live running total while the artisan types.
// PREVIEW ONLY — the backend response after submit is always the source of
// truth for the persisted invoice's totals, never this client-side estimate.

// The three quantity-shaping fields that separately confuse artisans: how
// big the job site is ("quantity"), how much extra material waste buys
// ("wasteSurcharge"), and how the material is actually sold in fixed lots
// ("packagingQuantity"/"roundUpToPackaging"). Kept as its own type (rather
// than folded into LinePreviewInput) so the line-form's recap can reuse the
// exact same rounding logic without needing a price to compute it.
export interface QuantityCalcInput {
  unit: Unit;
  quantity: number;
  wasteSurcharge: WasteSurcharge;
  packagingQuantity?: number | null;
  roundUpToPackaging?: boolean;
}

export interface LinePreviewInput extends QuantityCalcInput {
  unitPriceCents: number;
}

const WASTE_SURCHARGE_BASIS_POINTS: Record<WasteSurcharge, number> = {
  NONE: 0,
  TEN: 1000,
  TWENTY: 2000,
};

// neededQuantity: what the job site actually requires, waste included.
// billedQuantity: what ends up on the invoice once packaging rounding (if
// any) is applied — the two diverge exactly when a packaging quantity with
// roundUpToPackaging is set, which is the crux of the chantier/conditionnement
// confusion this function exists to make explicit.
export function computeBilledQuantity(line: QuantityCalcInput): {
  neededQuantity: number;
  billedQuantity: number;
} {
  const wasteBasisPoints = isAreaUnit(line.unit)
    ? WASTE_SURCHARGE_BASIS_POINTS[line.wasteSurcharge]
    : 0;
  const neededQuantity = (line.quantity * (10000 + wasteBasisPoints)) / 10000;
  const packagingQuantity = line.packagingQuantity;
  const billedQuantity =
    line.roundUpToPackaging && packagingQuantity && packagingQuantity > 0
      ? Math.ceil(neededQuantity / packagingQuantity) * packagingQuantity
      : neededQuantity;
  return { neededQuantity, billedQuantity };
}

export function computeLineTotalPreviewCents(line: LinePreviewInput): number {
  if (!Number.isFinite(line.quantity) || !Number.isFinite(line.unitPriceCents)) {
    return 0;
  }
  const { billedQuantity } = computeBilledQuantity(line);
  return Math.round(billedQuantity * line.unitPriceCents);
}

// Phase 13.5: a PERCENTAGE-mode Service's contribution isn't typed per
// invoice — it's this percentage of `baseCents` (see
// InvoiceDraftStore.percentageBaseCents for what "base" means). PREVIEW
// ONLY, same carve-out as the rest of this file: the concrete amountCents
// this produces is what actually gets submitted as the service line's
// amount, so the backend never needs to know a line was percentage-derived.
// Phase 32: the exact same basis-point-of-a-base formula also resolves a
// PERCENTAGE discount's amountCents (see
// InvoiceDraftStore.resolvedDiscountAmountCents) — reused as-is rather than
// duplicated under a second name, since neither the math nor its "resolved
// once, not a live formula" framing differs between the two.
export function computePercentageServiceAmountCents(
  baseCents: number,
  percentageBasisPoints: number,
): number {
  return Math.round((baseCents * percentageBasisPoints) / 10000);
}

export interface TotalsPreview {
  subtotalExclVatCents: number;
  vatAmountCents: number;
  totalInclVatCents: number;
}

// Phase 5: a service line — visible or redistributed — always increases the
// displayed total by its full amount (see docs/roadmap.md's Phase 5
// invariant); the preview only needs that aggregate, never the per-line
// breakdown a REDISTRIBUTED line produces, since this screen shows no
// per-line totals to begin with. No need to duplicate the weighted-split
// math here just for a running total.
//
// Phase 32: discountAmountCents is the already-summed magnitude of every
// remise on the draft (see InvoiceDraftStore.discountAmountCents) — folded
// into the subtotal the same way serviceAmountCents adds to it, just
// subtracted, and floored at 0 so an over-discounted draft never previews a
// negative HT amount.
export function computeTotalsPreview(
  lines: readonly LinePreviewInput[],
  vatApplicable: boolean,
  vatRateBasisPoints: number,
  serviceAmountCents = 0,
  discountAmountCents = 0,
): TotalsPreview {
  const subtotalExclVatCents = Math.max(
    0,
    lines.reduce((sum, line) => sum + computeLineTotalPreviewCents(line), 0) +
      serviceAmountCents -
      discountAmountCents,
  );
  const vatAmountCents = vatApplicable
    ? Math.round((subtotalExclVatCents * vatRateBasisPoints) / 10000)
    : 0;

  return {
    subtotalExclVatCents,
    vatAmountCents,
    totalInclVatCents: subtotalExclVatCents + vatAmountCents,
  };
}
