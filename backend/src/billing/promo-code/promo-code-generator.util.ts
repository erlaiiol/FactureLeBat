import { randomInt } from 'crypto';

// Excludes visually-confusable characters (0/O, 1/I) since a redeemed code
// is often read off a screen and typed back in by hand.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LENGTH = 10;

export function generatePromoCode(): string {
  let code = '';
  for (let i = 0; i < LENGTH; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}
