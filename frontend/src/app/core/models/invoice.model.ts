import { Unit } from './unit.model';

export type WasteSurcharge = 'NONE' | 'TEN' | 'TWENTY';
export type ServiceLineVisibility = 'VISIBLE' | 'REDISTRIBUTED';
export type RedistributionStrategy = 'EQUAL' | 'WEIGHTED';

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
  lines: CreateInvoiceLineRequest[];
  serviceLines?: CreateInvoiceServiceLineRequest[];
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
  lines: InvoiceLineWithTotal[];
  serviceLines: InvoiceServiceLineWithAmounts[];
  subtotalExclVatCents: number;
  vatAmountCents: number;
  totalInclVatCents: number;
}
