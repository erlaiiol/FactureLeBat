import {
  ActivityCategory,
  DocumentType,
  InvoiceEntryMode,
  InvoiceStatus,
  ManualColumnRole,
  ServiceVisibility,
  SignatureMethod,
  Unit,
  WasteSurcharge,
} from '../../../generated/prisma/enums';

export interface InvoiceLineWithTotal {
  id: string;
  position: number;
  description: string;
  // Phase 7: a fixed enum, not free text — the AREA/UNIT calculation mode
  // is derived from it (isAreaUnit()), never a separate response field.
  unit: Unit;
  // Serialized as a string (Prisma Decimal -> toString()), not a JS number:
  // JSON has no decimal type, and round-tripping through a float here would
  // reintroduce exactly the precision risk Decimal exists to avoid.
  quantity: string;
  unitPriceCents: number;
  // Equal to unitPriceCents, except when a REDISTRIBUTED service line
  // folded a share into this line's lineTotalExclVatCents below — in that
  // case this is recomputed from the adjusted total so that displaying
  // displayUnitPriceCents x billedQuantity always reconciles with what's
  // printed as the line total. This is what should be rendered everywhere
  // a "prix unitaire" column is shown; unitPriceCents above stays the raw,
  // unadjusted value.
  displayUnitPriceCents: number;
  wasteSurcharge: WasteSurcharge;
  // Phase 8.5: the quantity actually priced, after waste surcharge and any
  // packaging rounding — see InvoiceCalculationService.computeLineTotal.
  // Equal to `quantity` (as a string) whenever no packaging rounding
  // applies; never persisted, always recomputed here.
  billedQuantity: string;
  packagingQuantity: string | null;
  roundUpToPackaging: boolean;
  productCode: string | null;
  // Soft reference to the catalog Product this line was toggled on from —
  // see schema.prisma's comment on InvoiceLine.productId. Null for a
  // freehand line. Lets "Mes produits" jump to the invoices that used a
  // given product, same entry point as "Mes clients" already has via
  // InvoiceWithTotals.customerId.
  productId: string | null;
  // Phase 15: per-line PDF rendering toggles, set from the mandatory
  // preview screen — purely a display concern, never affects the totals
  // below. See schema.prisma's comment on InvoiceLine.showUnitDetail.
  showUnitDetail: boolean;
  showBillingDetail: boolean;
  // Phase 17: snapshotted at creation from the picked catalog Product — see
  // schema.prisma's comment on InvoiceLine.activityCategory. Null for a
  // freehand line or an uncategorized product.
  activityCategory: ActivityCategory | null;
  // Includes any amount redistributed onto this line by a REDISTRIBUTED
  // service line (Phase 5) — always recomputed, never persisted (see
  // InvoiceMapper.toInvoiceWithTotals).
  lineTotalExclVatCents: number;
}

// A REDISTRIBUTED service line's amount, split (see InvoiceCalculationService.
// computeWeightedSplit) — exposed so the artisan can see where the hidden
// amount actually went, even though it's baked into the line totals above
// rather than a total shown on its own.
export interface ServiceLineDistributionEntry {
  invoiceLineId: string;
  amountCents: number;
}

export interface InvoiceServiceLineWithAmounts {
  id: string;
  position: number;
  // Soft reference to the catalog Service this line was toggled on from —
  // see schema.prisma's comment on InvoiceServiceLine.serviceId. Null for a
  // freehand service line. Lets "Mes prestations" jump to the invoices that
  // used a given service, same entry point as "Mes clients" already has via
  // InvoiceWithTotals.customerId.
  serviceId: string | null;
  name: string;
  description: string | null;
  amountCents: number;
  visibility: ServiceVisibility;
  // Phase 17: snapshotted at creation from the picked catalog Service —
  // see schema.prisma's comment on InvoiceServiceLine.activityCategory.
  activityCategory: ActivityCategory | null;
  // Only present for REDISTRIBUTED lines.
  distribution?: ServiceLineDistributionEntry[];
}

// Phase 32: a remise applied to the invoice — always folds its amountCents
// straight into subtotalExclVatCents as a reduction, no visibility/
// redistribution concept (see schema.prisma's comment on InvoiceDiscountLine).
export interface InvoiceDiscountLineWithAmount {
  id: string;
  position: number;
  // Soft reference to the catalog Discount this line was toggled on from —
  // see schema.prisma's comment on InvoiceDiscountLine.discountId. Null for
  // a freehand remise. Lets "Mes remises" jump to the invoices that used a
  // given discount, same entry point as "Mes clients" already has via
  // InvoiceWithTotals.customerId.
  discountId: string | null;
  name: string;
  amountCents: number;
  // Phase 34: soft reference to the single product/service line (already on
  // this invoice) this remise is scoped to, if any — mutually exclusive,
  // both null for a remise on the invoice's general total. Purely
  // informational: never changes how amountCents folds into
  // subtotalExclVatCents (see InvoiceMapper) or that target line's own
  // lineTotalExclVatCents/amountCents.
  targetLineId: string | null;
  targetServiceLineId: string | null;
}

