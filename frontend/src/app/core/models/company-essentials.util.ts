import { CompanyProfile } from './company.model';

// First-invoice-pipeline reversal: the fields that print as legal mentions
// on every invoice PDF (name/SIRET/address) — cosmetic to the PDF, never to
// the calculated total (unlike legalStatus/vatRateBasisPoints, gated
// separately by InvoiceDraftStore.vatRegimeConfirmed). Single source of
// truth for both CompanySettingsPage's soft "still missing" indicator and
// CompanyEssentialsGateService's hard gate at PDF-send/download time.
export const ESSENTIAL_COMPANY_FIELD_LABELS = {
  name: "Nom de l'entreprise",
  siret: 'SIRET',
  addressLine1: 'Adresse',
  postalCode: 'Code postal',
  city: 'Ville',
} as const;

export type EssentialCompanyField = keyof typeof ESSENTIAL_COMPANY_FIELD_LABELS;

export function isCompanyEssentialsComplete(profile: CompanyProfile): boolean {
  return getMissingCompanyEssentials(profile).length === 0;
}

export function getMissingCompanyEssentials(profile: CompanyProfile): EssentialCompanyField[] {
  return (Object.keys(ESSENTIAL_COMPANY_FIELD_LABELS) as EssentialCompanyField[]).filter(
    (field) => profile[field].trim() === '',
  );
}
