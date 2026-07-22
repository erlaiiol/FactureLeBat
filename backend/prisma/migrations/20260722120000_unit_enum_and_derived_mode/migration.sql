-- Phase 7: replace the free-text `unit` field with a fixed vocabulary, and
-- stop persisting `InvoiceLine.mode` — the AREA/UNIT calculation mode is now
-- derived from the chosen unit's semantics (see backend/src/common/unit.util.ts),
-- never stored, following the project's "derived data is never persisted" rule.

-- CreateEnum
CREATE TYPE "Unit" AS ENUM ('SQUARE_METER', 'LINEAR_METER', 'UNIT', 'LUMP_SUM', 'HOUR', 'DAY', 'KILOGRAM', 'LITER', 'CUBIC_METER');

-- Migrate InvoiceLine.unit: TEXT -> Unit, best-effort mapped from whatever
-- free text was typed so far. Anything unrecognized falls back to UNIT
-- (plain quantity x price, no area/waste semantics) rather than failing the
-- migration or guessing wrong into SQUARE_METER.
ALTER TABLE "InvoiceLine" ADD COLUMN "unit_new" "Unit";

UPDATE "InvoiceLine" SET "unit_new" = CASE
  WHEN lower(trim("unit")) IN ('m2', 'm²', 'metre carre', 'mètre carré') THEN 'SQUARE_METER'
  WHEN lower(trim("unit")) IN ('m3', 'm³', 'metre cube', 'mètre cube') THEN 'CUBIC_METER'
  WHEN lower(trim("unit")) IN ('ml', 'metre lineaire', 'mètre linéaire') THEN 'LINEAR_METER'
  WHEN lower(trim("unit")) IN ('kg', 'kilo', 'kilogramme') THEN 'KILOGRAM'
  WHEN lower(trim("unit")) IN ('l', 'litre', 'litres') THEN 'LITER'
  WHEN lower(trim("unit")) IN ('forfait') THEN 'LUMP_SUM'
  WHEN lower(trim("unit")) IN ('h', 'heure', 'heures') THEN 'HOUR'
  WHEN lower(trim("unit")) IN ('j', 'jour', 'jours') THEN 'DAY'
  WHEN lower(trim("unit")) IN ('u', 'unite', 'unité', 'unites', 'unités', 'piece', 'pièce') THEN 'UNIT'
  ELSE 'UNIT'
END::"Unit";

ALTER TABLE "InvoiceLine" ALTER COLUMN "unit_new" SET NOT NULL;
ALTER TABLE "InvoiceLine" DROP COLUMN "unit";
ALTER TABLE "InvoiceLine" RENAME COLUMN "unit_new" TO "unit";

-- `mode` is no longer stored — it is derived from `unit` on every read.
ALTER TABLE "InvoiceLine" DROP COLUMN "mode";
DROP TYPE "LineMode";

-- Migrate Product.unit the same way (no rows exist yet in this environment,
-- but the same best-effort mapping applies if any are ever seeded ahead of
-- this migration running).
ALTER TABLE "Product" ADD COLUMN "unit_new" "Unit";

UPDATE "Product" SET "unit_new" = CASE
  WHEN lower(trim("unit")) IN ('m2', 'm²', 'metre carre', 'mètre carré') THEN 'SQUARE_METER'
  WHEN lower(trim("unit")) IN ('m3', 'm³', 'metre cube', 'mètre cube') THEN 'CUBIC_METER'
  WHEN lower(trim("unit")) IN ('ml', 'metre lineaire', 'mètre linéaire') THEN 'LINEAR_METER'
  WHEN lower(trim("unit")) IN ('kg', 'kilo', 'kilogramme') THEN 'KILOGRAM'
  WHEN lower(trim("unit")) IN ('l', 'litre', 'litres') THEN 'LITER'
  WHEN lower(trim("unit")) IN ('forfait') THEN 'LUMP_SUM'
  WHEN lower(trim("unit")) IN ('h', 'heure', 'heures') THEN 'HOUR'
  WHEN lower(trim("unit")) IN ('j', 'jour', 'jours') THEN 'DAY'
  WHEN lower(trim("unit")) IN ('u', 'unite', 'unité', 'unites', 'unités', 'piece', 'pièce') THEN 'UNIT'
  ELSE 'UNIT'
END::"Unit";

ALTER TABLE "Product" ALTER COLUMN "unit_new" SET NOT NULL;
ALTER TABLE "Product" DROP COLUMN "unit";
ALTER TABLE "Product" RENAME COLUMN "unit_new" TO "unit";
