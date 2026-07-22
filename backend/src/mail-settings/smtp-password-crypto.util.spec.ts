import { randomBytes } from 'node:crypto';
import {
  decryptSmtpPassword,
  encryptSmtpPassword,
  InvalidEncryptionKeyError,
} from './smtp-password-crypto.util';

const KEY = randomBytes(32).toString('base64');
const OTHER_KEY = randomBytes(32).toString('base64');

describe('smtp-password-crypto.util', () => {
  it('decrypts back to the original plaintext', () => {
    const ciphertext = encryptSmtpPassword('super-secret-app-password', KEY);
    expect(decryptSmtpPassword(ciphertext, KEY)).toBe('super-secret-app-password');
  });

  it('produces a different ciphertext on every call (random iv)', () => {
    const first = encryptSmtpPassword('same-password', KEY);
    const second = encryptSmtpPassword('same-password', KEY);
    expect(first).not.toBe(second);
  });

  it('fails closed when decrypted with the wrong key', () => {
    const ciphertext = encryptSmtpPassword('super-secret-app-password', KEY);
    expect(() => decryptSmtpPassword(ciphertext, OTHER_KEY)).toThrow();
  });

  it('fails closed when the ciphertext has been tampered with', () => {
    const ciphertext = encryptSmtpPassword('super-secret-app-password', KEY);
    const tampered = ciphertext.slice(0, -4) + 'XXXX';
    expect(() => decryptSmtpPassword(tampered, KEY)).toThrow();
  });

  it('rejects a key that does not decode to 32 bytes', () => {
    const shortKey = Buffer.from('too-short').toString('base64');
    expect(() => encryptSmtpPassword('x', shortKey)).toThrow(InvalidEncryptionKeyError);
  });
});
