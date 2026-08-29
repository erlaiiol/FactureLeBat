// Phase 1.4-1: the shape every `searchFuzzy` repository method
// (CustomerRepository/ProductRepository/ServiceCatalogRepository) returns
// — the matched row plus the pg_trgm similarity score that ranked it, so a
// caller (an LLM tool result, or the rule-based resolver's own confidence
// heuristic) can tell a confident single match from a weak guess instead
// of only ever seeing an unordered, unscored list.
export interface FuzzyMatch<T> {
  row: T;
  score: number;
}
