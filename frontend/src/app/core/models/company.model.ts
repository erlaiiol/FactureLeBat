import { DeclarationFrequency } from './report.model';

export type LegalStatus = 'MICRO_ENTREPRENEUR' | 'COMPANY';

export interface CompanyProfile {
  id: string;
  name: string;
  siret: string;
  addressLine1: string;
  addressLine2: string | null;
  postalCode: string;
  city: string;
  email: string | null;
  phone: string | null;
  legalStatus: LegalStatus;
  vatRateBasisPoints: number;
  invoiceNumberPrefix: string;
  nextInvoiceNumber: number;
  // Phase 17: which period the quarterly report screen preselects, and the
  // artisan's own plafond micro-entrepreneur figure (cents) for the report's
  // warning banner — null when never set, in which case it simply doesn't show.
  declarationFrequency: DeclarationFrequency;
  microEntrepreneurCeiling: number | null;
  // Phase 17 (charges estimate): micro-entrepreneur "cotisations sociales"
  // rates, basis points (1230 = 12.30%) — pre-filled with the official
  // rates, but artisan-editable since they're revised periodically and vary
  // for a Cipav-affiliated profession. Only meaningful when legalStatus is
  // MICRO_ENTREPRENEUR.
  cotisationVenteBasisPoints: number;
  cotisationPrestationBicBasisPoints: number;
  cotisationPrestationBncBasisPoints: number;
  // Whether this micro-entrepreneur opted for the versement libératoire de
  // l'impôt sur le revenu at registration — see report.model.ts's
  // EstimatedCharges for how this feeds the quarterly report's estimate.
  versementLiberatoireOptIn: boolean;
}

export interface UpdateCompanyRequest {
  name: string;
  siret: string;
  addressLine1: string;
  addressLine2?: string;
  postalCode: string;
  city: string;
  email?: string;
  phone?: string;
  legalStatus: LegalStatus;
  vatRateBasisPoints: number;
  invoiceNumberPrefix?: string;
  declarationFrequency?: DeclarationFrequency;
  microEntrepreneurCeiling?: number;
  cotisationVenteBasisPoints?: number;
  cotisationPrestationBicBasisPoints?: number;
  cotisationPrestationBncBasisPoints?: number;
  versementLiberatoireOptIn?: boolean;
}
