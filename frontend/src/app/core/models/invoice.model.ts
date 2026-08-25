import { ActivityCategory } from './report.model';
import { Unit } from './unit.model';

export type WasteSurcharge = 'NONE' | 'TEN' | 'TWENTY';
export type ServiceLineVisibility = 'VISIBLE' | 'REDISTRIBUTED';
export type RedistributionStrategy = 'EQUAL' | 'WEIGHTED';

// Phase 9.5: which input surface authored the invoice. GUIDED (default) is
// the pre-existing catalog/form-driven flow below. MANUAL is the free-form
// canvas — see the manual-* types further down.
export type InvoiceEntryMode = 'GUIDED' | 'MANUAL';

// Phase 14.3: a devis is mechanically a facture — same request/response
// shape everywhere below, just a different label and numbering sequence.
export type DocumentType = 'DEVIS' | 'FACTURE';

// Phase 1.1-8 (2026 e-invoicing reform): "nature de l'opération" — GUIDED
// derives it (never sent by the frontend), MANUAL sends an explicit choice.
// See CreateInvoiceRequest.manualNatureOfOperation and
// InvoiceWithTotals.manualNatureOfOperation.
export type NatureOperation = 'LIVRAISON_BIENS' | 'PRESTATION_SERVICES' | 'BIENS_ET_SERVICES';

// Phase 16: the invoice lifecycle board's payment status. "EN_RETARD" is
// deliberately not a value here — it's NON_PAYEE + dueDate in the past,
// computed client-side (see invoice-status.util.ts's isOverdue) never
// persisted.
export type InvoiceStatus = 'NON_PAYEE' | 'ACOMPTE_VERSE' | 'PAYEE' | 'ANNULEE';

// Phase 1.1-1: how a signature proof was captured — see
// InvoiceWithTotals.signatureMethod.
export type SignatureMethod = 'DRAWN' | 'PHOTO';

// Phase 1.2-4 (2026 e-invoicing reform) — mirrors backend's
// EInvoiceTransmissionStatus exactly.
export type EInvoiceTransmissionStatus =
  'NOT_SENT' | 'SENT' | 'VALIDATED' | 'DELIVERED' | 'ACCEPTED' | 'REJECTED';

// A manual invoice's column role. LINE_TOTAL is the artisan's own freehand
// row price — never derived from QUANTITY x UNIT_PRICE, which stay purely
// informational free text on the canvas (manual mode's whole principle:
// totals stay fully editable, never computed behind the artisan's back).
// CUSTOM is free text, never priced.
export type ManualColumnRole = 'DESCRIPTION' | 'QUANTITY' | 'UNIT_PRICE' | 'LINE_TOTAL' | 'CUSTOM';

export interface CreateManualColumnRequest {
  role: ManualColumnRole;
  label: string;
  widthPx?: number;
}

export interface CreateManualRowRequest {
  heightPx?: number;
  // Positional, aligned with CreateManualTableRequest.columns (cells[i]
  // targets columns[i]) — same convention as service lines' weights[i].
  cells: string[];
}

export interface CreateManualTableRequest {
  columns: CreateManualColumnRequest[];
  rows: CreateManualRowRequest[];
}

// Phase 7: the AREA/UNIT calculation mode is derived backend-side from
// `unit` (isAreaUnit()) — it is no longer a field the client sends.
export interface CreateInvoiceLineRequest {
  description: string;
  unit: Unit;
  quantity: number;
  unitPriceCents: number;
  wasteSurcharge?: WasteSurcharge;
  // Phase 8.5: how many `unit`s come in one sellable package (e.g. 9 for a
  // 9 m² box) — freehand, optional. roundUpToPackaging defaults to true
  // backend-side and is inert without a packagingQuantity.
  packagingQuantity?: number;
  roundUpToPackaging?: boolean;
  // Freehand product reference (e.g. "UC204850") — never a live reference to
  // a saved Product.
  productCode?: string;
  // Soft reference to a saved Product, if the artisan picked one — see
  // docs/conventions.md's "autofill, not a lock" rule.
  productId?: string;
  // Phase 15: per-line PDF rendering toggles, set from the mandatory
  // preview screen — purely a display concern, backend defaults both to
  // true when omitted.
  showUnitDetail?: boolean;
  showBillingDetail?: boolean;
  // Phase 17: snapshotted from the picked catalog Product's activityCategory
  // at the moment it was added to the invoice — see schema.prisma's comment
  // on InvoiceLine.activityCategory. Never a form field; carried silently.
  activityCategory?: ActivityCategory;
}

