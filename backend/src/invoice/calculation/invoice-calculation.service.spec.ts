import { InvoiceCalculationService, LineCalculationInput } from './invoice-calculation.service';

function areaLine(overrides: Partial<LineCalculationInput> = {}): LineCalculationInput {
  return {
    unit: 'SQUARE_METER',
    quantity: 10,
    unitPriceCents: 4500,
    wasteSurcharge: 'NONE',
    ...overrides,
  };
}

function unitLine(overrides: Partial<LineCalculationInput> = {}): LineCalculationInput {
  return {
    unit: 'UNIT',
    quantity: 3,
    unitPriceCents: 1200,
    wasteSurcharge: 'NONE',
    ...overrides,
  };
}

describe('InvoiceCalculationService', () => {
  let service: InvoiceCalculationService;

  beforeEach(() => {
    service = new InvoiceCalculationService();
  });

  describe('computeLineTotal', () => {
    it('computes an area line total as quantity times unit price when there is no waste surcharge', () => {
      const result = service.computeLineTotal(areaLine({ quantity: 10, unitPriceCents: 4500 }));
      expect(result.lineTotalExclVatCents).toBe(45000);
    });

    it('applies a 10% waste surcharge to the billed quantity for a SQUARE_METER line', () => {
      const result = service.computeLineTotal(
        areaLine({ quantity: 10, unitPriceCents: 4500, wasteSurcharge: 'TEN' }),
      );
      expect(result.billedQuantity.toNumber()).toBe(11);
      expect(result.lineTotalExclVatCents).toBe(49500);
    });

    it('applies a 20% waste surcharge to the billed quantity for a SQUARE_METER line', () => {
      const result = service.computeLineTotal(
        areaLine({ quantity: 10, unitPriceCents: 4500, wasteSurcharge: 'TWENTY' }),
      );
      expect(result.billedQuantity.toNumber()).toBe(12);
      expect(result.lineTotalExclVatCents).toBe(54000);
    });

    it('computes a non-square-meter line total as quantity times unit price, ignoring any waste surcharge', () => {
      const result = service.computeLineTotal(
        unitLine({ quantity: 3, unitPriceCents: 1200, wasteSurcharge: 'TWENTY' }),
      );
      expect(result.billedQuantity.toNumber()).toBe(3);
      expect(result.lineTotalExclVatCents).toBe(3600);
    });

    it('rounds a line total to the nearest cent', () => {
      const result = service.computeLineTotal(areaLine({ quantity: '3.333', unitPriceCents: 100 }));
      // 3.333 * 100 = 333.3 cents -> rounds to 333
      expect(result.lineTotalExclVatCents).toBe(333);
    });

    it('bills the exact needed quantity when the packaging quantity divides it evenly', () => {
      const result = service.computeLineTotal(
        areaLine({ quantity: 18, packagingQuantity: 9, roundUpToPackaging: true }),
      );
      expect(result.neededQuantity.toNumber()).toBe(18);
      expect(result.billedQuantity.toNumber()).toBe(18);
    });

    it('rounds the billed quantity up to the next whole package when the need is not an exact multiple', () => {
      const result = service.computeLineTotal(
        areaLine({
          quantity: 23,
          unitPriceCents: 4500,
          packagingQuantity: 9,
          roundUpToPackaging: true,
        }),
      );
      // 23 m² needed -> 3 boxes of 9 m² = 27 m² billed
      expect(result.billedQuantity.toNumber()).toBe(27);
      expect(result.lineTotalExclVatCents).toBe(27 * 4500);
    });

    it('applies waste surcharge before packaging rounding', () => {
      const result = service.computeLineTotal(
        areaLine({
          quantity: 20,
          wasteSurcharge: 'TEN',
          packagingQuantity: 9,
          roundUpToPackaging: true,
        }),
      );
      // 20 m² + 10% waste = 22 m² needed -> rounds up to 27 m² (3 boxes)
      expect(result.neededQuantity.toNumber()).toBe(22);
      expect(result.billedQuantity.toNumber()).toBe(27);
    });

    it('bills the exact (unrounded) quantity when roundUpToPackaging is false, even with a packaging quantity set', () => {
      const result = service.computeLineTotal(
        areaLine({ quantity: 23, packagingQuantity: 9, roundUpToPackaging: false }),
      );
      expect(result.billedQuantity.toNumber()).toBe(23);
    });

    it('ignores packaging rounding entirely when no packaging quantity is set, regardless of the flag', () => {
      const result = service.computeLineTotal(areaLine({ quantity: 23, roundUpToPackaging: true }));
      expect(result.billedQuantity.toNumber()).toBe(23);
    });
  });

  describe('computeInvoiceTotals', () => {
    it('sums multiple line totals into an exact subtotal without floating point drift', () => {
      const lines = [
        areaLine({ quantity: 10, unitPriceCents: 4599 }),
        unitLine({ quantity: 7, unitPriceCents: 199 }),
      ];
      const totals = service.computeInvoiceTotals(lines, false, 2000);
      expect(totals.subtotalExclVatCents).toBe(10 * 4599 + 7 * 199);
    });

    it('applies VAT at the invoice stored rate when the invoice is VAT-applicable', () => {
      const lines = [areaLine({ quantity: 10, unitPriceCents: 10000 })];
      const totals = service.computeInvoiceTotals(lines, true, 2000);
      expect(totals.subtotalExclVatCents).toBe(100000);
      expect(totals.vatAmountCents).toBe(20000);
    });

    it('charges zero VAT when the invoice is not VAT-applicable', () => {
      const lines = [areaLine({ quantity: 10, unitPriceCents: 10000 })];
      const totals = service.computeInvoiceTotals(lines, false, 2000);
      expect(totals.vatAmountCents).toBe(0);
    });

    it('computes the total including VAT as the subtotal plus the VAT amount', () => {
      const lines = [areaLine({ quantity: 10, unitPriceCents: 10000 })];
      const totals = service.computeInvoiceTotals(lines, true, 2000);
      expect(totals.totalInclVatCents).toBe(totals.subtotalExclVatCents + totals.vatAmountCents);
    });
  });

  describe('computeVatAmountCents', () => {
    it('matches computeInvoiceTotals when given the same pre-computed subtotal', () => {
      const lines = [areaLine({ quantity: 10, unitPriceCents: 4599 })];
      const totals = service.computeInvoiceTotals(lines, true, 2000);
      expect(service.computeVatAmountCents(totals.subtotalExclVatCents, true, 2000)).toBe(
        totals.vatAmountCents,
      );
    });

    it('returns zero when VAT is not applicable regardless of subtotal', () => {
      expect(service.computeVatAmountCents(100000, false, 2000)).toBe(0);
    });
  });

  describe('computeWeightedSplit', () => {
    it('splits an amount evenly across equal weights, assigning the remainder to the first entries', () => {
      const result = service.computeWeightedSplit({ amountCents: 100, weights: [1, 1, 1] });
      expect(result).toEqual([34, 33, 33]);
      expect(result.reduce((sum, cents) => sum + cents, 0)).toBe(100);
    });

    it('splits an amount proportionally to unequal weights', () => {
      const result = service.computeWeightedSplit({ amountCents: 10000, weights: [1, 3] });
      expect(result).toEqual([2500, 7500]);
    });

    it('never loses or invents a cent, however unevenly the remainder falls', () => {
      const result = service.computeWeightedSplit({ amountCents: 1001, weights: [7, 11, 13] });
      expect(result.reduce((sum, cents) => sum + cents, 0)).toBe(1001);
    });

    it('gives the entire amount to the only weighted line when the rest are excluded (weight 0)', () => {
      const result = service.computeWeightedSplit({ amountCents: 5000, weights: [0, 1, 0] });
      expect(result).toEqual([0, 5000, 0]);
    });

    it('is deterministic: the same weights always produce the same split', () => {
      const input = { amountCents: 12347, weights: [2, 5, 3, 1] };
      expect(service.computeWeightedSplit(input)).toEqual(service.computeWeightedSplit(input));
    });

    it('throws if weights sum to zero, since that means an upstream invariant was violated', () => {
      expect(() => service.computeWeightedSplit({ amountCents: 100, weights: [0, 0] })).toThrow();
    });
  });
});
