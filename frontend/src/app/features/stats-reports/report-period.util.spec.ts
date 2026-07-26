import { periodLabel, periodRange, shiftPeriod } from './report-period.util';

describe('periodRange', () => {
  it('computes the full calendar quarter containing the reference date', () => {
    const { from, to } = periodRange('quarter', new Date(2026, 4, 15)); // May 2026 -> Q2
    expect(from).toEqual(new Date(2026, 3, 1, 0, 0, 0, 0)); // April 1st
    expect(to).toEqual(new Date(2026, 5, 30, 23, 59, 59, 999)); // June 30th, end of day
  });

  it('computes the full calendar month containing the reference date', () => {
    const { from, to } = periodRange('month', new Date(2026, 1, 10)); // February 2026
    expect(from).toEqual(new Date(2026, 1, 1, 0, 0, 0, 0));
    expect(to).toEqual(new Date(2026, 1, 28, 23, 59, 59, 999)); // 2026 is not a leap year
  });
});

describe('shiftPeriod', () => {
  it('moves back one quarter across a year boundary', () => {
    const shifted = shiftPeriod('quarter', new Date(2026, 0, 15), -1); // Q1 2026
    expect(shifted.getFullYear()).toBe(2025);
    expect(shifted.getMonth()).toBe(9); // October -> Q4 2025
  });

  it('moves forward one month across a year boundary', () => {
    const shifted = shiftPeriod('month', new Date(2026, 11, 15), 1); // December 2026
    expect(shifted.getFullYear()).toBe(2027);
    expect(shifted.getMonth()).toBe(0);
  });
});

describe('periodLabel', () => {
  it('labels a quarter as "T<n> <year>"', () => {
    expect(periodLabel('quarter', new Date(2026, 4, 1))).toBe('T2 2026');
  });

  it('labels a month with its French name', () => {
    expect(periodLabel('month', new Date(2026, 0, 1))).toBe('Janvier 2026');
  });
});
