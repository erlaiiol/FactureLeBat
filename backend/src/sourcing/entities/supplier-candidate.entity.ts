// One supplier result for a "Trouver des fournisseurs" search — informational
// only, never a persisted catalog reference (see docs/roadmap.md Phase 10:
// "never auto-added to the invoice"). Every field is best-effort: the model
// read a real web page, but nothing here is guaranteed accurate or current.
export interface SupplierCandidate {
  name: string;
  // The price exactly as read off the source page — never recalculated or
  // trusted as authoritative money, same reasoning as ImportedProductDraft.
  // See docs/conventions.md's financial-data rule: this is display-only
  // metadata about an external offer, not a value this app bills against.
  priceRaw: string | null;
  // Best-effort cents parse of priceRaw (common/price.util.ts) for sorting/
  // display convenience — null whenever priceRaw didn't parse cleanly.
  priceCents: number | null;
  sourceName: string | null;
  // Only ever a validated http(s) URL — see groq-response.util.ts. Null
  // rather than a possibly-unsafe scheme (e.g. javascript:) reaching the
  // frontend as a clickable link.
  sourceUrl: string | null;
}
