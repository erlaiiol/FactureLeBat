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
