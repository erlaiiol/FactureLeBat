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

// Phase 16: the invoice lifecycle board's payment status. "EN_RETARD" is
// deliberately not a value here — it's NON_PAYEE + dueDate in the past,
// computed client-side (see invoice-status.util.ts's isOverdue) never
// persisted.
export type InvoiceStatus = 'NON_PAYEE' | 'PAYEE' | 'ANNULEE';

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
  // Phase 15: per-line PDF rendering toggles, set from the mandatory
  // preview screen — purely a display concern, backend defaults both to
  // true when omitted.
  showUnitDetail?: boolean;
  showBillingDetail?: boolean;
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
  // Required for entryMode MANUAL, forbidden for GUIDED.
  manualTable?: CreateManualTableRequest;
  // Phase 9.5 bis: manual mode's freely overridable aggregate figures — same
  // "nothing computed behind the artisan's back" principle as a row's
  // LINE_TOTAL cell. Forbidden for entryMode GUIDED (mirrors the backend's
  // ManualModeFieldsConsistency rule).
  subtotalOverrideCents?: number;
  vatOverrideCents?: number;
  totalOverrideCents?: number;
}

export interface InvoiceLineWithTotal {
  id: string;
  position: number;
  description: string;
  unit: Unit;
  quantity: string;
  unitPriceCents: number;
  wasteSurcharge: WasteSurcharge;
  // Phase 8.5: what's actually priced, after waste surcharge and any
  // packaging rounding — equal to `quantity` whenever no packaging applies.
  billedQuantity: string;
  packagingQuantity: string | null;
  roundUpToPackaging: boolean;
  productCode: string | null;
  // Phase 15: per-line PDF rendering toggles — purely a display concern,
  // never affects lineTotalExclVatCents below.
  showUnitDetail: boolean;
  showBillingDetail: boolean;
  lineTotalExclVatCents: number;
}

export interface InvoiceServiceLineWithAmounts {
  id: string;
  position: number;
  name: string;
  description: string | null;
  amountCents: number;
  visibility: ServiceLineVisibility;
  distribution?: { invoiceLineId: string; amountCents: number }[];
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
  customerId: string | null;
  customerFields: InvoiceCustomerFieldWithId[];
  // Phase 14.3: convertedFromDevisId is set on a facture created by
  // converting a devis; convertedToFacture is set on that devis, pointing
  // the other way — both null otherwise.
  documentType: DocumentType;
  convertedFromDevisId: string | null;
  convertedToFacture: { id: string; number: string } | null;
  vatApplicable: boolean;
  vatRateBasisPoints: number;
  // Phase 9.5: GUIDED populates lines/serviceLines (manualTable absent).
  // MANUAL populates manualTable instead (lines/serviceLines stay empty
  // arrays, never undefined).
  entryMode: InvoiceEntryMode;
  lines: InvoiceLineWithTotal[];
  serviceLines: InvoiceServiceLineWithAmounts[];
  manualTable?: ManualInvoiceTableWithTotals;
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
