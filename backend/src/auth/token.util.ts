import { createHash, randomBytes } from 'crypto';

// The raw value that ends up in an httpOnly cookie or an emailed link —
// never persisted as-is.
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('hex');
}

// What actually gets stored in RefreshToken/AuthToken — a DB leak alone can
// never be replayed, since a hash can't be reversed back into a usable
// token.
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
