import { LegalStatus } from '../../generated/prisma/enums';

// Shared default row shape for a freshly-registered artisan's Company —
// UserRepository.createWithCompany() (Phase 13) is the only place a Company
// row is ever created now, always alongside its owning User in the same
// transaction. Kept here (rather than inlined in auth/) since it's the same
// "required fields defaults" concern CompanyController's profile form fills
// in afterward.
export const DEFAULT_COMPANY_PROFILE = {
  name: 'Mon entreprise',
  siret: '',
  addressLine1: '',
  postalCode: '',
  city: '',
  legalStatus: LegalStatus.MICRO_ENTREPRENEUR,
} as const;
