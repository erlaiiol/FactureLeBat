// Phase 9.5 manual mode: parsing/formatting for the free-form canvas's
// QUANTITY/UNIT_PRICE cells. Mirrors the backend's own parser
// (manual-cell-parser.util.ts) closely enough for the live totals preview
// (see docs/conventions.md's "no business-logic duplication" — this is the
// same narrow, marked exception calculation-preview.ts already is), but the
// backend remains the authority on what actually gets billed.

const DECIMAL_PATTERN = /^\d{1,9}(?:\.\d{1,3})?$/;

// Mirrors the backend's parseManualDecimalCell: a "€" sign anywhere is
// stripped before parsing, since formatManualPrice below adds one to every
// UNIT_PRICE/LINE_TOTAL cell automatically — an artisan typing it by hand,
// or a value round-tripped through formatting, must still parse.
export function parseManualNumber(raw: string): number | null {
  const normalized = raw.trim().replace(/€/g, '').trim().replace(',', '.');
  if (!DECIMAL_PATTERN.test(normalized)) {
    return null;
  }
  return Number(normalized);
}

// "Mettre en forme": normalizes a quantity cell to a clean decimal string
// (no trailing zeros, comma decimal separator to match French conventions)
// — never touches a cell that doesn't parse, so a typo is left visible
// rather than silently discarded.
export function formatManualQuantity(raw: string): string {
  const value = parseManualNumber(raw);
  if (value === null) {
    return raw.trim();
  }
  return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',');
}

// "Mettre en forme": normalizes a unit-price/line-total cell to two
// decimals, comma separator, and a trailing "€", e.g. "1500" -> "1500,00 €".
// The artisan never has to type the € themselves — this runs on every
// "Mettre en forme" pass and on the "?" autofill button's writeback, and
// parseManualNumber above strips the sign back out, so it round-trips
// cleanly through both.
export function formatManualPrice(raw: string): string {
  const value = parseManualNumber(raw);
  if (value === null) {
    return raw.trim();
  }
  return `${value.toFixed(2).replace('.', ',')} €`;
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
