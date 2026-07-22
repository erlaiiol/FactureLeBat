import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM: the artisan's SMTP app password is the one secret this app
// stores that isn't a hash (unlike a future login password, it must be
// recoverable to actually authenticate with their mail provider), so it's
// encrypted at rest rather than kept in plaintext. Packed as
// base64(iv):base64(authTag):base64(ciphertext) in one string so a single
// nullable Company column (smtpPasswordEncrypted) can hold it whole.
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;
const KEY_LENGTH_BYTES = 32;

export class InvalidEncryptionKeyError extends Error {}

function decodeKey(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new InvalidEncryptionKeyError(
      `APP_ENCRYPTION_KEY must decode to ${KEY_LENGTH_BYTES} bytes, got ${key.length}`,
    );
  }
  return key;
}

export function encryptSmtpPassword(plaintext: string, base64Key: string): string {
  const key = decodeKey(base64Key);
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((part) => part.toString('base64')).join(':');
}

// Throws (never returns garbage) if the key is wrong or the ciphertext was
// tampered with — GCM's auth tag check fails closed by design.
export function decryptSmtpPassword(packed: string, base64Key: string): string {
  const key = decodeKey(base64Key);
  const [ivB64, authTagB64, ciphertextB64] = packed.split(':');
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new InvalidEncryptionKeyError('Malformed encrypted SMTP password');
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
