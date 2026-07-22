import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { LineMode, WasteSurcharge } from '../../../generated/prisma/enums';

export interface LineCalculationInput {
  mode: LineMode;
  quantity: Prisma.Decimal | number | string;
  unitPriceCents: number;
  wasteSurcharge: WasteSurcharge;
}

export interface LineCalculationResult {
  billedQuantity: Prisma.Decimal;
  lineTotalExclVatCents: number;
}

export interface InvoiceTotals {
  subtotalExclVatCents: number;
  vatAmountCents: number;
  totalInclVatCents: number;
}

const WASTE_SURCHARGE_BASIS_POINTS: Record<WasteSurcharge, number> = {
  NONE: 0,
  TEN: 1000,
  TWENTY: 2000,
};

// Pure, dependency-free by design: this is the single place financial
// calculations happen, isolated from persistence and PDF rendering so it
// can be unit tested in full confidence.
@Injectable()
export class InvoiceCalculationService {
  computeLineTotal(line: LineCalculationInput): LineCalculationResult {
    const quantity = new Prisma.Decimal(line.quantity);
    const wasteBasisPoints =
      line.mode === 'AREA' ? WASTE_SURCHARGE_BASIS_POINTS[line.wasteSurcharge] : 0;

    const billedQuantity = quantity.mul(10000 + wasteBasisPoints).div(10000);
    const lineTotalExclVatCents = billedQuantity
      .mul(line.unitPriceCents)
      .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
      .toNumber();

    return { billedQuantity, lineTotalExclVatCents };
  }

  // Split out so callers that already computed each line's total once (see
  // InvoiceMapper) can get the VAT/total math without re-running
  // computeLineTotal for every line a second time.
  computeVatAmountCents(
    subtotalExclVatCents: number,
    vatApplicable: boolean,
    vatRateBasisPoints: number,
  ): number {
    return vatApplicable ? Math.round((subtotalExclVatCents * vatRateBasisPoints) / 10000) : 0;
  }

  computeInvoiceTotals(
    lines: readonly LineCalculationInput[],
    vatApplicable: boolean,
    vatRateBasisPoints: number,
  ): InvoiceTotals {
    const subtotalExclVatCents = lines.reduce(
      (sum, line) => sum + this.computeLineTotal(line).lineTotalExclVatCents,
      0,
    );
    const vatAmountCents = this.computeVatAmountCents(
      subtotalExclVatCents,
      vatApplicable,
      vatRateBasisPoints,
    );

    return {
      subtotalExclVatCents,
      vatAmountCents,
      totalInclVatCents: subtotalExclVatCents + vatAmountCents,
    };
  }
}
