// Phase 17: PdfService knows nothing about Prisma/reports business logic —
// same "PDF generation must be isolated from business logic" convention as
// InvoicePdfData (see docs/conventions.md). ReportsService is responsible
// for turning a QuarterlyReport into this shape (already-formatted labels,
// never a raw enum), the same split InvoiceMapper.toPdfData already applies.
export interface ReportPdfCategoryRow {
  label: string;
  totalExclVatCents: number;
}

export interface ReportPdfInvoiceRow {
  number: string;
  customerName: string;
  paidAt: Date;
  totalInclVatCents: number;
}

export interface ReportPdfEstimatedChargesRow {
  label: string;
  totalExclVatCents: number;
  cotisationRatePercent: string;
  cotisationCents: number;
}

// Phase 17 (charges estimate): applicable is false for anything but a
// micro-entrepreneur — see EstimatedCharges' own comment (reports module)
// for why PdfService renders an honest message instead of a number in that
// case, rather than a silently misleading estimate.
export interface ReportPdfEstimatedCharges {
  applicable: boolean;
  versementLiberatoireOptIn: boolean;
  rows: ReportPdfEstimatedChargesRow[];
  cotisationsSocialesCents: number;
  versementLiberatoireCents: number;
  totalEstimatedCents: number;
  uncategorizedExclVatCents: number;
}

export interface ReportPdfData {
  issuerName: string;
  periodLabel: string;
  totalExclVatCents: number;
  categories: ReportPdfCategoryRow[];
  invoices: ReportPdfInvoiceRow[];
  plafondWarning: { ceilingCents: number; yearToDateCents: number; percentageUsed: number } | null;
  estimatedCharges: ReportPdfEstimatedCharges;
}
