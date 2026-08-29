import {
  DocumentType,
  InvoiceEntryMode,
  NatureOperation,
  SimplifiedDisplayLevel,
} from '../../../generated/prisma/enums';

export interface InvoicePdfLine {
  description: string;
  unit: string;
  // Phase 1.2-3 (2026 e-invoicing reform): the UN/ECE Recommendation 20 unit
  // code for the Factur-X CII XML — always populated from the real `Unit`
  // enum via common/unit.util.ts's UNIT_CODES, independent of `unit` above
  // (which blanks to '' when the artisan's showUnitDetail toggle is off,
  // a purely cosmetic PDF choice this field must never inherit).
  unitCode: string;
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
  // Phase 1.2-2 (2026 e-invoicing reform): the seller VAT-ID node Factur-X/
  // EN16931-family XML expects — null for a franchise-en-base company that
  // has no VAT number at all.
  issuerVatNumber: string | null;
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
  // Phase 1.1-6: the artisan's free-text footer mention, already resolved
  // against this document's documentType by InvoiceMapper.issuerFields
  // (customFooterOnFacture/customFooterOnDevis) — null whenever the toggle
  // for this document type is off or the message is empty, in which case
  // PdfService.buildFooter renders nothing extra for it. PdfService itself
  // never reads the two raw Company toggles.
  customFooterMessage: string | null;
  // Phase 1.1-7: Art. L441-9's escompte-policy mention, raw from Company —
  // gating on whether it actually prints (customerIsProfessional AND
  // documentType FACTURE) happens in PdfService.buildFooter, not here, since
  // that's a plain per-document-type rendering choice PdfService already
  // makes elsewhere (see buildHeader's own documentType branch). Almost
  // never null in practice (DB default, see schema.prisma) — null only for
  // a Company row that had it explicitly cleared.
  earlyPaymentDiscountMention: string | null;
  // Phase 1.1-8 (2026 e-invoicing reform): same toggle-prints-a-fixed-mention
  // pattern as earlyPaymentDiscountMention — raw from Company, FACTURE-only
  // gating happens in PdfService.buildFooter.
  vatOnDebitsOption: boolean;
  // Phase 1.1-1: the attached signature proof (drawn or photographed), if
  // any — null for a preview (no id yet) and for a persisted invoice with
  // none attached. PdfService composites it near the totals block whenever
  // present, same rendering precedent as issuerLogo above.
  signature: { base64: string; mimeType: string } | null;

  // Phase 1.1-7: live from Customer.isProfessional (never snapshotted, see
  // InvoiceWithLines.customer's own comment) — false whenever no Customer is
  // linked. Gates the 40€/pénalités mention, the "Délai de règlement" line,
  // and earlyPaymentDiscountMention, all FACTURE-only (see buildFooter).
  customerIsProfessional: boolean;
  customerName: string;
  customerAddress: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  // Phase 1.1-8 (2026 e-invoicing reform): PdfService prints the SIREN (its
  // first 9 digits) when present — see schema.prisma's comment on
  // Invoice.customerSiret.
  customerSiret: string | null;
  // Printed only when it actually differs from customerAddress above, at
  // render time — see schema.prisma's comment on Invoice.deliveryAddress.
  deliveryAddress: string | null;
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
  // Phase 23 / Phase 1.2-4: GUIDED-only — escalates how much detail
  // PdfService.buildLinesTable renders (see SimplifiedDisplayLevel). Always
  // NONE for MANUAL, whose freehand column set has no fixed Quantité/Prix
  // unitaire columns to hide in the first place, and no single "the"
  // product/service to collapse GENERIC's consolidated row down to.
  simplifiedDisplay: SimplifiedDisplayLevel;

  vatApplicable: boolean;
  vatRateBasisPoints: number;
  subtotalExclVatCents: number;
  vatAmountCents: number;
  totalInclVatCents: number;

  // Phase 1.1-7: whether vatApplicable === false is specifically because of
  // an autoliquidation, not franchise en base (companyVatExempt) or a
  // manual-mode artisan pick — the one thing that decides which of the two
  // zero-VAT legal citations PdfService.buildFooter prints. Always false
  // when vatApplicable is true (ReverseChargeFactureOnly + the VAT
  // computation in InvoiceService/InvoiceMapper guarantee the two never
  // disagree).
  reverseChargeApplicable: boolean;

  // Phase 1.1-8 (2026 e-invoicing reform): "nature de l'opération" — already
  // resolved by InvoiceMapper (derived from lines/serviceLines for GUIDED,
  // read from Invoice.manualNatureOfOperation — defaulting to
  // PRESTATION_SERVICES — for MANUAL). Always a real value, never null:
  // every invoice has one, whether derived or explicitly chosen.
  natureOfOperation: NatureOperation;

  // Phase 16: null for a preview (nothing persisted yet, see
  // InvoiceMapper.toPreviewPdfData) and for a persisted invoice with none
  // set (dueDate is captured lazily, see schema.prisma). Phase 1.1-7:
  // printed as "Délai de règlement" on a FACTURE to a professional client —
  // the first time this field is rendered as the legal mention it also is.
  dueDate: Date | null;

  // Phase 1.1-3: the requested deposit — both null whenever none was
  // requested, in which case PdfService.buildTotals prints nothing extra
  // (pixel-identical to before this phase, same "only render when present"
  // precedent as discountLines). depositPaidAt renders a second line once
  // set ("Acompte réglé le ...").
  depositPercentageBasisPoints: number | null;
  depositAmountCents: number | null;
  depositPaidAt: Date | null;
}
