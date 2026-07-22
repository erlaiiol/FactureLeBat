// Phase 9.5 manual mode: parsing/formatting for the free-form canvas's
// QUANTITY/UNIT_PRICE cells. Mirrors the backend's own parser
// (manual-cell-parser.util.ts) closely enough for the live totals preview
// (see docs/conventions.md's "no business-logic duplication" — this is the
// same narrow, marked exception calculation-preview.ts already is), but the
// backend remains the authority on what actually gets billed.

const DECIMAL_PATTERN = /^\d{1,9}(?:\.\d{1,3})?$/;

export function parseManualNumber(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
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

// "Mettre en forme": normalizes a unit-price cell to two decimals, comma
// separator, e.g. "1500" -> "1500,00".
export function formatManualPrice(raw: string): string {
  const value = parseManualNumber(raw);
  if (value === null) {
    return raw.trim();
  }
  return value.toFixed(2).replace('.', ',');
}

// "Mettre en forme" on a free-text cell (description/CUSTOM column): trims
// and collapses internal whitespace only — no attempt to guess a numeric
// shape for content whose semantics the app doesn't know.
export function formatManualText(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}
