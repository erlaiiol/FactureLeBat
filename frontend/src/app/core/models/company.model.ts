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
}
