// A draft, not a Product: every extracted field is best-effort and nullable.
// Nothing here is ever persisted directly — the artisan reviews and edits
// this in the product form before a real POST /products call (see
// conventions.md's "autofill, not a lock" rule).
export interface ImportedProductDraft {
  name: string | null;
  description: string | null;
  unit: string | null;
  priceCents: number | null;
  supplierName: string | null;
  supplierUrl: string;
}
