// Phase 7: the fixed, curated unit vocabulary — mirrors the backend's Unit
// enum (backend/src/common/unit.util.ts) exactly. The backend remains the
// source of truth for validation; this is the frontend's own copy purely
// for populating dropdowns and labelling values, same pattern already used
// for WasteSurcharge/ServiceLineVisibility display strings.
export type Unit =
  | 'SQUARE_METER'
  | 'LINEAR_METER'
  | 'UNIT'
  | 'LUMP_SUM'
  | 'HOUR'
  | 'DAY'
  | 'KILOGRAM'
  | 'LITER'
  | 'CUBIC_METER';

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

// Displayed in this fixed order in every dropdown — most common flooring
// units first (m², ml, unité), then the rest of the job-site vocabulary.
export const UNIT_OPTIONS: readonly { value: Unit; label: string }[] = [
  'SQUARE_METER',
  'LINEAR_METER',
  'UNIT',
  'LUMP_SUM',
  'HOUR',
  'DAY',
  'KILOGRAM',
  'LITER',
  'CUBIC_METER',
].map((value) => ({ value: value as Unit, label: UNIT_LABELS[value as Unit] }));

// Only a square-meter line has area semantics (waste surcharge, billed-
// quantity multiplier) — every other unit bills as a plain quantity x unit
// price. Single source of truth for the client-side preview calculation
// and for which form controls (waste surcharge) a unit choice exposes.
export function isAreaUnit(unit: Unit): boolean {
  return unit === 'SQUARE_METER';
}

// Labels the "price per base unit" toggle button in the invoice line form
// and product form. Deliberately never says "unité" for a package/lot (see
// UNIT_LABELS.UNIT above, a distinct, already-taken meaning) — each phrase
// reads naturally with its own unit instead of a generic "prix à l'unité".
export const UNIT_PRICE_BUTTON_LABELS: Record<Unit, string> = {
  SQUARE_METER: 'Prix au m²',
  LINEAR_METER: 'Prix au ml',
  UNIT: "Prix à l'unité",
  LUMP_SUM: 'Prix au forfait',
  HOUR: "Prix à l'heure",
  DAY: 'Prix au jour',
  KILOGRAM: 'Prix au kg',
  LITER: 'Prix au litre',
  CUBIC_METER: 'Prix au m³',
};

// The quantity field's own label — "Surface du chantier" only makes sense
// for an m² line; billing someone's time (HOUR) or a flat rate (LUMP_SUM)
// has nothing to do with a chantier's surface. Standalone version (used
// where the unit isn't shown anywhere else nearby, e.g. the expanded line
// form) versus the SHORT version (used next to a separate unit badge, e.g.
// the collapsed gallery card) — only differ by the parenthetical unit hint.
export const QUANTITY_LABELS: Record<Unit, string> = {
  SQUARE_METER: 'Surface du chantier (m²)',
  LINEAR_METER: 'Longueur du chantier (ml)',
  UNIT: 'Quantité',
  LUMP_SUM: 'Nombre de forfaits',
  HOUR: "Nombre d'heures",
  DAY: 'Nombre de jours',
  KILOGRAM: 'Poids (kg)',
  LITER: 'Volume (litres)',
  CUBIC_METER: 'Volume (m³)',
};

export const QUANTITY_LABELS_SHORT: Record<Unit, string> = {
  SQUARE_METER: 'Surface du chantier',
  LINEAR_METER: 'Longueur du chantier',
  UNIT: 'Quantité',
  LUMP_SUM: 'Nombre de forfaits',
  HOUR: "Nombre d'heures",
  DAY: 'Nombre de jours',
  KILOGRAM: 'Poids',
  LITER: 'Volume',
  CUBIC_METER: 'Volume',
};