// Phase 5: a service added to the invoice, either its own visible amount or
// a hidden one redistributed into the `lines` above. `weights` is positional
// (aligned with `lines`) and only sent for the WEIGHTED strategy — EQUAL is
// implicit on the backend (see docs/conventions.md).
export interface CreateInvoiceServiceLineRequest {
  serviceId?: string;
  name: string;
  description?: string;
  amountCents: number;
  visibility: ServiceLineVisibility;
  redistributionStrategy?: RedistributionStrategy;
  weights?: number[];
  // Phase 17: same soft-snapshot rule as CreateInvoiceLineRequest.activityCategory.
  activityCategory?: ActivityCategory;
}

// Phase 32: a remise applied to the invoice. Unlike
// CreateInvoiceServiceLineRequest, there is no discountType/
// percentageBasisPoints here — a PERCENTAGE discount is resolved to a
// concrete amountCents client-side, at the moment it's added to the draft
// (see InvoiceDraftStore.resolvedDiscountAmountCents), same "computed at
// build time, not typed per invoice" precedent as a PERCENTAGE service line.
export interface CreateInvoiceDiscountLineRequest {
  discountId?: string;
  name: string;
  amountCents: number;
  // Phase 34: positional, aligned with CreateInvoiceRequest.lines/serviceLines
  // — mutually exclusive, both absent means this remise applies to the
  // invoice's general total (the pre-Phase-34 default). See
  // InvoiceDraftStore.buildInvoiceRequest for how these are resolved from a
  // draft line's stable clientId.
  targetLineIndex?: number;
  targetServiceLineIndex?: number;
}

// A freehand extra client field (e.g. label "SIRET", value "123 456 789
// 00012") — no fixed vocabulary, the artisan names the field themselves.
export interface CreateInvoiceCustomerFieldRequest {
  label: string;
  value: string;
}

export interface CreateInvoiceRequest {
  customerName: string;
  customerAddress?: string;
  customerEmail?: string;
  customerPhone?: string;
  // Phase 1.1-8 (2026 e-invoicing reform): autofilled from the picked
  // Customer at pick time, freehand-editable afterward — same soft-
  // reference spirit as customerAddress above. See
  // InvoiceDraftStore/ManualInvoiceDraftStore for where each is set.
  customerSiret?: string;
  deliveryAddress?: string;
  customerId?: string;
  customerFields?: CreateInvoiceCustomerFieldRequest[];
  // Phase 9.5: defaults to GUIDED backend-side when omitted, same as before
  // this field existed.
  entryMode?: InvoiceEntryMode;
  // Phase 14.3: defaults to FACTURE backend-side when omitted, same as
  // every pre-Phase-14.3 request.
  documentType?: DocumentType;
  // Required for entryMode GUIDED (the default), forbidden for MANUAL —
  // mirrors the backend's ManualModeFieldsConsistency cross-field rule.
  lines?: CreateInvoiceLineRequest[];
  serviceLines?: CreateInvoiceServiceLineRequest[];
  // Phase 32: remises applied to the invoice — optional, defaults to none.
  // Forbidden for entryMode MANUAL, mirrors the backend's
  // ManualModeFieldsConsistency rule.
  discountLines?: CreateInvoiceDiscountLineRequest[];
  // Required for entryMode MANUAL, forbidden for GUIDED.
  manualTable?: CreateManualTableRequest;
  // Phase 9.5 bis: manual mode's freely overridable aggregate figures — same
  // "nothing computed behind the artisan's back" principle as a row's
  // LINE_TOTAL cell. Forbidden for entryMode GUIDED (mirrors the backend's
  // ManualModeFieldsConsistency rule).
  subtotalOverrideCents?: number;
  vatOverrideCents?: number;
  totalOverrideCents?: number;
  // Manual mode only, mirrors the three overrides above: lets one document
  // diverge from the company's own default VAT regime (see
  // ManualInvoiceDraftStore.vatOverride). Forbidden for entryMode GUIDED —
  // mirrors the backend's ManualModeFieldsConsistency rule.
  vatApplicableOverride?: boolean;
  vatRateBasisPointsOverride?: number;
  // Phase 23: document-level PDF rendering toggle, set from the "Personnaliser
  // l'affichage" screen — hides the whole Quantité/Prix unitaire columns,
  // showing only description + line total. Purely a display concern, same
  // spirit as a line's showUnitDetail/showBillingDetail; defaults to false
  // backend-side when omitted.
  simplifiedDisplay?: boolean;
  // Phase 1.1-3: the requested deposit — both required together, FACTURE-only
  // (mirrors the backend's DepositFieldsConsistency rule). depositAmountCents
  // is the resolved euro amount actually tracked; depositPercentageBasisPoints
  // is kept alongside purely so the PDF can print the rate that produced it —
  // see InvoiceDraftStore/ManualInvoiceDraftStore's deposit autoCalc.
  depositPercentageBasisPoints?: number;
  depositAmountCents?: number;
  // Phase 1.1-7: "Autoliquidation (sous-traitance BTP)" — FACTURE-only,
  // mirrors the backend's ReverseChargeFactureOnly rule. Unlike
  // vatApplicableOverride, usable from both entryMode GUIDED and MANUAL.
  reverseChargeApplicable?: boolean;
  // Phase 1.1-8: MANUAL-only explicit choice — GUIDED derives its own
  // "nature de l'opération" backend-side and must never send this (mirrors
  // ManualModeFieldsConsistency). Omitted for MANUAL defaults to
  // PRESTATION_SERVICES backend-side.
  manualNatureOfOperation?: NatureOperation;
  // "Créer la facture à partir du devis": set when this draft was seeded
  // from an existing devis (see InvoiceDraftStore.loadFromInvoice /
  // ManualInvoiceDraftStore.loadFromInvoice) so the resulting facture stays
  // linked to it, same as InvoiceService.convertToFacture's one-shot clone.
  convertedFromDevisId?: string;
  // Phase 27: the artisan's own explicit document number, overriding the
  // "highest number ever used + 1" suggestion (see
  // InvoiceService.getNextNumber) — e.g. to continue the sequence from a
  // previous software. Absent/blank means "use the suggestion".
  number?: string;
}

