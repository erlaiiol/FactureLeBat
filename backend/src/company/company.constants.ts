import { LegalStatus } from '../../generated/prisma/enums';

// FactureLeBat has no multi-tenant auth yet: exactly one Company row exists,
// always addressed by this fixed id.
export const SINGLETON_COMPANY_ID = '00000000-0000-0000-0000-000000000001';

// Shared default row shape for the singleton Company — every module that
// upserts it on a first-ever write (CompanyRepository, OnboardingRepository)
// reuses this so Company's required fields are defined in exactly one place.
export const DEFAULT_COMPANY_PROFILE = {
  name: 'Mon entreprise',
  siret: '',
  addressLine1: '',
  postalCode: '',
  city: '',
  legalStatus: LegalStatus.MICRO_ENTREPRENEUR,
} as const;
