import { createHash } from 'node:crypto';

// Deterministic cache key for a search's normalized parameters — same intent
// on two separately-typed requests (e.g. "Parquet chêne" vs "parquet   chêne")
// must hit the same cache row, so every value is lowercased/trimmed before
// hashing rather than hashed as typed.
export function hashQuery(parts: Record<string, string | number | null | undefined>): string {
  const normalized = Object.keys(parts)
    .sort()
    .map(
      (key) =>
        `${key}=${String(parts[key] ?? '')
          .trim()
          .toLowerCase()}`,
    )
    .join('|');
  return createHash('sha256').update(normalized).digest('hex');
}
