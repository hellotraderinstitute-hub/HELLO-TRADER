/**
 * algo.js — Algo Trading Backend Routes
 *
 * COMPLIANCE:
 *   - Explicit consent required before any broker is activated
 *   - Passwords are never stored
 *   - All credentials encrypted with AES-256
 *   - Audit log written for every action
 *   - Risk controls enforced
 *   - Kill switch supported
 *
 * Routes:
 *   GET    /api/algo/brokers            - List supported brokers + their required fields
 *   POST   /api/algo/connect            - Connect a broker (with consent)
 *   GET    /api/algo/connections        - List user's connections
 *   DELETE /api/algo/connections/:id    - Remove connection
 *   POST   /api/algo/connections/:id/test  - Test connection live
 *   PUT    /api/algo/connections/:id/risk  - Update risk controls
 *   POST   /api/algo/connections/:id/kill  - Toggle kill switch
 *   GET    /api/algo/positions          - Live positions
 *   GET    /api/algo/logs               - Webhook execution logs
 *   GET    /api/algo/audit              - Audit logs for user
 *   POST   /api/algo/kill-all           - Emergency stop all connections
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { randomUUID: uuidv4 } = require('crypto');
const { BrokerGateway } = require('../services/brokerGateway/BrokerGateway');
const { AuditLogger, CATEGORIES } = require('../services/auditLogger');
const { N } = require('../services/notifier');
const { encryptCredential, decryptCredential } = require('../services/crypto');

const encrypt = encryptCredential;
const decrypt = decryptCredential;

const prisma = new PrismaClient();

// ─── CONSENT TEXT (versioned) ────────────────────────────────
const CONSENT_TEXT_V1 = [
  'I authorize Hello Trader to send orders to my connected broker account based on my selected automation settings.',
  'I understand that trading involves significant market risk. Past performance does not guarantee future results.',
  'I acknowledge that Hello Trader does not guarantee any returns or profits.',
  'I remain fully responsible for my own trading decisions and all outcomes.',
  'I confirm that I will not hold Hello Trader liable for any losses arising from automated trading.',
  'I understand I can disconnect my broker and disable all automation at any time using the Kill Switch.',
  'I confirm that the API credentials I am providing belong to my own broker account.',
].join(' | ');

/**
 * Resolve target user ID for agent & preflight operations:
 * - For normal users: returns req.user.id
 * - For ADMIN: allows inspecting specific student (via query/body userId) or defaults to req.user.id
 */
async function resolveTargetUserId(req) {
  if (req.user?.role === 'ADMIN') {
    const explicitId = req.query?.userId || req.body?.userId;
    if (explicitId) return explicitId;
  }
  return req.user?.id;
}

// ─── GET /brokers ─────────────────────────────────────────────
router.get('/brokers', (req, res) => {
  res.json({ success: true, brokers: BrokerGateway.getSupportedBrokers() });
});

// ─── POST /connect ────────────────────────────────────────────
router.post('/connect', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const {
      broker, displayName,
      apiKey, apiSecret, clientId, accessToken,
      totpSecret, vendorCode, redirectUri, imei,
      // Risk controls
      maxOpenTrades, maxDailyLoss, maxPositionSize,
      allowedProducts, tradingHoursStart, tradingHoursEnd,
      // Compliance
      consentAccepted,
    } = req.body || {};

    // Compliance: Consent is mandatory
    if (!consentAccepted) {
      return res.status(400).json({
        success: false,
        error: 'CONSENT_REQUIRED',
        message: 'You must explicitly accept the authorization terms before connecting a broker.'
      });
    }

    if (!broker) {
      return res.status(400).json({ success: false, message: 'Broker is required.' });
    }

    // Passwords are NEVER stored for standard token brokers.
    // For TOTP-based SmartAPI brokers (Angel One MPIN / Shoonya PIN), PIN is encrypted with AES-256-GCM.
    const isTotpPinBroker = ['ANGELONE', 'SHOONYA'].includes((broker || '').toUpperCase());
    const rawPin = req.body?.pin || req.body?.password;
    if (req.body?.password && !isTotpPinBroker) {
      return res.status(400).json({
        success: false,
        error: 'PASSWORD_STORAGE_DENIED',
        message: 'Broker login passwords cannot be stored on this platform. Please use API Key/Token credentials from your broker\'s developer portal.'
      });
    }

    const ip = req.headers['cf-connecting-ip'] ||
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress;

    const webhookToken = uuidv4().replace(/-/g, '');

    // Connection Charge Validation & Token Deduction
    const { getActiveCharges, getAlgoConnectionChargeForLots } = require('../services/chargesService');
    const charges = await getActiveCharges();
    const lotCapacity = maxOpenTrades ? parseInt(maxOpenTrades) : 5;
    const requiredConnectionTokens = getAlgoConnectionChargeForLots(lotCapacity, charges.algoConnectionCharges.tiers);

    // Calculate user's current token balance
    const userLedgers = await prisma.ledger.findMany({
      where: { userId, walletType: { in: ['TOKEN', 'RECHARGE', 'BONUS'] } }
    });
    const tokenBalance = userLedgers.reduce((acc, curr) => curr.type === 'CREDIT' ? acc + curr.amount : acc - curr.amount, 0);

    if (tokenBalance < requiredConnectionTokens) {
      return res.status(400).json({
        success: false,
        error: 'INSUFFICIENT_ALGO_CONNECTION_TOKENS',
        message: `Insufficient token balance for Algo connection. Required: ${requiredConnectionTokens} tokens for ${lotCapacity} lots capacity, Available: ${tokenBalance} tokens.`
      });
    }

    // Deduct connection charge tokens
    await prisma.ledger.create({
      data: {
        userId,
        walletType: 'TOKEN',
        amount: requiredConnectionTokens,
        type: 'DEBIT',
        reason: `ALGO_CONNECTION_CHARGE_${broker.toUpperCase()}_${lotCapacity}_LOTS`
      }
    });

    const encryptedPin = isTotpPinBroker && rawPin ? encrypt(rawPin) : null;

    const connection = await prisma.algoBrokerConnection.create({
      data: {
        userId,
        broker: broker.toUpperCase(),
        displayName: displayName || `${broker} Account`,
        webhookToken,

        // Encrypted credentials
        apiKey:       encrypt(apiKey),
        apiSecret:    isTotpPinBroker ? (encryptedPin || encrypt(apiSecret)) : encrypt(apiSecret),
        password:     encryptedPin,
        clientId:     clientId || null,
        accessToken:  encrypt(accessToken),
        totpSecret:   encrypt(totpSecret),
        vendorCode:   vendorCode || null,
        redirectUri:  redirectUri || null,
        imei:         imei || null,

        // Consent
        consentAccepted: true,
        consentAt:       new Date(),
        consentIp:       ip,
        consentVersion:  'v1.0',
        consentText:     CONSENT_TEXT_V1,

        // Risk controls
        maxOpenTrades:     maxOpenTrades ? parseInt(maxOpenTrades) : null,
        maxDailyLoss:      maxDailyLoss ? parseFloat(maxDailyLoss) : null,
        maxPositionSize:   maxPositionSize ? parseFloat(maxPositionSize) : null,
        allowedProducts:   allowedProducts || null,
        tradingHoursStart: tradingHoursStart || null,
        tradingHoursEnd:   tradingHoursEnd || null,
      }
    });

    // Audit log
    await AuditLogger.log({
      userId, category: CATEGORIES.CONSENT, action: 'CONSENT_RECORDED',
      detail: `User accepted broker connection terms for ${broker}`,
      meta: { broker, consentVersion: 'v1.0', consentIp: ip },
      ip,
    });
    await AuditLogger.log({
      userId, category: CATEGORIES.BROKER, action: 'CONNECTED',
      detail: `Connected ${broker} broker: ${displayName || broker}`,
      meta: { connectionId: connection.id, broker },
      ip,
    });

    // Build webhook URL
    const baseUrl = process.env.PUBLIC_URL || 'https://hello-trader.onrender.com';
    const webhookUrl = `${baseUrl}/api/webhook/tv/${webhookToken}`;

    // Notify admin — no credentials in message
    const student = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, studentId: true } });
    N.algoConnected({ studentName: student?.name || 'Student', studentId: student?.studentId || userId, broker: broker.toUpperCase(), displayName: displayName || broker });

    res.json({
      success: true,
      message: `${broker} broker connected successfully`,
      connectionId: connection.id,
      webhookUrl,
      webhookToken,
    });
  } catch (err) {
    console.error('[algo/connect]', err);
    res.status(500).json({ success: false, message: 'Failed to connect broker: ' + err.message });
  }
});

