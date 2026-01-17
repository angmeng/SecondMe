/**
 * Crypto Utility
 * T118: AES-256 encryption for WhatsApp session tokens and sensitive data
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Derives an encryption key from a password using scrypt
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LENGTH);
}

/**
 * Encrypts data using AES-256-GCM
 * @param plaintext - The data to encrypt
 * @param password - The encryption password (from environment)
 * @returns Base64 encoded encrypted data with salt, IV, and auth tag
 */
export function encrypt(plaintext: string, password?: string): string {
  const encryptionKey = password || process.env['SESSION_ENCRYPTION_KEY'];

  if (!encryptionKey) {
    throw new Error('SESSION_ENCRYPTION_KEY environment variable not set');
  }

  // Generate random salt and IV
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);

  // Derive key from password
  const key = deriveKey(encryptionKey, salt);

  // Create cipher and encrypt
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Get auth tag for integrity verification
  const authTag = cipher.getAuthTag();

  // Combine salt + iv + authTag + encrypted data
  const combined = Buffer.concat([
    salt,
    iv,
    authTag,
    Buffer.from(encrypted, 'hex'),
  ]);

  return combined.toString('base64');
}

/**
 * Decrypts data encrypted with AES-256-GCM
 * @param ciphertext - Base64 encoded encrypted data
 * @param password - The encryption password (from environment)
 * @returns Decrypted plaintext
 */
export function decrypt(ciphertext: string, password?: string): string {
  const encryptionKey = password || process.env['SESSION_ENCRYPTION_KEY'];

  if (!encryptionKey) {
    throw new Error('SESSION_ENCRYPTION_KEY environment variable not set');
  }

  // Decode from base64
  const combined = Buffer.from(ciphertext, 'base64');

  // Extract components
  const salt = combined.subarray(0, SALT_LENGTH);
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = combined.subarray(
    SALT_LENGTH + IV_LENGTH,
    SALT_LENGTH + IV_LENGTH + TAG_LENGTH
  );
  const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

  // Derive key from password
  const key = deriveKey(encryptionKey, salt);

  // Create decipher and decrypt
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted.toString('hex'), 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Encrypts a session token for Redis storage
 * @param sessionData - The session data object to encrypt
 * @returns Encrypted string suitable for Redis storage
 */
export function encryptSessionToken(sessionData: Record<string, unknown>): string {
  const json = JSON.stringify(sessionData);
  return encrypt(json);
}

/**
 * Decrypts a session token from Redis storage
 * @param encryptedToken - The encrypted session string from Redis
 * @returns Decrypted session data object
 */
export function decryptSessionToken(encryptedToken: string): Record<string, unknown> {
  const json = decrypt(encryptedToken);
  return JSON.parse(json);
}

/**
 * Generates a random encryption key (32 bytes = 256 bits)
 * @returns Base64 encoded random key suitable for SESSION_ENCRYPTION_KEY
 */
export function generateEncryptionKey(): string {
  return randomBytes(KEY_LENGTH).toString('base64');
}

/**
 * Validates that the encryption key is properly configured
 * @returns true if encryption is properly configured
 */
export function isEncryptionConfigured(): boolean {
  return !!process.env['SESSION_ENCRYPTION_KEY'];
}

/**
 * Hash a value for non-reversible storage (e.g., contact IDs in logs)
 */
export function hashForLogging(value: string): string {
  const hash = randomBytes(16);
  return `hash:${hash.toString('hex').substring(0, 8)}`;
}
