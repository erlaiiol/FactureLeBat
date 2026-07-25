export interface CustomerProfile {
  id: string;
  name: string;
  companyName: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  siret: string | null;
  // Phase 14.5: freehand, optional — feeds search alongside name/companyName/
  // address (see CustomerService.getAll).
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

// Phase 14.5: only GET /customers (the search/list screen) returns this —
// findById/create/update keep returning the plain CustomerProfile above.
// lastDevisDate/lastFactureDate are derived from Invoice, never persisted.
// matchSnippet is set only when the search term matched inside `description`
// rather than name/companyName/address.
export interface CustomerSearchResult extends CustomerProfile {
  lastDevisDate: string | null;
  lastFactureDate: string | null;
  matchSnippet: string | null;
}

export type CustomerSortBy = 'alphabetique' | 'derniereFacture' | 'dernierDevis' | 'dateCreation';

export interface UpsertCustomerRequest {
  name: string;
  companyName?: string;
  address?: string;
  email?: string;
  phone?: string;
  siret?: string;
  description?: string;
}
