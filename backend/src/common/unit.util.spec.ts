import { Unit } from '../../generated/prisma/enums';
import { isAreaUnit, UNIT_LABELS } from './unit.util';

describe('isAreaUnit', () => {
  it('treats SQUARE_METER as the only area-billed unit', () => {
    expect(isAreaUnit(Unit.SQUARE_METER)).toBe(true);
  });

  it.each(Object.values(Unit).filter((unit) => unit !== Unit.SQUARE_METER))(
    'treats %s as a plain quantity-billed unit',
    (unit) => {
      expect(isAreaUnit(unit)).toBe(false);
    },
  );
});

describe('UNIT_LABELS', () => {
  it('has a French display label for every Unit enum value', () => {
    for (const unit of Object.values(Unit)) {
      expect(UNIT_LABELS[unit]).toBeTruthy();
    }
  });
});