export interface InvoiceLineWithTotal {
  id: string;
  position: number;
  description: string;
  unit: Unit;
  quantity: string;
  unitPriceCents: number;
  // Equal to unitPriceCents, except when a REDISTRIBUTED service line
  // folded a hidden share into this line's total — in that case this is
  // the recomputed price so that displayUnitPriceCents x billedQuantity
  // always reconciles with lineTotalExclVatCents. Always render this, not
  // unitPriceCents, wherever a "prix unitaire" is shown.
  displayUnitPriceCents: number;
  wasteSurcharge: WasteSurcharge;
  // Phase 8.5: what's actually priced, after waste surcharge and any
  // packaging rounding — equal to `quantity` whenever no packaging applies.
  billedQuantity: string;
  packagingQuantity: string | null;
  roundUpToPackaging: boolean;
  productCode: string | null;
  // Soft reference to the catalog Product this line was toggled on from,
  // null for a freehand line — lets "Mes produits" jump to the invoices
  // that used a given product, same entry point as "Mes clients".
  productId: string | null;
  // Phase 15: per-line PDF rendering toggles — purely a display concern,
  // never affects lineTotalExclVatCents below.
  showUnitDetail: boolean;
  showBillingDetail: boolean;
  activityCategory: ActivityCategory | null;
  lineTotalExclVatCents: number;
}

export interface InvoiceServiceLineWithAmounts {
  id: string;
  position: number;
  // Soft reference to the catalog Service this line was toggled on from,
  // null for a freehand service line — lets "Mes prestations" jump to the
  // invoices that used a given service, same entry point as "Mes clients".
  serviceId: string | null;
  name: string;
  description: string | null;
  amountCents: number;
  visibility: ServiceLineVisibility;
  activityCategory: ActivityCategory | null;
  distribution?: { invoiceLineId: string; amountCents: number }[];
}

// Phase 32: a remise applied to the invoice — always folds its amountCents
// straight into subtotalExclVatCents as a reduction, no visibility/
// redistribution concept.
export interface InvoiceDiscountLineWithAmount {
  id: string;
  position: number;
  // Soft reference to the catalog Discount this line was toggled on from,
  // null for a freehand remise — lets "Mes remises" jump to the invoices
  // that used a given discount, same entry point as "Mes clients".
  discountId: string | null;
  name: string;
  amountCents: number;
  // Phase 34: soft reference to the single product/service line (already on
  // this invoice) this remise is scoped to, if any — mutually exclusive,
  // both null for a remise on the invoice's general total. Purely
  // informational/percentage-base metadata: never changes how amountCents
  // folds into subtotalExclVatCents, nor the target's own displayed total.
  targetLineId: string | null;
  targetServiceLineId: string | null;
}

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
  cells: ManualInvoiceCellValue[];
  lineTotalExclVatCents: number;
}

export interface ManualInvoiceTableWithTotals {
  columns: ManualInvoiceColumnWithId[];
  rows: ManualInvoiceRowWithTotal[];
}

export interface InvoiceCustomerFieldWithId {
  id: string;
  label: string;
  value: string;
}

