import { InvoiceEntryMode } from '../../../generated/prisma/enums';

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

// Phase 9.5 manual mode. `cells` holds the artisan's raw typed text for
// every non-computed column (DESCRIPTION/QUANTITY/UNIT_PRICE/CUSTOM, in
// column order) exactly as stored — money formatting is not reapplied here,
// same "PdfService only ever renders plain text" boundary as InvoicePdfLine
// (the artisan's own "Mettre en forme" pass on the canvas is what cleans
// this up before submission, not the PDF layer). `totalCents` is the one
// computed value PdfService does format, rendered as a trailing "Total"
// column.
export interface InvoicePdfManualColumn {
  label: string;
}

export interface InvoicePdfManualRow {
  cells: string[];
  totalCents: number;
}

export interface InvoicePdfManualTable {
  columns: InvoicePdfManualColumn[];
  rows: InvoicePdfManualRow[];
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

  // Phase 9.5: GUIDED populates lines/serviceLines (manualTable absent).
  // MANUAL populates manualTable instead (lines/serviceLines stay empty
  // arrays, never undefined, so PdfService doesn't need to null-check them
  // just to know which table to render — it branches on entryMode instead).
  entryMode: InvoiceEntryMode;
  lines: InvoicePdfLine[];
  serviceLines: InvoicePdfServiceLine[];
  manualTable?: InvoicePdfManualTable;

  vatApplicable: boolean;
  vatRateBasisPoints: number;
  subtotalExclVatCents: number;
  vatAmountCents: number;
  totalInclVatCents: number;
}
