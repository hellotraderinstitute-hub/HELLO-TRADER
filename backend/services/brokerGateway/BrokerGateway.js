/**
 * BrokerGateway — Hello Trader Central Order Execution Engine
 *
 * Architecture:
 *   TradingView Webhook
 *         ↓
 *   WebhookProcessor
 *         ↓
 *   BrokerGateway.execute(order, brokerConnection)
 *         ↓
 *   RiskEngine.validate(order, connection, userLimits)
 *         ↓
 *   AdapterFactory.create(broker, credentials)
 *         ↓
 *   [DhanAdapter | AngelOneAdapter | UpstoxAdapter | ShoonyaAdapter | FyersAdapter | GoPocketAdapter]
 *         ↓
 *   Exchange
 *
 * The BrokerGateway is broker-agnostic. All broker-specific logic is in adapters.
 */

const DhanAdapter = require('./adapters/DhanAdapter');
const AngelOneAdapter = require('./adapters/AngelOneAdapter');
const UpstoxAdapter = require('./adapters/UpstoxAdapter');
const ShoonyaAdapter = require('./adapters/ShoonyaAdapter');
const FyersAdapter = require('./adapters/FyersAdapter');
const GoPocketAdapter = require('./adapters/GoPocketAdapter');

const { ProxyTransportFactory } = require('../../../packages/agent/lib/network/ProxyTransportFactory');

// ─── Adapter Factory ────────────────────────────────────────────────────────

function createAdapter(broker, credentials, options = {}) {
  switch (broker.toUpperCase()) {
    case 'DHAN':       return new DhanAdapter(credentials, options);
    case 'ANGELONE':   return new AngelOneAdapter(credentials, options);
    case 'UPSTOX':     return new UpstoxAdapter(credentials, options);
    case 'SHOONYA':    return new ShoonyaAdapter(credentials, options);
    case 'FYERS':      return new FyersAdapter(credentials, options);
    case 'GOPOCKET':   return new GoPocketAdapter(credentials, options);
    default:
      throw new Error(`Unsupported broker: ${broker}. Supported: DHAN, ANGELONE, UPSTOX, SHOONYA, FYERS, GOPOCKET`);
  }
}

// ─── Proxy Transport Resolver ────────────────────────────────────────────────

async function resolveProxyOptions(connection, explicitOptions = {}) {
  if (explicitOptions.httpsAgent) return explicitOptions;
  if (!connection || !connection.userId) return explicitOptions;

  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const assignment = await prisma.clientStaticIpAssignment.findFirst({
      where: { userId: connection.userId, broker: connection.broker, status: 'VERIFIED' }
    });
    if (assignment) {
      const u = assignment.encryptedProxyUsername ? decryptCredential(assignment.encryptedProxyUsername).trim() : null;
      const p = assignment.encryptedProxyPassword ? decryptCredential(assignment.encryptedProxyPassword).trim() : null;
      const proxyConfig = {
        connectionType: assignment.connectionType || 'HTTPS_PROXY',
        proxyHost: assignment.proxyHost,
        proxyPort: assignment.proxyPort,
        proxyUsername: u,
        proxyPassword: p,
      };
      const { httpsAgent } = ProxyTransportFactory.createAgents(proxyConfig);
      return {
        ...explicitOptions,
        httpsAgent,
        publicIp: assignment.ipAddress || '151.245.182.52',
        assignmentId: assignment.id,
      };
    }
  } catch (err) {
    console.warn('[BrokerGateway] Could not resolve proxy for connection:', err.message);
  }
  return explicitOptions;
}

// ─── Credential Decryptor (AES-256-GCM & Legacy Fallback) ─────────────────────

const { encryptCredential, decryptCredential } = require('../crypto');

