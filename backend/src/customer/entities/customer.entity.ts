import { CustomerModel } from '../../../generated/prisma/models';

// Same indirection as CompanyProfile: the rest of the app depends on a
// domain name (CustomerProfile), not directly on Prisma's generated model.
export type CustomerProfile = CustomerModel;

// Phase 14.5: only GET /customers (the search/list screen) needs this —
// findById/create/update keep returning the plain CustomerProfile above.
// lastDevisDate/lastFactureDate are derived from Invoice at read time, never
// persisted (see CustomerRepository.findLastDocumentDatesByCustomer).
// matchSnippet is set only when the search term matched inside `description`
// rather than name/companyName/address, so the artisan sees *why* a result
// matched, not just that it did.
export interface CustomerSearchResult extends CustomerProfile {
  lastDevisDate: Date | null;
  lastFactureDate: Date | null;
  matchSnippet: string | null;
}
