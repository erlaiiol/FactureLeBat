import { Unit } from './unit.model';

export type WasteSurcharge = 'NONE' | 'TEN' | 'TWENTY';
export type ServiceLineVisibility = 'VISIBLE' | 'REDISTRIBUTED';
export type RedistributionStrategy = 'EQUAL' | 'WEIGHTED';

// Phase 9.5: which input surface authored the invoice. GUIDED (default) is
// the pre-existing catalog/form-driven flow below. MANUAL is the free-form
// canvas — see the manual-* types further down.
export type InvoiceEntryMode = 'GUIDED' | 'MANUAL';

// A manual invoice's column role — DESCRIPTION/QUANTITY/UNIT_PRICE feed the
// same pricing math a GUIDED line does (as a plain quantity x unit price
// line, no waste surcharge/packaging); CUSTOM is free text, never priced.
export type ManualColumnRole = 'DESCRIPTION' | 'QUANTITY' | 'UNIT_PRICE' | 'CUSTOM';

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

export interface CreateInvoiceRequest {
  customerName: string;
  customerAddress?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerId?: string;
  // Phase 9.5: defaults to GUIDED backend-side when omitted, same as before
  // this field existed.
  entryMode?: InvoiceEntryMode;
  // Required for entryMode GUIDED (the default), forbidden for MANUAL —
  // mirrors the backend's ManualModeFieldsConsistency cross-field rule.
  lines?: CreateInvoiceLineRequest[];
  serviceLines?: CreateInvoiceServiceLineRequest[];
  // Required for entryMode MANUAL, forbidden for GUIDED.
  manualTable?: CreateManualTableRequest;
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

export interface InvoiceWithTotals {
  id: string;
  number: string;
  date: string;
  customerName: string;
  customerAddress: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerId: string | null;
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
}
