import { Unit } from '../../../../generated/prisma/enums';

// A draft, not a Product: every extracted field is best-effort and nullable.
// Nothing here is ever persisted directly — the artisan reviews and edits
// this in the product form before a real POST /products call (see
// conventions.md's "autofill, not a lock" rule). `unit` is only ever one of
// the fixed Unit values (Phase 7) or null when nothing recognizable was
// found on the page — never a raw scraped token.
export interface ImportedProductDraft {
  name: string | null;
  description: string | null;
  unit: Unit | null;
  priceCents: number | null;
  supplierName: string | null;
  supplierUrl: string;
}
