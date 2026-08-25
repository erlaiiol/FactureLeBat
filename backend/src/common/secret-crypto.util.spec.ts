import { randomBytes } from 'node:crypto';
import { decryptSecret, encryptSecret, InvalidEncryptionKeyError } from './secret-crypto.util';

const KEY = randomBytes(32).toString('base64');
const OTHER_KEY = randomBytes(32).toString('base64');

describe('secret-crypto.util', () => {
  it('decrypts back to the original plaintext', () => {
    const ciphertext = encryptSecret('super-secret-app-password', KEY);
    expect(decryptSecret(ciphertext, KEY)).toBe('super-secret-app-password');
  });

  it('produces a different ciphertext on every call (random iv)', () => {
    const first = encryptSecret('same-password', KEY);
    const second = encryptSecret('same-password', KEY);
    expect(first).not.toBe(second);
  });

  it('fails closed when decrypted with the wrong key', () => {
    const ciphertext = encryptSecret('super-secret-app-password', KEY);
    expect(() => decryptSecret(ciphertext, OTHER_KEY)).toThrow();
  });

  it('fails closed when the ciphertext has been tampered with', () => {
    const ciphertext = encryptSecret('super-secret-app-password', KEY);
    const tampered = ciphertext.slice(0, -4) + 'XXXX';
    expect(() => decryptSecret(tampered, KEY)).toThrow();
  });

  it('rejects a key that does not decode to 32 bytes', () => {
    const shortKey = Buffer.from('too-short').toString('base64');
    expect(() => encryptSecret('x', shortKey)).toThrow(InvalidEncryptionKeyError);
  });
});