// Phase 9.5 manual mode — see ManualColumnRole (schema.prisma) for what each
// role means for pricing.
export interface ManualInvoiceColumnWithId {
  id: string;
  position: number;
  role: ManualColumnRole;
  label: string;
  widthPx: number | null;
}

export interface ManualInvoiceCellValue {
  columnId: string;
  value: string;
}

export interface ManualInvoiceRowWithTotal {
  id: string;
  position: number;
  heightPx: number | null;
  // Positional with the invoice's manualTable.columns, one entry per column.
  cells: ManualInvoiceCellValue[];
  // Never persisted — recomputed on every read from the QUANTITY/UNIT_PRICE
  // cells, same "derived data is never persisted" rule as a GUIDED line's
  // lineTotalExclVatCents (see InvoiceMapper.toManualInvoiceWithTotals).
  lineTotalExclVatCents: number;
}

export interface ManualInvoiceTableWithTotals {
  columns: ManualInvoiceColumnWithId[];
  rows: ManualInvoiceRowWithTotal[];
}

// A freehand extra client field (e.g. "SIRET") — see InvoiceCustomerField
// (schema.prisma).
export interface InvoiceCustomerFieldWithId {
  id: string;
  label: string;
  value: string;
}

export interface InvoiceWithTotals {
  id: string;
  number: string;
  date: Date;
  customerName: string;
  customerAddress: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerId: string | null;
  customerFields: InvoiceCustomerFieldWithId[];
  // Phase 14.3: a devis is mechanically a facture — see DocumentType
  // (schema.prisma). convertedFromDevisId/convertedToFacture are the two
  // ends of the same conversion link: set on the facture / the devis
  // respectively, both null otherwise.
  documentType: DocumentType;
  convertedFromDevisId: string | null;
  convertedToFacture: { id: string; number: string } | null;
  // Reverse-direction counterpart of the pair above: set on a FACTURE that
  // a retroactive devis was created from (InvoiceService.convertToDevis),
  // pointing at that devis. createdFromFactureId is the devis-side field.
  createdFromFactureId: string | null;
  retroactiveDevis: { id: string; number: string } | null;
  vatApplicable: boolean;
  vatRateBasisPoints: number;
  // Phase 9.5: GUIDED populates lines/serviceLines below (manualTable is
  // absent). MANUAL populates manualTable instead (lines/serviceLines are
  // always present but empty, so existing consumers of this shape don't
  // need an extra null-check).
  entryMode: InvoiceEntryMode;
  lines: InvoiceLineWithTotal[];
  serviceLines: InvoiceServiceLineWithAmounts[];
  // Phase 32: always empty for entryMode MANUAL (see
  // ManualModeFieldsConsistency, which forbids discountLines there) — always
  // present, never undefined, same convention as lines/serviceLines above.
  discountLines: InvoiceDiscountLineWithAmount[];
  manualTable?: ManualInvoiceTableWithTotals;
  // Phase 32: already net of every discountLines' amountCents (folded in the
  // same way visible service lines add to it) — subtotalExclVatCents +
  // vatAmountCents === totalInclVatCents always holds, so a discount is
  // never a separate subtraction consumers need to remember to apply.
  // Floored at 0 — see InvoiceMapper.
  subtotalExclVatCents: number;
  vatAmountCents: number;
  totalInclVatCents: number;
  // Phase 12: last successful email send only, null if never sent — see
  // schema.prisma's comment on Invoice.sentAt.
  sentAt: Date | null;
  sentToEmail: string | null;
  // Phase 16: the payment lifecycle board's fields — see InvoiceStatus
  // (schema.prisma). "En retard" is not a value here: it's status ===
  // NON_PAYEE with dueDate in the past, computed by the caller/frontend.
  status: InvoiceStatus;
  dueDate: Date | null;
  paidAt: Date | null;
  lastReminderAt: Date | null;
  // Phase 1.1-3: the requested deposit — both null if none was requested,
  // both set together (see schema.prisma's comment on
  // Invoice.depositPercentageBasisPoints). depositPaidAt mirrors paidAt's
  // "records the fact, not a log" convention, set when status enters
  // ACOMPTE_VERSE and cleared if moved back out.
  depositPercentageBasisPoints: number | null;
  depositAmountCents: number | null;
  depositPaidAt: Date | null;
  // Phase 23: see schema.prisma's comment on Invoice.simplifiedDisplay.
  simplifiedDisplay: boolean;
  // Phase 1.1-1: whether a real InvoiceSignature is attached — never the
  // image bytes themselves (see InvoiceService.getSignatureImage/
  // InvoiceController.serveSignature for the one place those are read).
  hasSignatureProof: boolean;
  signatureMethod: SignatureMethod | null;
  // The freehand fallback — only interactive (from the frontend) while
  // hasSignatureProof is false; the "signed" checkbox itself is the
  // frontend-computed hasSignatureProof || manuallySigned, never persisted
  // as its own field. See schema.prisma's comment on Invoice.manuallySigned.
  manuallySigned: boolean;
}