// ─── GET /connections ─────────────────────────────────────────
router.get('/connections', async (req, res) => {
  try {
    const connections = await prisma.algoBrokerConnection.findMany({
      where: { userId: req.user.id },
      select: {
        id: true, broker: true, displayName: true, clientId: true,
        isActive: true, killSwitchActive: true, webhookToken: true,
        consentAccepted: true, consentAt: true,
        maxOpenTrades: true, maxDailyLoss: true, maxPositionSize: true,
        allowedProducts: true, tradingHoursStart: true, tradingHoursEnd: true,
        testStatus: true, testMessage: true, lastTestedAt: true,
        connectedAt: true,
      }
    });

    const baseUrl = process.env.PUBLIC_URL || 'https://hello-trader.onrender.com';
    const result = connections.map(c => {
      const isActuallyConfigured = Boolean(c.clientId && (c.apiKey || c.accessToken));
      const isOnline = Boolean(c.isActive && c.testStatus === 'SUCCESS' && isActuallyConfigured);
      return {
        ...c,
        isActive: isOnline,
        testStatus: isActuallyConfigured ? c.testStatus : 'FAILED',
        testMessage: isActuallyConfigured ? c.testMessage : 'Missing broker credentials.',
        clientId: c.clientId ? (c.clientId.length > 4 ? `${c.clientId.slice(0, 4)}******${c.clientId.slice(-2)}` : c.clientId) : null,
        webhookUrl: `${baseUrl}/api/webhook/tv/${c.webhookToken}`,
      };
    });

    res.json({ success: true, connections: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /connections/:id/health ──────────────────────────────
// Read-only broker connection health and authentication check (Sanitized metadata only)
router.get('/connections/:id/health', async (req, res) => {
  const userId = req.user?.id;
  const { id } = req.params;
  try {
    const conn = await prisma.algoBrokerConnection.findFirst({ where: { id, userId } });
    if (!conn) return res.status(404).json({ success: false, message: 'Connection not found' });

    const clientIdPresent = Boolean(conn.clientId && conn.clientId.trim().length > 0);
    const apiKeyPresent = Boolean(conn.apiKey);
    const mpinPresent = Boolean(conn.password || conn.apiSecret);
    const totpPresent = Boolean(conn.totpSecret);

    let authenticated = false;
    let sessionValid = false;
    let brokerConnected = false;
    let ordersPermitted = false;
    let message = 'Unconfigured';

    if (clientIdPresent && apiKeyPresent && mpinPresent && totpPresent) {
      const testRes = await BrokerGateway.testConnection(conn);
      authenticated = testRes.success === true;
      sessionValid = testRes.success === true;
      brokerConnected = testRes.success === true;
      ordersPermitted = testRes.success === true && conn.isActive && !conn.killSwitchActive;
      message = testRes.message;
    } else {
      message = 'Missing credentials. Please configure Client ID, API Key, MPIN, and TOTP Secret.';
    }

    res.json({
      success: true,
      connectionId: conn.id,
      broker: conn.broker,
      clientIdPresent,
      apiKeyPresent,
      mpinPresent,
      totpPresent,
      authenticated,
      sessionValid,
      brokerConnected,
      ordersPermitted,
      message
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── DELETE /connections/:id ──────────────────────────────────
router.delete('/connections/:id', async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  try {
    const conn = await prisma.algoBrokerConnection.findFirst({ where: { id, userId } });
    if (!conn) return res.status(404).json({ success: false, message: 'Connection not found' });

    await prisma.algoBrokerConnection.delete({ where: { id } });

    await AuditLogger.log({
      userId, category: CATEGORIES.BROKER, action: 'DISCONNECTED',
      detail: `Disconnected ${conn.broker} broker: ${conn.displayName}`,
      meta: { connectionId: id, broker: conn.broker }, req,
    });

    res.json({ success: true, message: `${conn.broker} disconnected and all credentials removed.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /connections/:id/rotate-webhook ──────────────────────
// Invalidate old TradingView webhook token and issue a fresh cryptographically random token
router.post('/connections/:id/rotate-webhook', async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  try {
    const conn = await prisma.algoBrokerConnection.findFirst({ where: { id, userId } });
    if (!conn) return res.status(404).json({ success: false, message: 'Connection not found' });

    const newWebhookToken = crypto.randomBytes(16).toString('hex');
    const updated = await prisma.algoBrokerConnection.update({
      where: { id },
      data: { webhookToken: newWebhookToken }
    });

    const baseUrl = process.env.PUBLIC_URL || 'https://hello-trader.onrender.com';
    const newWebhookUrl = `${baseUrl}/api/webhook/tv/${newWebhookToken}`;

    await AuditLogger.log({
      userId, category: CATEGORIES.SETTINGS, action: 'WEBHOOK_TOKEN_ROTATED',
      detail: `TradingView Webhook Token rotated for ${conn.broker} connection (${conn.displayName})`,
      meta: { connectionId: id, broker: conn.broker }, req,
    });

    res.json({
      success: true,
      message: 'TradingView webhook token rotated successfully. Update your TradingView alert URL.',
      webhookToken: newWebhookToken,
      webhookUrl: newWebhookUrl,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PUT /connections/:id/credentials ──────────────────────────
// Update broker API credentials (e.g. Access Token) after validation
router.put('/connections/:id/credentials', async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const {
    clientId,
    accessToken,
    apiKey,
    apiSecret,
    password,
    totpSecret,
    vendorCode,
    redirectUri,
    imei,
    displayName
  } = req.body || {};

  try {
    // 1. Find existing connection
    const conn = await prisma.algoBrokerConnection.findFirst({ where: { id, userId } });
    if (!conn) {
      return res.status(404).json({ success: false, message: 'Connection not found.' });
    }

    // 2. Build mock connection object to test credentials before saving
    // Fallback to database encrypted values for fields that are left blank (i.e. undefined)
    const isTotpPinBroker = ['ANGELONE', 'SHOONYA'].includes((conn.broker || '').toUpperCase());
    const rawPin = req.body?.pin || req.body?.password;
    const updatedEncryptedPin = rawPin ? encryptCredential(rawPin) : conn.password;

    const mockConn = {
      ...conn,
      clientId: clientId !== undefined ? clientId : conn.clientId,
      displayName: displayName !== undefined ? displayName : conn.displayName,
      apiKey: apiKey ? encryptCredential(apiKey) : conn.apiKey,
      apiSecret: apiSecret ? encryptCredential(apiSecret) : (isTotpPinBroker && updatedEncryptedPin ? updatedEncryptedPin : conn.apiSecret),
      password: updatedEncryptedPin,
      accessToken: accessToken ? encryptCredential(accessToken) : conn.accessToken,
      totpSecret: totpSecret ? encryptCredential(totpSecret) : conn.totpSecret,
      vendorCode: vendorCode !== undefined ? vendorCode : conn.vendorCode,
      redirectUri: redirectUri !== undefined ? redirectUri : conn.redirectUri,
      imei: imei !== undefined ? imei : conn.imei,
    };

    // 3. Test the connection with the new credentials using the broker's safe profile/test API
    const testResult = await BrokerGateway.testConnection(mockConn);

    if (!testResult.success) {
      return res.status(400).json({
        success: false,
        error: 'CREDENTIAL_VALIDATION_FAILED',
        message: testResult.message || 'Verification failed. Please check your credentials.'
      });
    }

    // 4. Update the database record with the validated credentials
    // We update credentials AND connection status fields to Connected/ONLINE/SUCCESS
    const updatedConn = await prisma.algoBrokerConnection.update({
      where: { id },
      data: {
        clientId: mockConn.clientId,
        displayName: mockConn.displayName,
        apiKey: mockConn.apiKey,
        apiSecret: mockConn.apiSecret,
        password: mockConn.password,
        accessToken: mockConn.accessToken,
        totpSecret: mockConn.totpSecret,
        vendorCode: mockConn.vendorCode,
        redirectUri: mockConn.redirectUri,
        imei: mockConn.imei,
        // Status updates
        lastTestedAt: new Date(),
        testStatus: 'SUCCESS',
        testMessage: 'API credentials updated and verified successfully.',
        isActive: true,
        killSwitchActive: false, // Reset kill switch on credentials reset
      }
    });

    const ip = req.headers['cf-connecting-ip'] ||
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress;

    // 5. Log audit trail
    await AuditLogger.log({
      userId,
      category: CATEGORIES.BROKER,
      action: 'CREDENTIALS_UPDATED',
      detail: `Updated credentials for ${conn.broker} connection: ${conn.displayName}`,
      meta: { connectionId: id, broker: conn.broker },
      req,
      ip
    });

    res.json({
      success: true,
      message: 'Credentials updated and verified successfully.',
      connection: {
        id: updatedConn.id,
        broker: updatedConn.broker,
        displayName: updatedConn.displayName,
        isActive: updatedConn.isActive,
        lastTestedAt: updatedConn.lastTestedAt,
        testStatus: updatedConn.testStatus,
        testMessage: updatedConn.testMessage,
      }
    });

  } catch (err) {
    console.error('[algo/update-credentials]', err);
    res.status(500).json({ success: false, message: 'Failed to update credentials: ' + err.message });
  }
});

// ─── POST /connections/:id/test ───────────────────────────────
router.post('/connections/:id/test', async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  try {
    const conn = await prisma.algoBrokerConnection.findFirst({ where: { id, userId } });
    if (!conn) return res.status(404).json({ success: false, message: 'Connection not found' });

    const result = await BrokerGateway.testConnection(conn);

    // Update test status
    await prisma.algoBrokerConnection.update({
      where: { id },
      data: {
        lastTestedAt: new Date(),
        testStatus: result.success ? 'SUCCESS' : 'FAILED',
        testMessage: result.message,
        isActive: result.success,
      }
    });

    await AuditLogger.log({
      userId, category: CATEGORIES.BROKER,
      action: result.success ? 'TEST_PASSED' : 'TEST_FAILED',
      detail: `Connection test for ${conn.broker}: ${result.message}`,
      meta: { connectionId: id, profile: result.profile }, req,
    });

    res.json({ success: result.success, message: result.message, profile: result.profile });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /connections/:id/triggers ───────────────────────────
// Get saved UP SIDE (BUY) & DOWN SIDE (SELL) trigger configurations
router.get('/connections/:id/triggers', async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  try {
    const conn = await prisma.algoBrokerConnection.findFirst({ where: { id, userId } });
    if (!conn) return res.status(404).json({ success: false, message: 'Connection not found' });

    const configs = await prisma.algoTriggerConfig.findMany({
      where: { connectionId: id }
    });

    const upside   = configs.find(c => c.direction === 'UPSIDE') || null;
    const downside = configs.find(c => c.direction === 'DOWNSIDE') || null;

    res.json({ success: true, connectionId: id, upside, downside, configs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /connections/:id/triggers ──────────────────────────
// Upsert UP SIDE or DOWN SIDE trigger configuration
router.post('/connections/:id/triggers', async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  try {
    const conn = await prisma.algoBrokerConnection.findFirst({ where: { id, userId } });
    if (!conn) return res.status(404).json({ success: false, message: 'Connection not found' });

    const {
      direction, // "UPSIDE" | "DOWNSIDE"
      enabled = true,
      exchange = 'NFO',
      symbol = 'NIFTY',
      productType = 'MIS',
      scriptType = 'OPTION',
      lots = 1,
      expiryType = 'WEEKLY',
      expiryGap = 0,
      strikeOffset = 0,
      strikeStep = 50,
      optionType = direction === 'UPSIDE' ? 'CE' : 'PE',
      orderSide = 'BUY',
      exitOnOpposite = true,
    } = req.body || {};

    if (!direction || (direction !== 'UPSIDE' && direction !== 'DOWNSIDE')) {
      return res.status(400).json({ success: false, message: 'direction must be "UPSIDE" or "DOWNSIDE"' });
    }

    const config = await prisma.algoTriggerConfig.upsert({
      where: { connectionId_direction: { connectionId: id, direction } },
      create: {
        connectionId: id, direction, enabled: !!enabled,
        exchange, symbol: symbol.toUpperCase(), productType, scriptType,
        lots: Number(lots) || 1, expiryType, expiryGap: Number(expiryGap) || 0,
        strikeOffset: Number(strikeOffset) || 0, strikeStep: Number(strikeStep) || 50,
        optionType, orderSide, exitOnOpposite: !!exitOnOpposite,
      },
      update: {
        enabled: !!enabled, exchange, symbol: symbol.toUpperCase(),
        productType, scriptType, lots: Number(lots) || 1,
        expiryType, expiryGap: Number(expiryGap) || 0,
        strikeOffset: Number(strikeOffset) || 0, strikeStep: Number(strikeStep) || 50,
        optionType, orderSide, exitOnOpposite: !!exitOnOpposite,
      }
    });

    await AuditLogger.log({
      userId, category: CATEGORIES.ALGO, action: 'TRIGGER_CONFIG_UPDATED',
      detail: `Updated ${direction} trigger config for ${symbol} (${optionType} ${strikeOffset>=0?'+'+strikeOffset:strikeOffset})`,
      meta: { connectionId: id, config }, req,
    });

    res.json({ success: true, message: `✅ ${direction} (${direction === 'UPSIDE' ? 'BUY Signal' : 'SELL Signal'}) configuration saved!`, config });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// ─── PUT /connections/:id/risk ────────────────────────────────
router.put('/connections/:id/risk', async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { maxOpenTrades, maxDailyLoss, maxPositionSize, allowedProducts,
          tradingHoursStart, tradingHoursEnd } = req.body;
  try {
    const conn = await prisma.algoBrokerConnection.findFirst({ where: { id, userId } });
    if (!conn) return res.status(404).json({ success: false, message: 'Connection not found' });

    await prisma.algoBrokerConnection.update({
      where: { id },
      data: {
        maxOpenTrades:     maxOpenTrades != null ? parseInt(maxOpenTrades) : conn.maxOpenTrades,
        maxDailyLoss:      maxDailyLoss != null ? parseFloat(maxDailyLoss) : conn.maxDailyLoss,
        maxPositionSize:   maxPositionSize != null ? parseFloat(maxPositionSize) : conn.maxPositionSize,
        allowedProducts:   allowedProducts ?? conn.allowedProducts,
        tradingHoursStart: tradingHoursStart ?? conn.tradingHoursStart,
        tradingHoursEnd:   tradingHoursEnd ?? conn.tradingHoursEnd,
      }
    });

    await AuditLogger.log({
      userId, category: CATEGORIES.ALGO, action: 'RISK_UPDATED',
      detail: `Risk controls updated for ${conn.broker} connection`,
      meta: { connectionId: id, maxOpenTrades, maxDailyLoss, maxPositionSize }, req,
    });

    res.json({ success: true, message: 'Risk controls updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /connections/:id/kill ───────────────────────────────
router.post('/connections/:id/kill', async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { active, reason } = req.body;
  try {
    const conn = await prisma.algoBrokerConnection.findFirst({ where: { id, userId } });
    if (!conn) return res.status(404).json({ success: false, message: 'Connection not found' });

    await prisma.algoBrokerConnection.update({
      where: { id },
      data: {
        killSwitchActive: !!active,
        killSwitchAt: active ? new Date() : null,
        killSwitchReason: active ? (reason || 'User activated kill switch') : null,
        isActive: active ? false : conn.isActive,
      }
    });

    await AuditLogger.log({
      userId, category: CATEGORIES.KILL,
      action: active ? 'KILL_SWITCH_ON' : 'KILL_SWITCH_OFF',
      detail: `Kill switch ${active ? 'ACTIVATED' : 'DEACTIVATED'} for ${conn.broker}: ${reason || ''}`,
      meta: { connectionId: id, broker: conn.broker, reason }, req,
    });

    res.json({
      success: true,
      message: active
        ? `🛑 Kill switch activated for ${conn.broker}. All automation stopped.`
        : `✅ Kill switch deactivated for ${conn.broker}.`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /kill-all ───────────────────────────────────────────
router.post('/kill-all', async (req, res) => {
  const userId = req.user.id;
  const { reason, dryRun } = req.body;
  try {
    // 1. Arm kill switch on all broker connections for the user
    await prisma.algoBrokerConnection.updateMany({
      where: { userId },
      data: {
        killSwitchActive: true,
        killSwitchAt: new Date(),
        killSwitchReason: reason || 'Emergency stop — all automation',
        isActive: false,
      }
    });

    // 2. Fetch all DB positions currently marked OPEN
    const openDbPositions = await prisma.algoPosition.findMany({
      where: { userId, status: 'OPEN' },
      include: { connection: true }
    });

    const positionResults = [];
    const connectionsMap = {};

    for (const pos of openDbPositions) {
      if (pos.connection && !connectionsMap[pos.connectionId]) {
        connectionsMap[pos.connectionId] = {
          conn: pos.connection,
          livePositions: await BrokerGateway.getPositions(pos.connection)
        };
      }
    }

    for (const pos of openDbPositions) {
      const connData = connectionsMap[pos.connectionId];
      const livePositions = connData ? connData.livePositions : [];

      const matchingBrokerPos = livePositions.find(bp =>
        bp.symbol === pos.symbol ||
        (bp.symboltoken && bp.symboltoken === pos.symbolToken) ||
        (bp.symbolToken && bp.symbolToken === pos.symbolToken)
      );

      const brokerNetQty = matchingBrokerPos ? parseInt(matchingBrokerPos.netqty || matchingBrokerPos.quantity || 0) : 0;
      const beforeNetQty = brokerNetQty;

      if (brokerNetQty === 0) {
        // Broker confirms position is already 0: safely update DB to CLOSED without sending extra orders
        await prisma.algoPosition.update({
          where: { id: pos.id },
          data: { status: 'MANUALLY_CLOSED', closedAt: new Date() }
        }).catch(() => {});

        await AuditLogger.log({
          userId,
          category: CATEGORIES.KILL,
          action: 'POSITION_KILL_RECONCILED',
          detail: `Kill All: Reconciled DB position ${pos.symbol} (ID: ${pos.id}) to CLOSED (Broker netqty is already 0)`,
          meta: {
            positionId: pos.id,
            symbol: pos.symbol,
            beforeNetQty: 0,
            finalBrokerNetQty: 0,
            finalDbStatus: 'MANUALLY_CLOSED',
            reason: 'BROKER_ALREADY_ZERO'
          },
          req
        });

        positionResults.push({
          positionId: pos.id,
          symbol: pos.symbol,
          action: 'RECONCILED_CLOSED',
          beforeNetQty: 0,
          finalBrokerNetQty: 0,
          dbStatus: 'MANUALLY_CLOSED',
          success: true
        });
        continue;
      }

      // If dryRun mode requested, do not submit actual broker order
      if (dryRun) {
        positionResults.push({
          positionId: pos.id,
          symbol: pos.symbol,
          action: 'DRY_RUN_SQUARE_OFF_DETECTED',
          beforeNetQty,
          exitTransactionType: brokerNetQty > 0 ? 'SELL' : 'BUY',
          quantity: Math.abs(brokerNetQty),
          dbStatus: 'OPEN',
          success: true,
          dryRun: true
        });
        continue;
      }

      // If broker netqty > 0 (or < 0), submit opposite MARKET square-off order
      const exitSide = brokerNetQty > 0 ? 'SELL' : 'BUY';
      const exitQty = Math.abs(brokerNetQty);
      const exitOrder = {
        symbol: pos.symbol,
        securityId: pos.symbolToken || matchingBrokerPos.symboltoken || '',
        symbolToken: pos.symbolToken || matchingBrokerPos.symboltoken || '',
        exchange: pos.exchange || matchingBrokerPos.exchange || 'NFO',
        side: exitSide,
        quantity: exitQty,
        orderType: 'MARKET',
        productType: pos.productType || matchingBrokerPos.productType || 'INTRADAY'
      };

      const execResult = await BrokerGateway.executeOrder(exitOrder, pos.connection);

      if (execResult.success && execResult.orderId) {
        // Query live positions again to verify broker confirmation
        const postPositions = await BrokerGateway.getPositions(pos.connection);
        const postMatch = postPositions.find(bp =>
          bp.symbol === pos.symbol || (bp.symboltoken && bp.symboltoken === pos.symbolToken)
        );
        const finalNetQty = postMatch ? parseInt(postMatch.netqty || 0) : 0;

        await prisma.algoPosition.update({
          where: { id: pos.id },
          data: {
            status: 'MANUALLY_CLOSED',
            closedAt: new Date(),
            exitOrderId: execResult.orderId
          }
        }).catch(() => {});

        await AuditLogger.log({
          userId,
          category: CATEGORIES.KILL,
          action: 'POSITION_EMERGENCY_SQUARED_OFF',
          detail: `Kill All: Squared off ${pos.symbol} (OrderID: ${execResult.orderId}, Exited: ${exitQty})`,
          meta: {
            positionId: pos.id,
            symbol: pos.symbol,
            beforeNetQty,
            exitTransactionType: exitSide,
            quantity: exitQty,
            brokerOrderId: execResult.orderId,
            brokerResponse: execResult.rawResponse,
            finalBrokerNetQty: finalNetQty,
            finalDbStatus: 'MANUALLY_CLOSED'
          },
          req
        });

        positionResults.push({
          positionId: pos.id,
          symbol: pos.symbol,
          action: 'SQUARED_OFF',
          brokerOrderId: execResult.orderId,
          beforeNetQty,
          finalBrokerNetQty: finalNetQty,
          dbStatus: 'MANUALLY_CLOSED',
          success: true
        });
      } else {
        await AuditLogger.log({
          userId,
          category: CATEGORIES.KILL,
          action: 'POSITION_KILL_FAILED',
          detail: `Kill All: Failed to square off ${pos.symbol}: ${execResult.message}`,
          meta: {
            positionId: pos.id,
            symbol: pos.symbol,
            beforeNetQty,
            error: execResult.message
          },
          req
        });

        positionResults.push({
          positionId: pos.id,
          symbol: pos.symbol,
          action: 'SQUARE_OFF_FAILED',
          beforeNetQty,
          error: execResult.message,
          dbStatus: 'OPEN',
          success: false
        });
      }
    }

    await AuditLogger.log({
      userId,
      category: CATEGORIES.KILL,
      action: 'EMERGENCY_STOP_ALL',
      detail: `EMERGENCY STOP executed — all automation killed. Processed ${openDbPositions.length} positions.`,
      meta: { reason, positionResults, dryRun: !!dryRun },
      req,
    });

    res.json({
      success: true,
      message: '🛑 Emergency stop executed. All automation halted.',
      positionResults
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /re-arm ─────────────────────────────────────────────
router.post('/re-arm', async (req, res) => {
  const userId = req.user.id;
  try {
    const connections = await prisma.algoBrokerConnection.findMany({
      where: { userId }
    });

    if (connections.length === 0) {
      return res.status(400).json({ success: false, message: 'No broker connections found for user.' });
    }

    // Disarm kill switch on connections
    await prisma.algoBrokerConnection.updateMany({
      where: { userId },
      data: {
        killSwitchActive: false,
        killSwitchAt: null,
        killSwitchReason: null,
        isActive: true,
      }
    });

    // Clear preflight cache so next pre-flight evaluates the fresh active state
    try {
      const { MarketPreflightService } = require('../services/compliance/MarketPreflightService');
      if (MarketPreflightService && MarketPreflightService.clearCache) {
        MarketPreflightService.clearCache(userId);
      }
    } catch (_) {}

    await AuditLogger.log({
      userId,
      category: CATEGORIES.KILL,
      action: 'AUTOMATION_REARMED',
      detail: `Live automation safely RE-ARMED. Kill switches disarmed for ${connections.length} connections.`,
      meta: { connectionsCount: connections.length },
      req,
    });

    res.json({
      success: true,
      message: '✅ Live trading and automation safely RE-ARMED. Kill switch disarmed.',
      connectionsUpdated: connections.length
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /positions ───────────────────────────────────────────
router.get('/positions', async (req, res) => {
  const userId = req.user.id;
  try {
    const dbPositions = await prisma.algoPosition.findMany({
      where: { userId, status: 'OPEN' },
      include: { connection: { select: { id: true, broker: true, displayName: true, clientId: true } } },
      orderBy: { openedAt: 'desc' },
    });

    // Hydrate open positions with live broker position book
    const connections = await prisma.algoBrokerConnection.findMany({
      where: { userId, isActive: true, testStatus: 'SUCCESS' }
    });

    const livePositionsByConn = {};
    for (const conn of connections) {
      livePositionsByConn[conn.id] = await BrokerGateway.getPositions(conn);
    }

    const hydratedPositions = [];

    for (const pos of dbPositions) {
      const livePositions = livePositionsByConn[pos.connectionId] || [];
      const match = livePositions.find(lp =>
        lp.symbol === pos.symbol ||
        (lp.symboltoken && lp.symboltoken === pos.symbolToken) ||
        (lp.symbolToken && lp.symbolToken === pos.symbolToken)
      );

      if (match) {
        const netQty = match.netqty !== undefined ? match.netqty : match.quantity;
        if (netQty === 0) {
          // Reconcile stale DB position to CLOSED
          await prisma.algoPosition.update({
            where: { id: pos.id },
            data: { status: 'CLOSED', closedAt: new Date() }
          }).catch(() => {});
          continue;
        }

        const entryPrice = match.buyavgprice || match.avgPrice || pos.entryPrice || 0;
        const ltp = match.ltp || 0;
        const pnl = match.pnl || match.unrealised || (entryPrice > 0 && ltp > 0 ? (ltp - entryPrice) * netQty : 0);

        // Update DB position entry price if it was 0
        if ((!pos.entryPrice || pos.entryPrice === 0) && entryPrice > 0) {
          await prisma.algoPosition.update({
            where: { id: pos.id },
            data: { entryPrice }
          }).catch(() => {});
        }

        hydratedPositions.push({
          ...pos,
          entryPrice: entryPrice,
          ltp: ltp,
          pnl: pnl,
          unrealizedPnl: match.unrealised || pnl,
          realizedPnl: match.realised || 0,
          quantity: netQty,
          netqty: netQty,
          orderSide: pos.side,
          lots: Math.max(1, Math.round(netQty / (pos.symbol.includes('BANKNIFTY') ? 15 : 65)))
        });
      } else {
        // Fallback to DB values
        hydratedPositions.push({
          ...pos,
          orderSide: pos.side,
          lots: Math.max(1, Math.round(pos.quantity / (pos.symbol.includes('BANKNIFTY') ? 15 : 65))),
          ltp: pos.entryPrice || 0,
          pnl: 0,
          unrealizedPnl: 0,
          realizedPnl: 0
        });
      }
    }

    // Calculate aggregated PnL summary
    let totalUnrealized = 0;
    let totalRealized = 0;
    Object.values(livePositionsByConn).forEach(connPositions => {
      (connPositions || []).forEach(cp => {
        totalUnrealized += parseFloat(cp.unrealised || 0);
        totalRealized += parseFloat(cp.realised || 0);
      });
    });

    const summary = {
      unrealizedPnl: totalUnrealized,
      realizedPnl: totalRealized,
      totalPnl: totalUnrealized + totalRealized,
      openPositionsCount: hydratedPositions.length,
    };

    res.json({ success: true, positions: hydratedPositions, summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /positions/:id/close ────────────────────────────────
router.post('/positions/:id/close', async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  try {
    const position = await prisma.algoPosition.findFirst({
      where: { id, userId, status: 'OPEN' },
      include: { connection: true }
    });

    if (!position) {
      return res.status(404).json({ success: false, message: 'Position not found or already closed.' });
    }

    const exitSide = position.side === 'BUY' ? 'SELL' : 'BUY';
    const exitOrder = {
      symbol: position.symbol,
      exchange: position.exchange || 'NFO',
      side: exitSide,
      quantity: position.quantity,
      orderType: 'MARKET',
      productType: position.productType,
    };

    let exitOrderId = null;
    let exitMessage = 'Position closed manually in terminal';

    if (position.connection && position.connection.isActive) {
      const execResult = await BrokerGateway.executeOrder(exitOrder, position.connection).catch(err => ({ success: false, message: err.message }));
      exitOrderId = execResult?.orderId || null;
      exitMessage = execResult?.message || exitMessage;
    }

    const updated = await prisma.algoPosition.update({
      where: { id },
      data: {
        status: 'MANUALLY_CLOSED',
        exitOrderId,
        closedAt: new Date(),
      }
    });

    await AuditLogger.log({
      userId, category: CATEGORIES.POSITION, action: 'POSITION_MANUALLY_CLOSED',
      detail: `Square-off position ${position.symbol} (${position.side} ${position.quantity} qty). ${exitMessage}`,
      meta: { positionId: id, exitOrderId, exitOrder }
    });

    res.json({ success: true, message: `Position ${position.symbol} closed successfully.`, position: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /positions/square-off-all ───────────────────────────
router.post('/positions/square-off-all', async (req, res) => {
  const userId = req.user.id;
  try {
    const openPositions = await prisma.algoPosition.findMany({
      where: { userId, status: 'OPEN' },
      include: { connection: true }
    });

    const closed = [];
    for (const pos of openPositions) {
      const exitSide = pos.side === 'BUY' ? 'SELL' : 'BUY';
      const exitOrder = {
        symbol: pos.symbol,
        exchange: pos.exchange || 'NFO',
        side: exitSide,
        quantity: pos.quantity,
        orderType: 'MARKET',
        productType: pos.productType,
      };

      let exitOrderId = null;
      if (pos.connection && pos.connection.isActive) {
        const execResult = await BrokerGateway.executeOrder(exitOrder, pos.connection).catch(() => null);
        exitOrderId = execResult?.orderId || null;
      }

      await prisma.algoPosition.update({
        where: { id: pos.id },
        data: {
          status: 'MANUALLY_CLOSED',
          exitOrderId,
          closedAt: new Date(),
        }
      });
      closed.push({ id: pos.id, symbol: pos.symbol, quantity: pos.quantity, exitSide });
    }

    await AuditLogger.log({
      userId, category: CATEGORIES.POSITION, action: 'SQUARE_OFF_ALL',
      detail: `Square-off all: Closed ${closed.length} open position(s).`,
      meta: { closedCount: closed.length, positions: closed }
    });

    res.json({ success: true, message: `Successfully squared off ${closed.length} open position(s).`, closed });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /logs ────────────────────────────────────────────────
router.get('/logs', async (req, res) => {
  const { limit = 50, connectionId } = req.query;
  try {
    const where = { userId: req.user.id };
    if (connectionId) where.connectionId = connectionId;
    const logs = await prisma.algoWebhookLog.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      take: parseInt(limit),
      include: { connection: { select: { broker: true, displayName: true } } },
    });
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /audit ───────────────────────────────────────────────
router.get('/audit', async (req, res) => {
  const { limit = 100, category } = req.query;
  try {
    const logs = await AuditLogger.getLogs({
      userId: req.user.id,
      category,
      limit: parseInt(limit),
    });
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════
// CLIENT EXECUTION AGENT ROUTES (PHASE 1)
// ══════════════════════════════════════════════════════════════════════

const { agentTunnelServer } = require('../services/agentTunnelServer');

// ─── POST /agent/keys/generate ─────────────────────────────────
router.post('/agent/keys/generate', async (req, res) => {
  const userId = req.user.id;
  const { label = 'Primary Execution Agent' } = req.body;

  try {
    // 1. Revoke any currently active keys for this user
    const existingKeys = await prisma.agentKey.findMany({
      where: { userId, status: 'ACTIVE' }
    });

    for (const k of existingKeys) {
      await prisma.agentKey.update({
        where: { id: k.id },
        data: { status: 'REVOKED', revokedAt: new Date() }
      });
      const agentTunnel = req.agentTunnelServer || agentTunnelServer;
      await agentTunnel.disconnectKeySessions(k.id);
    }

    // 2. Generate Cryptographically Secure 32-Byte Random Pairing Key
    const rawKey = `ht_agent_live_${crypto.randomBytes(24).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = `${rawKey.slice(0, 18)}...`;

    // 3. Store ONLY the SHA-256 hash in the database
    const createdKey = await prisma.agentKey.create({
      data: {
        userId,
        keyHash,
        keyPrefix,
        label,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        keyPrefix: true,
        label: true,
        status: true,
        createdAt: true,
      }
    });

    await AuditLogger.log({
      userId, category: CATEGORIES.AUTH, action: 'AGENT_KEY_GENERATED',
      detail: `New Client Agent Pairing Key generated (${keyPrefix})`,
      meta: { agentKeyId: createdKey.id, label },
    });

    // Return the plaintext pairing key ONCE to the authenticated user
    res.json({
      success: true,
      pairingKey: rawKey,
      agentKey: createdKey,
      warning: 'Store this pairing key securely on your execution machine. It will not be shown again.'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /agent/keys ───────────────────────────────────────────
router.get('/agent/keys', async (req, res) => {
  const userId = await resolveTargetUserId(req);
  try {
    const keys = await prisma.agentKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        keyPrefix: true,
        label: true,
        status: true,
        agentIp: true,
        lastSeenAt: true,
        connectedAt: true,
        revokedAt: true,
        createdAt: true,
      }
    });
    res.json({ success: true, keys });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /agent/keys/:id/revoke ───────────────────────────────
router.post('/agent/keys/:id/revoke', async (req, res) => {
  const userId = await resolveTargetUserId(req);
  const { id } = req.params;

  try {
    const key = await prisma.agentKey.findFirst({
      where: { id, userId }
    });

    if (!key) {
      return res.status(404).json({ success: false, message: 'Agent key not found.' });
    }

    await prisma.agentKey.update({
      where: { id },
      data: { status: 'REVOKED', revokedAt: new Date() }
    });

    // Immediately drop any active socket connection using this key
    const agentTunnel = req.agentTunnelServer || agentTunnelServer;
    await agentTunnel.disconnectKeySessions(id);

    await AuditLogger.log({
      userId, category: CATEGORIES.AUTH, action: 'AGENT_KEY_REVOKED',
      detail: `Agent Pairing Key revoked (${key.keyPrefix})`,
      meta: { agentKeyId: id },
    });

    res.json({ success: true, message: 'Agent pairing key revoked and session disconnected.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /agent/status ─────────────────────────────────────────
router.get('/agent/status', async (req, res) => {
  const userId = await resolveTargetUserId(req);
  try {
    const agentTunnel = req.agentTunnelServer || agentTunnelServer;
    const status = agentTunnel.getAgentStatus(userId);
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /agent/test-signal ───────────────────────────────────
router.post('/agent/test-signal', async (req, res) => {
  const userId = await resolveTargetUserId(req);
  try {
    const agentTunnel = req.agentTunnelServer || agentTunnelServer;
    const result = await agentTunnel.dispatchTestSignal(userId, req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /agent/risk-settings ──────────────────────────────────
router.get('/agent/risk-settings', async (req, res) => {
  const userId = await resolveTargetUserId(req);
  try {
    const today = new Date().toISOString().slice(0, 10);
    let settings = await prisma.agentRiskSettings.findUnique({
      where: { userId }
    });

    if (!settings) {
      settings = await prisma.agentRiskSettings.create({
        data: {
          userId,
          dailyProfitTargetEnabled: false,
          dailyProfitTarget: 5000,
          dailyMaxLossEnabled: true,
          dailyMaxLoss: 10000,
          isPausedToday: false,
          squareOffOnDailyLimitEnabled: false,
          perTradeTargetEnabled: false,
          perTradeTarget: 500,
        }
      });
    }

    // Auto-reset isPausedToday if it was paused on a previous calendar day
    if (settings.isPausedToday && settings.pausedDateStr && settings.pausedDateStr !== today) {
      settings = await prisma.agentRiskSettings.update({
        where: { userId },
        data: {
          isPausedToday: false,
          pauseReason: null,
          pausedDateStr: null,
        }
      });
    }

    // Calculate today's realized P&L from closed algo positions
    const closedPositions = await prisma.algoPosition.findMany({
      where: {
        userId,
        status: 'CLOSED',
        closedAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0))
        }
      }
    });

    const todayRealizedPnl = closedPositions.reduce((acc, pos) => acc + (pos.realizedPnl || 0), 0);

    res.json({
      success: true,
      settings,
      todayRealizedPnl,
      todayDateStr: today,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /agent/risk-settings ─────────────────────────────────
router.post('/agent/risk-settings', async (req, res) => {
  const userId = await resolveTargetUserId(req);
  const {
    isLiveTradingEnabled,
    maxLots,
    dailyProfitTargetEnabled,
    dailyProfitTarget,
    dailyMaxLossEnabled,
    dailyMaxLoss,
    squareOffOnDailyLimitEnabled,
    perTradeTargetEnabled,
    perTradeTarget,
  } = req.body;

  try {
    const parseNum = (val, fallback) => {
      if (val === undefined || val === null || val === '') return fallback;
      const n = Number(val);
      return isNaN(n) ? fallback : n;
    };

    const updateData = {
      dailyProfitTargetEnabled: !!dailyProfitTargetEnabled,
      dailyProfitTarget: parseNum(dailyProfitTarget, 5000),
      dailyMaxLossEnabled: dailyMaxLossEnabled !== undefined ? !!dailyMaxLossEnabled : true,
      dailyMaxLoss: parseNum(dailyMaxLoss, 10000),
      squareOffOnDailyLimitEnabled: !!squareOffOnDailyLimitEnabled,
      perTradeTargetEnabled: !!perTradeTargetEnabled,
      perTradeTarget: parseNum(perTradeTarget, 500),
    };

    if (isLiveTradingEnabled !== undefined) {
      updateData.isLiveTradingEnabled = !!isLiveTradingEnabled;
    }
    if (maxLots !== undefined) {
      updateData.maxLots = Math.max(1, parseNum(maxLots, 1));
    }

    const updated = await prisma.agentRiskSettings.upsert({
      where: { userId },
      update: updateData,
      create: {
        userId,
        isLiveTradingEnabled: !!isLiveTradingEnabled,
        maxLots: Math.max(1, parseNum(maxLots, 1)),
        ...updateData,
      }
    });

    // Notify connected agent tunnel socket if online
    const agentTunnel = req.agentTunnelServer || agentTunnelServer;
    if (agentTunnel && agentTunnel.io) {
      agentTunnel.io.to(`user:${userId}`).emit('agent:update_risk', updated);
    }

    await AuditLogger.log({
      userId, category: CATEGORIES.SETTINGS, action: 'RISK_SETTINGS_UPDATED',
      detail: `Terminal settings updated: Live Trading (${updated.isLiveTradingEnabled ? 'ON' : 'OFF'}), Max Lots: ${updated.maxLots}, Target ₹${updated.dailyProfitTarget}, Max Loss ₹${updated.dailyMaxLoss}`,
      meta: updated,
    });

    res.json({ success: true, settings: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /agent/toggle-live ───────────────────────────────────
router.post('/agent/toggle-live', async (req, res) => {
  const userId = await resolveTargetUserId(req);
  const { enabled } = req.body;

  try {
    const current = await prisma.agentRiskSettings.findUnique({ where: { userId } });
    const targetState = enabled !== undefined ? !!enabled : !(current?.isLiveTradingEnabled);

    const updated = await prisma.agentRiskSettings.upsert({
      where: { userId },
      update: { isLiveTradingEnabled: targetState },
      create: { userId, isLiveTradingEnabled: targetState, maxLots: 1 }
    });

    await AuditLogger.log({
      userId, category: CATEGORIES.SETTINGS, action: targetState ? 'LIVE_TRADING_ENABLED' : 'LIVE_TRADING_DISABLED',
      detail: `User ${userId} switched terminal Live Trading to: ${targetState ? 'ON' : 'OFF'}`,
      meta: { isLiveTradingEnabled: targetState },
    });

    res.json({ success: true, isLiveTradingEnabled: targetState, settings: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /agent/pause-today ───────────────────────────────────
router.post('/agent/pause-today', async (req, res) => {
  const userId = await resolveTargetUserId(req);
  const today = new Date().toISOString().slice(0, 10);
  try {
    const updated = await prisma.agentRiskSettings.upsert({
      where: { userId },
      update: {
        isPausedToday: true,
        pauseReason: 'USER_PAUSED_TODAY',
        pausedDateStr: today,
      },
      create: {
        userId,
        isPausedToday: true,
        pauseReason: 'USER_PAUSED_TODAY',
        pausedDateStr: today,
      }
    });

    const agentTunnel = req.agentTunnelServer || agentTunnelServer;
    if (agentTunnel && agentTunnel.io) {
      agentTunnel.io.to(`user:${userId}`).emit('agent:pause_today', { reason: 'USER_PAUSED_TODAY', date: today });
    }

    await AuditLogger.log({
      userId, category: CATEGORIES.SETTINGS, action: 'TRADING_PAUSED_TODAY',
      detail: 'Trading paused for today by user',
    });

    res.json({ success: true, isPausedToday: true, message: 'Trading is now PAUSED for today. New orders will be blocked.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /agent/resume-today ──────────────────────────────────
router.post('/agent/resume-today', async (req, res) => {
  const userId = await resolveTargetUserId(req);
  try {
    const updated = await prisma.agentRiskSettings.upsert({
      where: { userId },
      update: {
        isPausedToday: false,
        pauseReason: null,
        pausedDateStr: null,
      },
      create: {
        userId,
        isPausedToday: false,
        pauseReason: null,
        pausedDateStr: null,
      }
    });

    const agentTunnel = req.agentTunnelServer || agentTunnelServer;
    if (agentTunnel && agentTunnel.io) {
      agentTunnel.io.to(`user:${userId}`).emit('agent:resume_today');
    }

    await AuditLogger.log({
      userId, category: CATEGORIES.SETTINGS, action: 'TRADING_RESUMED_TODAY',
      detail: 'Trading resumed for today by user',
    });

    res.json({ success: true, isPausedToday: false, message: 'Trading has been RESUMED for today.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// ✈️ MARKET-OPEN PRE-FLIGHT CHECK ENGINE (ANGEL ONE & STATIC IP)
// ─────────────────────────────────────────────────────────────
const { MarketPreflightService, getISTDateString } = require('../services/compliance/MarketPreflightService');

// GET /api/algo/preflight/status — Get today's pre-flight check state
router.get('/preflight/status', async (req, res) => {
  const userId = await resolveTargetUserId(req);
  try {
    const today = getISTDateString();
    const cached = MarketPreflightService.getCachedPreflight(userId);
    if (cached) {
      return res.json({ success: true, ...cached.result, isCached: true });
    }
    res.json({
      success: true,
      readyForLiveTrading: false,
      status: 'NOT_RUN',
      message: 'Pre-flight check has not been run for today yet.',
      dateStr: today,
      safeSummary: {
        broker: 'Angel One',
        proxy: 'PENDING',
        riskControls: 'PENDING',
        killSwitch: 'PENDING',
        algo: 'NOT_RUN',
        tradingDate: today,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/algo/preflight/run — Run complete READ-ONLY market pre-flight audit
router.post('/preflight/run', async (req, res) => {
  const userId = await resolveTargetUserId(req);
  const { forceRefresh = false } = req.body || {};
  try {
    const result = await MarketPreflightService.runAngelOnePreflight(userId, {
      prismaClient: prisma,
      decryptFn: decryptCredential,
      AuditLogger,
      forceRefresh: !!forceRefresh,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// 🖥️ IN-DASHBOARD TRADING VPS BILLING & LIFECYCLE MANAGEMENT
// ─────────────────────────────────────────────────────────────
const { VpsSubscriptionService } = require('../../packages/agent/lib/vps/VpsSubscriptionService');
const vpsSubscriptionService = new VpsSubscriptionService({ prisma });

// GET /api/algo/vps/details — User VPS, Dedicated Static IP & Billing Info
router.get('/vps/details', async (req, res) => {
  try {
    const details = await vpsSubscriptionService.getUserVpsDetails(req.user.id);
    res.json(details);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/algo/vps/purchase — 1-Click Purchase from Wallet Tokens
router.post('/vps/purchase', async (req, res) => {
  try {
    const { planTier = 'STARTER_1VCPU_2GB', pairingKey, autoRenew = true } = req.body;
    const result = await vpsSubscriptionService.purchaseVps({
      userId: req.user.id,
      planTier,
      pairingKey,
      autoRenew,
    });
    res.json(result);
  } catch (err) {
    const status = err.code === 'INSUFFICIENT_WALLET_BALANCE' ? 400 : 500;
    res.status(status).json({ success: false, message: err.message, code: err.code, required: err.required, balance: err.balance });
  }
});

// POST /api/algo/vps/toggle-autorenew — Toggle Auto-Renew ON/OFF
router.post('/vps/toggle-autorenew', async (req, res) => {
  try {
    const { enabled } = req.body;
    const result = await vpsSubscriptionService.toggleAutoRenew(req.user.id, enabled);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/algo/vps/renew-manual — Manual 1-Click Renewal from Wallet Tokens
router.post('/vps/renew-manual', async (req, res) => {
  try {
    const result = await vpsSubscriptionService.manualRenewVps(req.user.id);
    res.json(result);
  } catch (err) {
    const status = err.code === 'INSUFFICIENT_WALLET_BALANCE' ? 400 : 500;
    res.status(status).json({ success: false, message: err.message, code: err.code });
  }
});

// POST /api/algo/vps/retry-grace — Resume from Grace Period
router.post('/vps/retry-grace', async (req, res) => {
  try {
    const result = await vpsSubscriptionService.retryGraceRenewal(req.user.id);
    res.json(result);
  } catch (err) {
    const status = err.code === 'INSUFFICIENT_WALLET_BALANCE' ? 400 : 500;
    res.status(status).json({ success: false, message: err.message, code: err.code });
  }
});

// POST /api/algo/vps/cancel — Cancel Auto-Renew at Period End
router.post('/vps/cancel', async (req, res) => {
  try {
    const result = await vpsSubscriptionService.cancelVps(req.user.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// 🌐 CLIENT-FACING STATIC IP ASSIGNMENT (READ-ONLY)
// ─────────────────────────────────────────────────────────────
router.get('/static-ip', async (req, res) => {
  const userId = await resolveTargetUserId(req);
  try {
    const assignment = await prisma.clientStaticIpAssignment.findFirst({
      where: {
        userId,
        status: { in: ['ASSIGNED', 'VERIFYING', 'VERIFIED', 'BLOCKED'] }
      },
      include: {
        brokerConnection: {
          select: { id: true, broker: true, displayName: true, clientId: true, isActive: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const isOnline = agentTunnelServer.isAgentOnline(userId);
    const session = agentTunnelServer.activeSessions.get(userId);

    if (!assignment) {
      return res.json({
        success: true,
        hasAssignment: false,
        isAgentOnline: isOnline,
        assignment: null,
      });
    }

    res.json({
      success: true,
      hasAssignment: true,
      isAgentOnline: isOnline,
      assignment: {
        id: assignment.id,
        broker: assignment.broker,
        connectionType: assignment.connectionType || 'DIRECT_IP',
        ipAddress: assignment.ipAddress,
        status: assignment.status,
        assignedAt: assignment.assignedAt,
        verifiedAt: assignment.verifiedAt,
        lastObservedOutboundIp: assignment.connectionType === 'DIRECT_IP'
          ? (assignment.lastObservedOutboundIp || session?.agentIp || null)
          : (assignment.lastObservedOutboundIp || null),
        brokerConnection: assignment.brokerConnection,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── REUSABLE MULTI-USER ONBOARDING & DRY-RUN ENDPOINTS ──────────────────────

const { AlgoUserOnboardingService } = require('../services/algoUserOnboardingService');
const onboardingService = new AlgoUserOnboardingService(prisma);

/**
 * POST /api/algo/onboard
 * Generic onboarding for any user with isolated credentials, trigger configs, and risk settings.
 */
router.post('/onboard', async (req, res) => {
  try {
    const targetUserId = (req.user?.role === 'ADMIN' && (req.body?.userId || req.query?.userId))
      ? (req.body?.userId || req.query?.userId)
      : req.user?.id;

    if (!targetUserId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const result = await onboardingService.onboardUser(targetUserId, req.body || {});
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/algo/onboard/dry-run
 * 100% Read-Only Pre-Live Verification for any user.
 */
router.post('/onboard/dry-run', async (req, res) => {
  try {
    const targetUserId = (req.user?.role === 'ADMIN' && (req.body?.userId || req.query?.userId))
      ? (req.body?.userId || req.query?.userId)
      : req.user?.id;

    if (!targetUserId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const result = await onboardingService.runReadOnlyDryRun(targetUserId, req.body?.connectionId || null);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/algo/onboard/activate-live
 * Live activation after successful dry-run audit.
 */
router.post('/onboard/activate-live', async (req, res) => {
  try {
    const targetUserId = (req.user?.role === 'ADMIN' && (req.body?.userId || req.query?.userId))
      ? (req.body?.userId || req.query?.userId)
      : req.user?.id;

    if (!targetUserId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const connectionId = req.body?.connectionId;
    if (!connectionId) {
      return res.status(400).json({ success: false, message: 'connectionId is required for activation.' });
    }

    const result = await onboardingService.activateLive(targetUserId, connectionId);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;


