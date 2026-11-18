// Phase 9.5 manual mode: parsing/formatting for the free-form canvas's
// QUANTITY/UNIT_PRICE cells. Mirrors the backend's own parser
// (manual-cell-parser.util.ts) closely enough for the live totals preview
// (see docs/conventions.md's "no business-logic duplication" — this is the
// same narrow, marked exception calculation-preview.ts already is), but the
// backend remains the authority on what actually gets billed.

const DECIMAL_PATTERN = /^-?\d{1,9}(?:\.\d{1,3})?$/;

export interface ManualNumberParseOptions {
  // Table cells (QUANTITY/UNIT_PRICE/LINE_TOTAL) accept a leading minus — a
  // negative row is how a remise or an acompte déjà versé is written on the
  // manual canvas. The Sous-total/TVA/Total TTC override fields don't: the
  // backend rejects a negative override (an invoice can't total below zero,
  // that would be an avoir), so they keep the strict default.
  allowNegative?: boolean;
}

// Mirrors the backend's parseManualDecimalCell: a "€" sign anywhere is
// stripped before parsing, since formatManualPrice below adds one to every
// UNIT_PRICE/LINE_TOTAL cell automatically — an artisan typing it by hand,
// or a value round-tripped through formatting, must still parse. A leading
// "-" or typographic "−" (optionally followed by a space) is normalized the
// same way the backend does.
export function parseManualNumber(
  raw: string,
  { allowNegative = false }: ManualNumberParseOptions = {},
): number | null {
  const normalized = raw
    .trim()
    .replace(/€/g, '')
    .trim()
    .replace(/^[-−]\s*/, '-')
    .replace(',', '.');
  if (!DECIMAL_PATTERN.test(normalized)) {
    return null;
  }
  const value = Number(normalized);
  if (value < 0 && !allowNegative) {
    return null;
  }
  return value;
}

// Shorthand for the table-cell call sites, which all accept a sign.
export function parseManualCellNumber(raw: string): number | null {
  return parseManualNumber(raw, { allowNegative: true });
}

// "Mettre en forme": normalizes a quantity cell to a clean decimal string
// (no trailing zeros, comma decimal separator to match French conventions)
// — never touches a cell that doesn't parse, so a typo is left visible
// rather than silently discarded.
export function formatManualQuantity(raw: string): string {
  const value = parseManualCellNumber(raw);
  if (value === null) {
    return raw.trim();
  }
  return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',');
}

export interface ManualPriceFormatOptions {
  // A row added through "+ Remise / acompte" is a deduction by
  // construction, so the artisan can just type "150" and get "-150,00 €" —
  // no need to remember the minus sign. Never applied to an ordinary row:
  // there, the sign is exactly what the artisan typed.
  forceNegative?: boolean;
}

// "Mettre en forme": normalizes a unit-price/line-total cell to two
// decimals, comma separator, and a trailing "€", e.g. "1500" -> "1500,00 €",
// "-150" -> "-150,00 €". The artisan never has to type the € themselves —
// this runs on every "Mettre en forme" pass and on the "?" autofill
// button's writeback, and parseManualNumber above strips the sign back
// out, so it round-trips cleanly through both.
export function formatManualPrice(
  raw: string,
  { forceNegative = false }: ManualPriceFormatOptions = {},
): string {
  const parsed = parseManualCellNumber(raw);
  if (parsed === null) {
    return raw.trim();
  }
  const value = forceNegative ? -Math.abs(parsed) : parsed;
  // -0 would otherwise print as "-0,00 €".
  const normalized = value === 0 ? 0 : value;
  return `${normalized.toFixed(2).replace('.', ',')} €`;
}

// "Mettre en forme" on a free-text cell (description/CUSTOM column): trims
// and collapses internal whitespace only — no attempt to guess a numeric
// shape for content whose semantics the app doesn't know.
export function formatManualText(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

// A quantity cell on the manual canvas is free text (e.g. "2 boites",
// "10,5 m2") — never fed into the row's total (see LINE_TOTAL). This is only
// used by the "?" autofill helper to suggest a total from the first number
// it finds in that text, so the artisan doesn't have to retype it as a
// clean decimal just to get a starting point.
const LEADING_NUMBER_PATTERN = /-?\d+(?:[.,]\d+)?/;

export function parseManualQuantityMagnitude(raw: string): number | null {
  const match = LEADING_NUMBER_PATTERN.exec(raw);
  if (!match) {
    return null;
  }
  const value = Number(match[0].replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}
