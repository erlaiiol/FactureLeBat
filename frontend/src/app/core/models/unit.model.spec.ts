import { isAreaUnit, UNIT_LABELS, UNIT_OPTIONS } from './unit.model';

describe('isAreaUnit', () => {
  it('treats SQUARE_METER as the only area-billed unit', () => {
    expect(isAreaUnit('SQUARE_METER')).toBe(true);
  });

  it.each(UNIT_OPTIONS.map((option) => option.value).filter((unit) => unit !== 'SQUARE_METER'))(
    'treats %s as a plain quantity-billed unit',
    (unit) => {
      expect(isAreaUnit(unit)).toBe(false);
    },
  );
});

describe('UNIT_OPTIONS', () => {
  it('has one dropdown option per Unit label, in the same order', () => {
    expect(UNIT_OPTIONS.map((option) => option.value)).toEqual(Object.keys(UNIT_LABELS));
  });
});
