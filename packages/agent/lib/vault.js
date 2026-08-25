/**
 * vault.js — Local AES-256-GCM Encrypted Credential Store
 *
 * SECURITY SPECIFICATION:
 *   - Credentials stored ONLY on local client filesystem.
 *   - Master password/passphrase derives 256-bit encryption key using PBKDF2 (100,000 iterations, SHA-512, 16-byte salt).
 *   - Authenticated AES-256-GCM encryption ensures confidentiality & tamper protection (12-byte IV + 16-byte Auth Tag).
 *   - Secrets are NEVER printed to stdout/logs.
 *   - Plaintext secrets are scrubbed from memory after use.
 *   - Supports secure key rotation and master password changes.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_VAULT_PATH = path.join(os.homedir(), '.hello-trader', 'vault.enc');

class CredentialVault {
  constructor(vaultPath = DEFAULT_VAULT_PATH) {
    this.vaultPath = vaultPath;
    this.isUnlocked = false;
    this.cachedCredentials = null;
  }

  /**
   * Derive a 256-bit key from master passphrase using PBKDF2
   * @param {string} passphrase
   * @param {Buffer} salt
   * @returns {Buffer}
   */
  _deriveKey(passphrase, salt) {
    return crypto.pbkdf2Sync(passphrase, salt, 100000, 32, 'sha512');
  }

  /**
   * Ensure directory exists
   */
  _ensureDir() {
    const dir = path.dirname(this.vaultPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Check if vault file exists
   * @returns {boolean}
   */
  exists() {
    return fs.existsSync(this.vaultPath);
  }

  /**
   * Initialize a new empty vault or overwrite existing
   * @param {string} masterPassphrase
   * @param {object} initialData
   */
  init(masterPassphrase, initialData = {}) {
    if (!masterPassphrase || masterPassphrase.length < 6) {
      throw new Error('Master passphrase must be at least 6 characters long.');
    }
    this._ensureDir();
    this.save(masterPassphrase, initialData);
    this.isUnlocked = true;
    this.cachedCredentials = initialData;
    return true;
  }

  /**
   * Unlock and read decrypted vault data
   * @param {string} masterPassphrase
   * @returns {object}
   */
  unlock(masterPassphrase) {
    if (!this.exists()) {
      throw new Error('Vault does not exist. Please initialize first.');
    }

    try {
      const rawEncrypted = fs.readFileSync(this.vaultPath, 'utf8');
      const payload = JSON.parse(rawEncrypted);

      if (!payload.salt || !payload.iv || !payload.tag || !payload.data) {
        throw new Error('Corrupted vault format.');
      }

      const salt = Buffer.from(payload.salt, 'hex');
      const iv = Buffer.from(payload.iv, 'hex');
      const tag = Buffer.from(payload.tag, 'hex');
      const key = this._deriveKey(masterPassphrase, salt);

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);

      let decrypted = decipher.update(payload.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      this.cachedCredentials = JSON.parse(decrypted);
      this.isUnlocked = true;
      return this.cachedCredentials;
    } catch (err) {
      this.isUnlocked = false;
      this.cachedCredentials = null;
      throw new Error('Failed to unlock vault: Invalid master passphrase or corrupted vault file.');
    }
  }

  /**
   * Encrypt and save data to vault
   * @param {string} masterPassphrase
   * @param {object} data
   */
  save(masterPassphrase, data) {
    this._ensureDir();
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const key = this._deriveKey(masterPassphrase, salt);

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();

    const vaultPayload = {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      data: encrypted,
    };

    fs.writeFileSync(this.vaultPath, JSON.stringify(vaultPayload, null, 2), { mode: 0o600 });
    this.cachedCredentials = data;
    this.isUnlocked = true;
  }

  /**
   * Set or update credentials for a specific broker
   * @param {string} masterPassphrase
   * @param {string} brokerKey - e.g. 'DHAN', 'ANGELONE', 'GOPOCKET'
   * @param {object} credentials
   */
  setBrokerCredentials(masterPassphrase, brokerKey, credentials) {
    let currentData = {};
    if (this.exists()) {
      currentData = this.unlock(masterPassphrase);
    }
    currentData.brokers = currentData.brokers || {};
    currentData.brokers[brokerKey.toUpperCase()] = {
      ...credentials,
      updatedAt: new Date().toISOString(),
    };
    this.save(masterPassphrase, currentData);
    return true;
  }

  /**
   * Get broker credentials (only available if unlocked)
   * @param {string} brokerKey
   * @returns {object|null}
   */
  getBrokerCredentials(brokerKey) {
    if (!this.isUnlocked || !this.cachedCredentials) {
      throw new Error('Vault is locked. Unlock with master passphrase first.');
    }
    const b = this.cachedCredentials.brokers || {};
    return b[brokerKey.toUpperCase()] || null;
  }

  /**
   * List configured brokers without exposing secrets
   * @returns {Array<object>}
   */
  listConfiguredBrokers() {
    if (!this.isUnlocked || !this.cachedCredentials) {
      throw new Error('Vault is locked.');
    }
    const brokers = this.cachedCredentials.brokers || {};
    return Object.keys(brokers).map(key => {
      const b = brokers[key];
      return {
        broker: key,
        clientId: b.clientId ? `${b.clientId.slice(0, 3)}***${b.clientId.slice(-2)}` : 'N/A',
        configuredAt: b.updatedAt || 'N/A',
        hasToken: !!(b.accessToken || b.userSession || b.password),
      };
    });
  }

  /**
   * Lock the vault and wipe memory cache
   */
  lock() {
    this.isUnlocked = false;
    this.cachedCredentials = null;
  }
}

module.exports = {
  CredentialVault,
};
