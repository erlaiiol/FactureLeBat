import { ServiceVisibility, Unit, WasteSurcharge } from '../../../generated/prisma/enums';

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
  wasteSurcharge: WasteSurcharge;
  // Phase 8.5: the quantity actually priced, after waste surcharge and any
  // packaging rounding — see InvoiceCalculationService.computeLineTotal.
  // Equal to `quantity` (as a string) whenever no packaging rounding
  // applies; never persisted, always recomputed here.
  billedQuantity: string;
  packagingQuantity: string | null;
  roundUpToPackaging: boolean;
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
  name: string;
  description: string | null;
  amountCents: number;
  visibility: ServiceVisibility;
  // Only present for REDISTRIBUTED lines.
  distribution?: ServiceLineDistributionEntry[];
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
  serviceLines: InvoiceServiceLineWithAmounts[];
  subtotalExclVatCents: number;
  vatAmountCents: number;
  totalInclVatCents: number;
}
