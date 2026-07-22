import { LineMode, WasteSurcharge } from '../../core/models/invoice.model';

// Mirrors the backend's InvoiceCalculationService formulas so the create
// screen can show a live running total while the artisan types.
// PREVIEW ONLY — the backend response after submit is always the source of
// truth for the persisted invoice's totals, never this client-side estimate.

export interface LinePreviewInput {
  mode: LineMode;
  quantity: number;
  unitPriceCents: number;
  wasteSurcharge: WasteSurcharge;
}

const WASTE_SURCHARGE_BASIS_POINTS: Record<WasteSurcharge, number> = {
  NONE: 0,
  TEN: 1000,
  TWENTY: 2000,
};

export function computeLineTotalPreviewCents(line: LinePreviewInput): number {
  if (!Number.isFinite(line.quantity) || !Number.isFinite(line.unitPriceCents)) {
    return 0;
  }
  const wasteBasisPoints =
    line.mode === 'AREA' ? WASTE_SURCHARGE_BASIS_POINTS[line.wasteSurcharge] : 0;
  const billedQuantity = (line.quantity * (10000 + wasteBasisPoints)) / 10000;
  return Math.round(billedQuantity * line.unitPriceCents);
}

export interface TotalsPreview {
  subtotalExclVatCents: number;
  vatAmountCents: number;
  totalInclVatCents: number;
}

export function computeTotalsPreview(
  lines: readonly LinePreviewInput[],
  vatApplicable: boolean,
  vatRateBasisPoints: number,
): TotalsPreview {
  const subtotalExclVatCents = lines.reduce(
    (sum, line) => sum + computeLineTotalPreviewCents(line),
    0,
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
