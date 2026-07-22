export interface InvoicePdfLine {
  description: string;
  unit: string;
  quantity: string;
  unitPriceCents: number;
  totalCents: number;
}

// Plain, serializable data object built by InvoiceService and handed to
// PdfService — the PDF generator has no knowledge of Prisma or business
// rules beyond formatting this object.
export interface InvoicePdfData {
  number: string;
  date: Date;

  issuerName: string;
  issuerAddressLine1: string;
  issuerAddressLine2: string | null;
  issuerPostalCode: string;
  issuerCity: string;
  issuerSiret: string;
  issuerEmail: string | null;
  issuerPhone: string | null;

  customerName: string;
  customerAddress: string | null;
  customerEmail: string | null;
  customerPhone: string | null;

  lines: InvoicePdfLine[];

  vatApplicable: boolean;
  vatRateBasisPoints: number;
  subtotalExclVatCents: number;
  vatAmountCents: number;
  totalInclVatCents: number;
}