function decryptCredentials(connection) {
  const decrypt = (val) => {
    if (!val) return val;
    return decryptCredential(val);
  };

  return {
    clientId: connection.clientId,
    apiKey: decrypt(connection.apiKey),
    apiSecret: decrypt(connection.apiSecret),
    accessToken: decrypt(connection.accessToken),
    password: decrypt(connection.password || connection.apiSecret),
    pin: decrypt(connection.password || connection.apiSecret),
    totpSecret: decrypt(connection.totpSecret),
    vendorCode: decrypt(connection.vendorCode),
    refreshToken: decrypt(connection.refreshToken),
    redirectUri: connection.redirectUri,
    imei: connection.imei,
  };
}

function encryptValue(plainText) {
  if (!plainText) return plainText;
  return encryptCredential(plainText);
}

// ─── Retry with Exponential Backoff ─────────────────────────────────────────

async function retryWithBackoff(fn, maxRetries = 3, baseDelayMs = 500) {
  let lastResult = null;
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      if (result.success) return result;
      lastResult = result;
      lastError = new Error(result.message);

      // Fail fast on non-retryable deterministic errors
      const nonRetryable = ['MISSING_SYMBOL_TOKEN', 'INVALID_SYMBOL_TOKEN', 'VALIDATION_FAILED', 'BROKER_CONNECTION_INACTIVE', 'AUTHENTICATION_FAILED', 'Invalid symboltoken'];
      if (nonRetryable.some(errCode => (result.message || '').includes(errCode))) {
        break;
      }
    } catch (err) {
      lastError = err;
    }
    if (attempt < maxRetries) {
      const delay = baseDelayMs * Math.pow(2, attempt - 1); // 500ms, 1000ms, 2000ms
      await new Promise(r => setTimeout(r, delay));
    }
  }
  return {
    success: false,
    orderId: null,
    message: lastResult?.message || `All ${maxRetries} retries failed: ${lastError?.message}`,
    rawResponse: lastResult?.rawResponse || {}
  };
}

// ─── BrokerGateway Class ─────────────────────────────────────────────────────

class BrokerGateway {
  /**
   * Test broker connection with given connection record from DB.
   * @param {Object} connection - AlgoBrokerConnection record from Prisma
   * @param {Object} [options]
   * @returns {Promise<{success, message, profile}>}
   */
  static async testConnection(connection, options = {}) {
    try {
      const resolvedOpts = await resolveProxyOptions(connection, options);
      const credentials = decryptCredentials(connection);
      const adapter = createAdapter(connection.broker, credentials, resolvedOpts);
      return await adapter.testConnection();
    } catch (err) {
      return { success: false, message: err.message, profile: null };
    }
  }

  /**
   * Execute an order through the appropriate broker adapter.
   * Includes automatic retry with exponential backoff.
   * @param {Object} order - Normalized order object
   * @param {Object} connection - AlgoBrokerConnection record from Prisma
   * @param {Object} [options]
   * @returns {Promise<{success, orderId, message, rawResponse, attempts}>}
   */
  static async executeOrder(order, connection, options = {}) {
    try {
      const resolvedOpts = await resolveProxyOptions(connection, options);
      const credentials = decryptCredentials(connection);
      const adapter = createAdapter(connection.broker, credentials, resolvedOpts);

      let attempts = 0;
      const result = await retryWithBackoff(async () => {
        attempts++;
        return await adapter.placeOrder(order);
      }, 3, 500);

      return { ...result, attempts };
    } catch (err) {
      return { success: false, orderId: null, message: err.message, rawResponse: {}, attempts: 1 };
    }
  }

