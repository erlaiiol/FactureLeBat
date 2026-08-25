import { daysUntil } from './e-invoicing-deadlines.util';

describe('daysUntil', () => {
  it('counts whole calendar days ahead', () => {
    expect(daysUntil('2026-09-01', new Date('2026-08-24T15:42:00'))).toBe(8);
  });

  it('returns 0 on the deadline day itself', () => {
    expect(daysUntil('2026-09-01', new Date('2026-09-01T09:00:00'))).toBe(0);
  });

  it('returns a negative number once the deadline has passed', () => {
    expect(daysUntil('2026-09-01', new Date('2026-09-05T00:00:00'))).toBe(-4);
  });

  it('ignores the time of day, only the calendar date', () => {
    expect(daysUntil('2026-09-01', new Date('2026-08-31T23:59:00'))).toBe(1);
  });
});
