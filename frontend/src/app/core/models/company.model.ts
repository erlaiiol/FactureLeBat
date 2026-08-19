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
  // Appended as an extra paragraph to the default invoice/devis message on
  // every send — native "Partager" share, SMTP compose modal, mailto
  // fallback alike (see backend's buildDefaultInvoiceMailTemplate).
  invoiceMailCustomMessage: string | null;
  legalStatus: LegalStatus;
  vatRateBasisPoints: number;
  invoiceNumberPrefix: string;
  nextInvoiceNumber: number;
  // Phase 17: which period the quarterly report screen preselects, and the
  // artisan's own plafond micro-entrepreneur figure (cents) for the report's
  // warning banner — null when never set, in which case it simply doesn't show.
  declarationFrequency: DeclarationFrequency;
  microEntrepreneurCeiling: number | null;
  // Phase 1.1-3: the artisan's habitual acompte rate, basis points (3000 =
  // 30.00%) — null means no default, in which case mode rapide/mode
  // manuel's "Demander un acompte" toggle stays off until turned on
  // per-document.
  defaultDepositPercentageBasisPoints: number | null;
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
  // BTP mandatory mention (art. L243-2 du Code des assurances): the artisan
  // declares themself subject to garantie décennale, which requires stating
  // the insurer, policy number and geographic coverage area on every
  // invoice/devis. The three detail fields are null unless the flag is set.
  decennialInsuranceApplicable: boolean;
  decennialInsurerName: string | null;
  decennialInsurancePolicyNumber: string | null;
  decennialInsuranceCoverageArea: string | null;
  // Whether a logo has been uploaded (CompanyService.uploadLogo) — never the
  // image bytes themselves, see CompanyService.logoUrl for how the frontend
  // actually displays it.
  hasLogo: boolean;
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
  invoiceMailCustomMessage?: string;
  legalStatus: LegalStatus;
  vatRateBasisPoints: number;
  invoiceNumberPrefix?: string;
  declarationFrequency?: DeclarationFrequency;
  microEntrepreneurCeiling?: number;
  defaultDepositPercentageBasisPoints?: number;
  cotisationVenteBasisPoints?: number;
  cotisationPrestationBicBasisPoints?: number;
  cotisationPrestationBncBasisPoints?: number;
  versementLiberatoireOptIn?: boolean;
  decennialInsuranceApplicable: boolean;
  decennialInsurerName?: string;
  decennialInsurancePolicyNumber?: string;
  decennialInsuranceCoverageArea?: string;
}
