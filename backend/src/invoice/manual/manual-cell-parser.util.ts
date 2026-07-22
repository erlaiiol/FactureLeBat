import { Prisma } from '../../../generated/prisma/client';

// QUANTITY/UNIT_PRICE cells on a manual invoice (Phase 9.5) are free text the
// artisan typed directly into the canvas — this is the one place that text
// is turned into a Decimal, so InvoiceCalculationService never has to know a
// line came from the free-form table instead of a GUIDED form. Accepts a
// comma or dot decimal separator; anything else (currency symbols, thousands
// separators, stray text) is rejected rather than guessed at. The same
// generous-but-finite bound as CreateInvoiceLineDto's quantity/price fields —
// exists to reject an obviously-wrong value, not to model a real business
// limit.
const MAX_CELL_VALUE = 1_000_000;
const DECIMAL_PATTERN = /^\d{1,9}(?:\.\d{1,3})?$/;

export function parseManualDecimalCell(raw: string): Prisma.Decimal | null {
  const normalized = raw.trim().replace(',', '.');
  if (!DECIMAL_PATTERN.test(normalized)) {
    return null;
  }
  const value = new Prisma.Decimal(normalized);
  return value.lessThanOrEqualTo(MAX_CELL_VALUE) ? value : null;
}
