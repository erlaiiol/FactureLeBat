-- Phase 1.2-4: extends the "simplifiedDisplay" boolean PDF-rendering toggle
-- into a 3-level enum (NONE/SIMPLIFIED/GENERIC) — see SimplifiedDisplayLevel
-- and Invoice.simplifiedDisplay in schema.prisma. Existing true rows become
-- SIMPLIFIED (today's only "simplified" behavior); false becomes NONE.

CREATE TYPE "SimplifiedDisplayLevel" AS ENUM ('NONE', 'SIMPLIFIED', 'GENERIC');

ALTER TABLE "Invoice" ADD COLUMN "simplifiedDisplayLevel" "SimplifiedDisplayLevel" NOT NULL DEFAULT 'NONE';

UPDATE "Invoice" SET "simplifiedDisplayLevel" = 'SIMPLIFIED' WHERE "simplifiedDisplay" = true;

ALTER TABLE "Invoice" DROP COLUMN "simplifiedDisplay";

ALTER TABLE "Invoice" RENAME COLUMN "simplifiedDisplayLevel" TO "simplifiedDisplay";
