// Phase 1.2-6 (2026 e-invoicing reform): the two dates that actually bind
// this app's users — TPE/PME/auto-entrepreneurs are not subject to the
// earlier large-entreprise/ETI waves, so those aren't modeled here.
export const E_INVOICING_RECEPTION_DEADLINE = '2026-09-01';
export const E_INVOICING_EMISSION_DEADLINE = '2027-09-01';

// Calendar-day difference, ignoring time-of-day on both ends — a deadline is
// a date, not a timestamp, so "8 days left" shouldn't flicker based on the
// hour the artisan happens to load the page.
export function daysUntil(isoDate: string, from: Date = new Date()): number {
  const target = new Date(`${isoDate}T00:00:00`);
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const diffMs = target.getTime() - start.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}
