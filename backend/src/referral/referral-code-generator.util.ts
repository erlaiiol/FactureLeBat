import { randomInt } from 'crypto';

// Same alphabet convention as PromoCode's generator (promo-code-generator.util.ts):
// excludes visually-confusable characters (0/O, 1/I) since a referral code is
// shared and typed by hand, often off a phone screen.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LENGTH = 8;

export function generateReferralCode(): string {
  let code = '';
  for (let i = 0; i < LENGTH; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}
