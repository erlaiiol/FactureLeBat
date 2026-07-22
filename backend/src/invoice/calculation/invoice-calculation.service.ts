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

export interface WeightedSplitInput {
  amountCents: number;
  // One non-negative integer weight per target, in order. An equal split
  // is just every weight set to 1 — there is no separate "equal" code path.
  weights: readonly number[];
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

  // Splits amountCents across weights.length targets in exact proportion to
  // each weight, integer cents only, with the result always summing to
  // exactly amountCents — no cents lost or invented (Phase 5 requirement
  // for redistributed service lines). Floor-dividing each share first, then
  // handing out the leftover cents one at a time to the targets with the
  // largest fractional remainder (the "largest remainder"/Hamilton
  // apportionment method), ties broken by ascending index, is what makes
  // this deterministic: the same weights always produce the same split.
  computeWeightedSplit({ amountCents, weights }: WeightedSplitInput): number[] {
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    if (totalWeight <= 0) {
      // Callers (InvoiceMapper) only ever reach this with weights that sum
      // to a positive total — enforced upstream by ServiceLineWeightsMatchLines
      // at the DTO boundary. A zero total here would mean that invariant was
      // violated, not a normal runtime condition to recover from.
      throw new Error('computeWeightedSplit requires weights summing to more than zero');
    }

    const shares = weights.map((weight) => Math.floor((amountCents * weight) / totalWeight));
    const distributedCents = shares.reduce((sum, share) => sum + share, 0);
    const remainingCents = amountCents - distributedCents;

    const orderedByRemainder = weights
      .map((weight, index) => ({ index, remainder: (amountCents * weight) % totalWeight }))
      .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

    const result = [...shares];
    for (let i = 0; i < remainingCents; i++) {
      result[orderedByRemainder[i].index] += 1;
    }
    return result;
  }
}
