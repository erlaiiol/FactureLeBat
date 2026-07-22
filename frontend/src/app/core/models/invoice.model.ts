export type LineMode = 'AREA' | 'UNIT';
export type WasteSurcharge = 'NONE' | 'TEN' | 'TWENTY';

export interface CreateInvoiceLineRequest {
  description: string;
  unit: string;
  mode: LineMode;
  quantity: number;
  unitPriceCents: number;
  wasteSurcharge?: WasteSurcharge;
}

export interface CreateInvoiceRequest {
  customerName: string;
  customerAddress?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerId?: string;
  lines: CreateInvoiceLineRequest[];
}

export interface InvoiceLineWithTotal {
  id: string;
  position: number;
  description: string;
  unit: string;
  mode: LineMode;
  quantity: string;
  unitPriceCents: number;
  wasteSurcharge: WasteSurcharge;
  lineTotalExclVatCents: number;
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
  subtotalExclVatCents: number;
  vatAmountCents: number;
  totalInclVatCents: number;
}
