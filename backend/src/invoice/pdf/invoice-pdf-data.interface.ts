export interface InvoicePdfLine {
  description: string;
  unit: string;
  quantity: string;
  // Phase 8.5: only set when packaging rounding actually changed the
  // priced quantity away from the raw site quantity above — PdfService
  // renders it as a small clarifying note, never silently.
  billedQuantity?: string;
  unitPriceCents: number;
  totalCents: number;
}

// Only VISIBLE service lines (Phase 5) ever reach the PDF as their own
// entry — REDISTRIBUTED ones are already folded into the lines above by the
// time InvoiceMapper builds this object, and must never appear here too.
export interface InvoicePdfServiceLine {
  name: string;
  amountCents: number;
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
  serviceLines: InvoicePdfServiceLine[];

  vatApplicable: boolean;
  vatRateBasisPoints: number;
  subtotalExclVatCents: number;
  vatAmountCents: number;
  totalInclVatCents: number;
}
