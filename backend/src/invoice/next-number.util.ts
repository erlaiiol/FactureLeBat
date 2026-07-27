// Phase 27: an artisan can freely override a document's number (e.g. to
// continue the sequence from a previous software or the rest of their
// career) — so "the next number" can no longer be a separately-tracked
// counter, which would silently fall out of sync the moment an override
// jumps ahead of it. Instead it's always derived fresh from the highest
// number the company has ever actually used, so every future suggestion
// picks up right after it, override or not.
//
// Only the *last* run of digits in each number is considered (e.g.
// "F-000458" -> 458, "2024-00458" -> 458) — a pragmatic reading of
// whatever format a past number happens to have, not a strict parse. It's
// only ever used to pre-fill a suggestion the artisan can freely edit
// (see InvoiceService.getNextNumber), never to validate or reject one.
function extractTrailingNumber(number: string): number {
  const matches = [...number.matchAll(/\d+/g)];
  if (matches.length === 0) {
    return 0;
  }
  return parseInt(matches[matches.length - 1][0], 10);
}

const NUMBER_PADDING_WIDTH = 6;

export function computeNextDocumentNumber(prefix: string, existingNumbers: string[]): string {
  const highest = existingNumbers.reduce(
    (max, number) => Math.max(max, extractTrailingNumber(number)),
    0,
  );
  return `${prefix}-${String(highest + 1).padStart(NUMBER_PADDING_WIDTH, '0')}`;
}
