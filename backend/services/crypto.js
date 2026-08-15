/**
 * crypto.js — AES-256-GCM Credential Encryption & Decryption Utility
 *
 * COMPLIANCE & SECURITY:
 *   - Uses AES-256-GCM authenticated encryption.
 *   - Encryption key sourced from BROKER_ENCRYPTION_KEY environment variable.
 *   - Encrypted format: enc:v1:<iv_hex>:<authTag_hex>:<cipher_hex>
 *   - Backward compatible: If string is not encrypted (legacy plaintext), decrypt() returns as-is.
 *   - Never logs decrypted secrets to console or audit logs.
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey() {
  const envKey = process.env.BROKER_ENCRYPTION_KEY || process.env.JWT_SECRET || 'hello_trader_default_secure_key_2026';
  return crypto.scryptSync(envKey, 'hello_trader_salt_v1', 32);
}

/**
 * Encrypt plain text using AES-256-GCM
 */
function encryptCredential(plainText) {
  if (!plainText || typeof plainText !== 'string') return plainText;
  if (plainText.startsWith('enc:v1:')) return plainText; // Already encrypted

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `enc:v1:${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (err) {
    console.error('[Crypto] Encryption error:', err.message);
    throw new Error('Failed to encrypt credential');
  }
}

/**
 * Decrypt cipher text using AES-256-GCM
 * Backward compatible: returns unencrypted text if format is not enc:v1:...
 */
function decryptCredential(cipherText) {
  if (!cipherText || typeof cipherText !== 'string') return cipherText;
  if (!cipherText.startsWith('enc:v1:')) return cipherText; // Unencrypted legacy plaintext

  try {
    const key = getEncryptionKey();
    const parts = cipherText.split(':');
    if (parts.length !== 5) return cipherText;

    const iv = Buffer.from(parts[2], 'hex');
    const authTag = Buffer.from(parts[3], 'hex');
    const encryptedText = parts[4];

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    console.error('[Crypto] Decryption failed — invalid key or tampered data.');
    return null;
  }
}

module.exports = {
  encryptCredential,
  decryptCredential,
};
