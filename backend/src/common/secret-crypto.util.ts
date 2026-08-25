import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM — the generic encrypt-at-rest primitive for any secret this
// app must store recoverably (not just hashed) because it needs the
// plaintext back later to authenticate with a third party: the artisan's
// own SMTP app password (Phase 12), and now a connected PA's OAuth
// access/refresh tokens (Phase 1.2-4). Packed as
// base64(iv):base64(authTag):base64(ciphertext) in one string so a single
// nullable column can hold it whole.
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

export function encryptSecret(plaintext: string, base64Key: string): string {
  const key = decodeKey(base64Key);
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((part) => part.toString('base64')).join(':');
}

// Throws (never returns garbage) if the key is wrong or the ciphertext was
// tampered with — GCM's auth tag check fails closed by design.
export function decryptSecret(packed: string, base64Key: string): string {
  const key = decodeKey(base64Key);
  const [ivB64, authTagB64, ciphertextB64] = packed.split(':');
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new InvalidEncryptionKeyError('Malformed encrypted secret');
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