export interface InvoiceWithTotals {
  id: string;
  number: string;
  date: string;
  customerName: string;
  customerAddress: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerSiret: string | null;
  deliveryAddress: string | null;
  customerId: string | null;
  customerFields: InvoiceCustomerFieldWithId[];
  // Phase 14.3: convertedFromDevisId is set on a facture created by
  // converting a devis; convertedToFacture is set on that devis, pointing
  // the other way — both null otherwise.
  documentType: DocumentType;
  convertedFromDevisId: string | null;
  convertedToFacture: { id: string; number: string } | null;
  // Reverse-direction counterpart: set on a FACTURE a retroactive devis was
  // created from, pointing at that devis; createdFromFactureId is set on
  // the devis side, pointing back — both null otherwise.
  createdFromFactureId: string | null;
  retroactiveDevis: { id: string; number: string } | null;
  vatApplicable: boolean;
  vatRateBasisPoints: number;
  // Phase 9.5: GUIDED populates lines/serviceLines (manualTable absent).
  // MANUAL populates manualTable instead (lines/serviceLines stay empty
  // arrays, never undefined).
  entryMode: InvoiceEntryMode;
  lines: InvoiceLineWithTotal[];
  serviceLines: InvoiceServiceLineWithAmounts[];
  // Phase 32: always empty for entryMode MANUAL, same convention as
  // lines/serviceLines above.
  discountLines: InvoiceDiscountLineWithAmount[];
  manualTable?: ManualInvoiceTableWithTotals;
  // Phase 32: already net of every discountLines' amountCents — subtotalExclVatCents
  // + vatAmountCents === totalInclVatCents always holds.
  subtotalExclVatCents: number;
  vatAmountCents: number;
  totalInclVatCents: number;
  // Phase 12: last successful email send only, null if never sent.
  sentAt: string | null;
  sentToEmail: string | null;
  // Phase 16: the payment lifecycle board's fields.
  status: InvoiceStatus;
  dueDate: string | null;
  paidAt: string | null;
  lastReminderAt: string | null;
  // Phase 23: see CreateInvoiceRequest.simplifiedDisplay.
  simplifiedDisplay: boolean;
  // Phase 1.1-1: whether a real signature proof (drawn or photographed) is
  // attached — never the image bytes themselves (see
  // InvoiceService.signatureUrl for how those are fetched). The "signed"
  // checkbox shown on "Mes documents" is the computed
  // hasSignatureProof || manuallySigned, never a persisted field of its own.
  hasSignatureProof: boolean;
  signatureMethod: SignatureMethod | null;
  manuallySigned: boolean;
  // Phase 1.2-4 (2026 e-invoicing reform): the connected PA's transmission
  // lifecycle for this document — FactureLe's own vocabulary, not the PA's
  // raw status values (see backend's EInvoiceTransmissionStatus).
  eInvoiceTransmissionStatus: EInvoiceTransmissionStatus;
  eInvoiceTransmittedAt: string | null;
  eInvoiceRejectionReason: string | null;
  // Phase 1.3-3 (2026 e-invoicing reform, workflow automation): set while
  // this FACTURE is queued for automatic PA transmission
  // (Company.autoTransmitViaPa) — non-null and in the future means still
  // cancellable, see InvoiceListRowComponent.pendingAutoTransmit.
  scheduledTransmitAt: string | null;
  // Phase 1.1-3: the requested deposit — both null when none was requested,
  // both set together. depositPaidAt mirrors paidAt's "records the fact, not
  // a log" convention, set when status enters ACOMPTE_VERSE.
  depositPercentageBasisPoints: number | null;
  depositAmountCents: number | null;
  depositPaidAt: string | null;
  // Phase 1.1-7: see CreateInvoiceRequest's own comment.
  reverseChargeApplicable: boolean;
  // Phase 1.1-8: MANUAL-only, null for GUIDED — see CreateInvoiceRequest's
  // own comment.
  manualNatureOfOperation: NatureOperation | null;
}

// Phase 16: drives both the board's drag/button status changes and a
// due-date-only edit from an existing card (same status, new dueDate).
export interface UpdateInvoiceStatusRequest {
  status: InvoiceStatus;
  dueDate?: string;
}

// All optional: `to` defaults server-side to the invoice's own
// customerEmail, `subject`/`message` default to the backend's template.
export interface SendInvoiceEmailRequest {
  to?: string;
  subject?: string;
  message?: string;
}

// The exact subject/text send() would use if the artisan sends without
// touching them — see InvoiceService.getMailTemplate.
export interface InvoiceMailTemplate {
  subject: string;
  text: string;
}

// Phase 27: the suggested next document number — see InvoiceService.getNextNumber.
export interface NextNumberResponse {
  number: string;
}
