import { Unit } from './unit.model';

// Mirrors the backend's SupplierCandidate (Phase 10) — every field is
// best-effort, informational only, never auto-added to an invoice. See
// docs/roadmap.md Phase 10.
export interface SupplierCandidate {
  name: string;
  priceRaw: string | null;
  priceCents: number | null;
  sourceName: string | null;
  sourceUrl: string | null;
}

export interface ComplementarySuggestion {
  name: string;
  reason: string;
  category: string | null;
}

export interface SourcingSearchResult<T> {
  results: T[];
  cached: boolean;
  searchesRemainingToday: number;
  disclaimer: string;
}

export interface SearchSuppliersRequest {
  productName: string;
  quantity: number;
  unit: Unit;
  customerLocation?: string;
  jobDate?: string;
}

export interface SuggestComplementaryRequest {
  productName: string;
  unit?: Unit;
}
