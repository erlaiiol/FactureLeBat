import { computeLineTotalPreviewCents, computeTotalsPreview } from './calculation-preview';

describe('computeLineTotalPreviewCents', () => {
  it('applies a waste surcharge for a SQUARE_METER line', () => {
    const cents = computeLineTotalPreviewCents({
      unit: 'SQUARE_METER',
      quantity: 10,
      unitPriceCents: 4500,
      wasteSurcharge: 'TEN',
    });
    expect(cents).toBe(49500);
  });

  it('ignores any waste surcharge for a non-SQUARE_METER unit', () => {
    const cents = computeLineTotalPreviewCents({
      unit: 'UNIT',
      quantity: 5,
      unitPriceCents: 800,
      wasteSurcharge: 'TWENTY',
    });
    expect(cents).toBe(4000);
  });

  it('rounds up to the next whole package when a packaging quantity is set and rounding is on', () => {
    const cents = computeLineTotalPreviewCents({
      unit: 'SQUARE_METER',
      quantity: 23,
      unitPriceCents: 4500,
      wasteSurcharge: 'NONE',
      packagingQuantity: 9,
      roundUpToPackaging: true,
    });
    // 23 m² needed -> 3 boxes of 9 m² = 27 m² billed
    expect(cents).toBe(27 * 4500);
  });

  it('bills the exact quantity when roundUpToPackaging is false, even with a packaging quantity set', () => {
    const cents = computeLineTotalPreviewCents({
      unit: 'SQUARE_METER',
      quantity: 23,
      unitPriceCents: 4500,
      wasteSurcharge: 'NONE',
      packagingQuantity: 9,
      roundUpToPackaging: false,
    });
    expect(cents).toBe(23 * 4500);
  });
});

describe('computeTotalsPreview', () => {
  it('adds a redistributed/visible service amount fully into the subtotal', () => {
    const totals = computeTotalsPreview(
      [{ unit: 'SQUARE_METER', quantity: 10, unitPriceCents: 4500, wasteSurcharge: 'NONE' }],
      false,
      2000,
      10000,
    );
    expect(totals.subtotalExclVatCents).toBe(45000 + 10000);
    expect(totals.vatAmountCents).toBe(0);
  });
});
