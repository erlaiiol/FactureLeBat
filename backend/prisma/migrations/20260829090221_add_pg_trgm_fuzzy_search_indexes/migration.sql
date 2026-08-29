-- Phase 1.4-1: fuzzy (typo/voice-transcription-tolerant) search for the
-- voice-draft endpoint only — see CustomerRepository/ProductRepository/
-- ServiceCatalogRepository's searchFuzzy() methods, which query these
-- indexes via similarity(). This app's other search surfaces stay plain
-- substring on purpose (docs/1.4/README.md's scope decision) and don't use
-- these indexes.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Customer_name_trgm_idx" ON "Customer" USING GIN (lower(name) gin_trgm_ops);

CREATE INDEX "Product_name_trgm_idx" ON "Product" USING GIN (lower(name) gin_trgm_ops);
CREATE INDEX "Product_code_trgm_idx" ON "Product" USING GIN (lower(code) gin_trgm_ops);

CREATE INDEX "Service_name_trgm_idx" ON "Service" USING GIN (lower(name) gin_trgm_ops);
CREATE INDEX "Service_code_trgm_idx" ON "Service" USING GIN (lower(code) gin_trgm_ops);
