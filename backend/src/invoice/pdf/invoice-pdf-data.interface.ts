import { DocumentType, InvoiceEntryMode } from '../../../generated/prisma/enums';

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

// Phase 32: a remise — always subtracted from the subtotal, rendered as its
// own row in PdfService.buildTotals rather than a separate table (unlike
// service lines above, a discount isn't "a thing sold", just a price
// adjustment). Empty for entryMode MANUAL, same convention as serviceLines.
export interface InvoicePdfDiscountLine {
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
  // Phase 14.3: DEVIS/FACTURE — see DocumentType (schema.prisma). Purely a
  // label choice for PdfService; nothing about the rest of this object
  // differs between the two.
  documentType: DocumentType;

  issuerName: string;
  issuerAddressLine1: string;
  issuerAddressLine2: string | null;
  issuerPostalCode: string;
  issuerCity: string;
  issuerSiret: string;
  issuerEmail: string | null;
  issuerPhone: string | null;
  // See InvoiceMapper.issuerFields — true only when the issuing company
  // itself is under the franchise en base de TVA, regardless of what this
  // particular invoice's vatApplicable below ends up being.
  companyVatExempt: boolean;
  // The artisan's own uploaded logo (CompanyLogo, see schema.prisma), shown
  // top-right on the PDF — null whenever none has been uploaded (the common
  // case), in which case PdfService renders nothing there at all.
  issuerLogo: { base64: string; mimeType: string } | null;
  // Whether PdfService.buildFooter appends the facturele.net signature block
  // — false only for a company whose effective plan tier's removesWatermark
  // is true (see PLAN_DEFINITIONS, InvoiceMapper.issuerFields).
  showWatermark: boolean;
  // BTP mandatory mention (art. L243-2 du Code des assurances) — see
  // InvoiceMapper.issuerFields. Null whenever the company isn't subject to
  // garantie décennale, in which case PdfService.buildFooter prints nothing
  // extra for it.
  decennialInsurance: { insurerName: string; policyNumber: string; coverageArea: string } | null;
  // Phase 1.1-1: the attached signature proof (drawn or photographed), if
  // any — null for a preview (no id yet) and for a persisted invoice with
  // none attached. PdfService composites it near the totals block whenever
  // present, same rendering precedent as issuerLogo above.
  signature: { base64: string; mimeType: string } | null;

  customerName: string;
  customerAddress: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  // Freehand, artisan-named extra client fields (e.g. "SIRET") — rendered
  // after the fixed fields above, same order they were entered in.
  customerFields: { label: string; value: string }[];

  // Phase 9.5: GUIDED populates lines/serviceLines (manualTable absent).
  // MANUAL populates manualTable instead (lines/serviceLines stay empty
  // arrays, never undefined, so PdfService doesn't need to null-check them
  // just to know which table to render — it branches on entryMode instead).
  entryMode: InvoiceEntryMode;
  lines: InvoicePdfLine[];
  serviceLines: InvoicePdfServiceLine[];
  discountLines: InvoicePdfDiscountLine[];
  manualTable?: InvoicePdfManualTable;
  // Phase 23: GUIDED-only — hides the whole Quantité/Prix unitaire columns
  // in PdfService.buildLinesTable, leaving only description + total. Always
  // false for MANUAL, whose freehand column set has no fixed Quantité/Prix
  // unitaire columns to hide in the first place.
  simplifiedDisplay: boolean;

  vatApplicable: boolean;
  vatRateBasisPoints: number;
  subtotalExclVatCents: number;
  vatAmountCents: number;
  totalInclVatCents: number;

  // Phase 1.1-3: the requested deposit — both null whenever none was
  // requested, in which case PdfService.buildTotals prints nothing extra
  // (pixel-identical to before this phase, same "only render when present"
  // precedent as discountLines). depositPaidAt renders a second line once
  // set ("Acompte réglé le ...").
  depositPercentageBasisPoints: number | null;
  depositAmountCents: number | null;
  depositPaidAt: Date | null;
}
