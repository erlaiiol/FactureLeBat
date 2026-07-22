import { LineMode, WasteSurcharge } from '../../../generated/prisma/enums';

export interface InvoiceLineWithTotal {
  id: string;
  position: number;
  description: string;
  unit: string;
  mode: LineMode;
  // Serialized as a string (Prisma Decimal -> toString()), not a JS number:
  // JSON has no decimal type, and round-tripping through a float here would
  // reintroduce exactly the precision risk Decimal exists to avoid.
  quantity: string;
  unitPriceCents: number;
  wasteSurcharge: WasteSurcharge;
  lineTotalExclVatCents: number;
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
  vatApplicable: boolean;
  vatRateBasisPoints: number;
  lines: InvoiceLineWithTotal[];
  subtotalExclVatCents: number;
  vatAmountCents: number;
  totalInclVatCents: number;
}
