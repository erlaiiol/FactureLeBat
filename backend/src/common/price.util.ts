// Shared with sourcing/ (Phase 10) — external text (a scraped page, a
// model's read of a supplier listing) is never trustworthy input, so this
// degrades to null on anything it can't confidently parse rather than
// guessing. MAX_PRICE_CENTS mirrors CreateProductDto's bound so a merely
// implausible value is rejected the same way here as it would be on save.
const MAX_PRICE_CENTS = 100_000_000;

export function parsePriceToCents(raw: string | null | undefined): number | null {
  if (!raw) {
    return null;
  }
  let normalized = raw.replace(/[^\d.,]/g, '').trim();
  if (normalized.includes(',') && !normalized.includes('.')) {
    normalized = normalized.replace(',', '.');
  } else {
    normalized = normalized.replace(/,/g, '');
  }
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  const cents = Math.round(value * 100);
  return cents <= MAX_PRICE_CENTS ? cents : null;
}
