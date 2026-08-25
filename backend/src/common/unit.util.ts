import { Unit } from '../../generated/prisma/enums';

// The curated unit vocabulary (Phase 7) is shared by two domains — the
// material catalog (Product.unit) and invoice lines (InvoiceLine.unit) —
// so it lives here rather than inside either domain folder, the same
// reasoning as company/legal-status.util.ts being imported cross-domain by
// invoice/.

// French display labels, used wherever a Unit enum value is shown to the
// artisan (PDF rendering, API consumers that don't want to hardcode their
// own copy).
export const UNIT_LABELS: Record<Unit, string> = {
  SQUARE_METER: 'm²',
  LINEAR_METER: 'ml',
  UNIT: 'unité',
  LUMP_SUM: 'forfait',
  HOUR: 'heure',
  DAY: 'jour',
  KILOGRAM: 'kg',
  LITER: 'litre',
  CUBIC_METER: 'm³',
};

// UN/ECE Recommendation 20 unit codes — Phase 1.2-3 (2026 e-invoicing
// reform): the Factur-X CII XML's BilledQuantity/unitCode needs the real
// unit regardless of whether the PDF happens to be showing it (see
// InvoiceMapper's own `showUnitDetail`-gated `unit` field, a display-only
// toggle — this map is keyed by the actual `Unit` enum, not by that
// already-blanked label, precisely so the two never get conflated again).
export const UNIT_CODES: Record<Unit, string> = {
  SQUARE_METER: 'MTK', // square metre
  LINEAR_METER: 'MTR', // metre
  UNIT: 'C62', // "one" — the generic UN/ECE piece/unit code
  LUMP_SUM: 'C62', // no dedicated lump-sum code; C62 is the conventional fallback
  HOUR: 'HUR',
  DAY: 'DAY',
  KILOGRAM: 'KGM',
  LITER: 'LTR',
  CUBIC_METER: 'MTQ',
};

// Only a square-meter line has area semantics (offcut/waste surcharge,
// billed-quantity multiplier) — every other unit bills as a plain
// quantity x unit price. This is the single source of truth the
// calculation service, the waste-surcharge validator, and the invoice
// mapper all derive the old AREA/UNIT distinction from — see
// docs/roadmap.md Phase 7 and docs/conventions.md's "derived data is
// never persisted" rule.
export function isAreaUnit(unit: Unit): boolean {
  return unit === Unit.SQUARE_METER;
}
