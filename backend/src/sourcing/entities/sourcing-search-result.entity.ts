// Wraps either result kind with the metadata the frontend needs to render
// the "beta" posture honestly: whether this came from cache (Phase 10:
// "reopening a line doesn't re-trigger a live search"), how much of the
// daily quota is left, and the standing verify-before-ordering notice.
export interface SourcingSearchResult<T> {
  results: T[];
  cached: boolean;
  searchesRemainingToday: number;
  disclaimer: string;
}