  /**
   * Cancel an order.
   * @param {string} orderId
   * @param {Object} connection
   */
  static async cancelOrder(orderId, connection) {
    try {
      const credentials = decryptCredentials(connection);
      const adapter = createAdapter(connection.broker, credentials);
      return await adapter.cancelOrder(orderId);
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  /**
   * Get positions for a connection.
   */
  static async getPositions(connection) {
    try {
      const credentials = decryptCredentials(connection);
      const adapter = createAdapter(connection.broker, credentials);
      return await adapter.getPositions();
    } catch (err) {
      return [];
    }
  }

  /**
   * Get funds for a connection.
   */
  static async getFunds(connection) {
    try {
      const credentials = decryptCredentials(connection);
      const adapter = createAdapter(connection.broker, credentials);
      return await adapter.getFunds();
    } catch (err) {
      return { available: 0, used: 0, total: 0 };
    }
  }

  /**
   * Get LTP.
   */
  static async getLTP(symbol, exchange, connection) {
    try {
      const credentials = decryptCredentials(connection);
      const adapter = createAdapter(connection.broker, credentials);
      return await adapter.getLTP(symbol, exchange);
    } catch (err) {
      return { ltp: 0, symbol };
    }
  }

  /**
   * Encrypt a credential value for storage.
   */
  static encrypt(value) {
    return encryptValue(value);
  }

  /**
   * List supported brokers.
   */
  static getSupportedBrokers() {
    return [
      { id: 'DHAN',     name: 'Dhan HQ',       authType: 'TOKEN',  fields: ['clientId', 'accessToken'] },
      { id: 'ANGELONE', name: 'Angel One',      authType: 'TOTP',   fields: ['apiKey', 'clientId', 'password', 'totpSecret'] },
      { id: 'UPSTOX',   name: 'Upstox',         authType: 'OAUTH2', fields: ['apiKey', 'apiSecret', 'accessToken'] },
      { id: 'SHOONYA',  name: 'Shoonya/Finvasia', authType: 'TOTP', fields: ['clientId', 'password', 'totpSecret', 'vendorCode', 'apiSecret'] },
      { id: 'FYERS',    name: 'Fyers',           authType: 'OAUTH2', fields: ['apiKey', 'clientId', 'accessToken'] },
      { id: 'GOPOCKET', name: 'Go Pocket',       authType: 'TOKEN',  fields: ['clientId', 'apiKey', 'apiSecret', 'accessToken'] },
    ];
  }

  /**
   * Get live positions from a broker connection with proxy resolution.
   *
   * @param {Object} connection - AlgoBrokerConnection record from Prisma
   * @returns {Promise<Array>} Normalized position list
   */
  static async getPositions(connection) {
    try {
      const credentials = decryptCredentials(connection);
      const proxyOpts = await resolveProxyOptions(connection);
      const adapter = createAdapter(connection.broker, credentials, proxyOpts);
      return await adapter.getPositions();
    } catch (err) {
      console.error(`[BrokerGateway] getPositions() error for ${connection.broker}:`, err.message);
      return [];
    }
  }

  /**
   * Get an instantiated, proxy-configured adapter for a broker connection.
   *
   * @param {Object} connection - AlgoBrokerConnection record from Prisma
   * @returns {Promise<Object>} Broker adapter instance
   */
  static async getAdapter(connection) {
    const credentials = decryptCredentials(connection);
    const proxyOpts = await resolveProxyOptions(connection);
    return createAdapter(connection.broker, credentials, proxyOpts);
  }

  /**
   * Get today's full order book from a broker connection.
   * Used exclusively by MasterOrderPoller (Copy Trading source-of-truth).
   * Returns [] if broker doesn't support order polling yet.
   *
   * @param {Object} connection - AlgoBrokerConnection record from Prisma
   * @returns {Promise<Array>} Normalized order list
   */
  static async getOrders(connection) {
    try {
      const credentials = decryptCredentials(connection);
      const proxyOpts = await resolveProxyOptions(connection);
      const adapter = createAdapter(connection.broker, credentials, proxyOpts);
      return await adapter.getOrders();
    } catch (err) {
      console.error(`[BrokerGateway] getOrders() error for ${connection.broker}:`, err.message);
      return [];
    }
  }
}

module.exports = { BrokerGateway, encryptValue, decryptCredentials, createAdapter };

