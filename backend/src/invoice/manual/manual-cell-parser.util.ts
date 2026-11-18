import { Prisma } from '../../../generated/prisma/client';

// QUANTITY/UNIT_PRICE cells on a manual invoice (Phase 9.5) are free text the
// artisan typed directly into the canvas — this is the one place that text
// is turned into a Decimal, so InvoiceCalculationService never has to know a
// line came from the free-form table instead of a GUIDED form. Accepts a
// comma or dot decimal separator, and a "€" sign anywhere (that's the only
// currency this app bills in, and formatManualPrice/format() add it back on
// every UNIT_PRICE/LINE_TOTAL cell automatically — so an artisan typing it
// by hand, or a value round-tripped through formatting, must still parse).
// Anything else (thousands separators, stray text) is rejected rather than
// guessed at. The same generous-but-finite bound as CreateInvoiceLineDto's
// quantity/price fields — exists to reject an obviously-wrong value, not to
// model a real business limit.
//
// A leading minus sign is accepted (ASCII "-" or the typographic "−" a
// French keyboard/autocorrect may produce, optionally followed by a space):
// a negative UNIT_PRICE/LINE_TOTAL is how an artisan writes a remise or an
// acompte déjà versé on the manual canvas, as its own line ("Remise
// fidélité … -150,00 €"). The bound applies to the magnitude. Whether the
// table as a whole may go negative is a separate, table-level rule — see
// ManualRowsTotalNonNegative.
const MAX_CELL_MAGNITUDE = 1_000_000;
const DECIMAL_PATTERN = /^-?\d{1,9}(?:\.\d{1,3})?$/;

export function parseManualDecimalCell(raw: string): Prisma.Decimal | null {
  const normalized = raw
    .trim()
    .replace(/€/g, '')
    .trim()
    .replace(/^[-−]\s*/, '-')
    .replace(',', '.');
  if (!DECIMAL_PATTERN.test(normalized)) {
    return null;
  }
  const value = new Prisma.Decimal(normalized);
  return value.abs().lessThanOrEqualTo(MAX_CELL_MAGNITUDE) ? value : null;
}
