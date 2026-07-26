// Pure date-range math for the report tab's period picker — kept out of the
// component so the boundary logic (quarter/month start/end, inclusive
// end-of-day) is easy to reason about and test on its own.

export type PeriodMode = 'quarter' | 'month';

function startOfQuarter(date: Date): Date {
  const quarterStartMonth = Math.floor(date.getMonth() / 3) * 3;
  return new Date(date.getFullYear(), quarterStartMonth, 1, 0, 0, 0, 0);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

// Day 0 of "next month" is the last day of the target month — a standard JS
// Date trick, avoids hand-computing month lengths/leap years.
function endOfMonthContaining(date: Date, monthsToAdd: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + monthsToAdd, 0, 23, 59, 59, 999);
}

export function periodRange(mode: PeriodMode, referenceDate: Date): { from: Date; to: Date } {
  if (mode === 'month') {
    return { from: startOfMonth(referenceDate), to: endOfMonthContaining(referenceDate, 1) };
  }
  const from = startOfQuarter(referenceDate);
  return { from, to: endOfMonthContaining(from, 3) };
}

export function shiftPeriod(mode: PeriodMode, referenceDate: Date, direction: 1 | -1): Date {
  const monthStep = mode === 'month' ? 1 : 3;
  return new Date(referenceDate.getFullYear(), referenceDate.getMonth() + monthStep * direction, 1);
}

const QUARTER_LABELS = ['T1', 'T2', 'T3', 'T4'];
const MONTH_LABELS = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

export function periodLabel(mode: PeriodMode, referenceDate: Date): string {
  if (mode === 'month') {
    return `${MONTH_LABELS[referenceDate.getMonth()]} ${referenceDate.getFullYear()}`;
  }
  return `${QUARTER_LABELS[Math.floor(referenceDate.getMonth() / 3)]} ${referenceDate.getFullYear()}`;
}

export function dateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function startOfDayFromInput(value: string): Date {
  return new Date(`${value}T00:00:00.000`);
}

export function endOfDayFromInput(value: string): Date {
  return new Date(`${value}T23:59:59.999`);
}
