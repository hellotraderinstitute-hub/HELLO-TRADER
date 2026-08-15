/**
 * copy.js — Copy Trading Engine Backend Routes
 *
 * Compliance:
 *   - Explicit consent required before following any master trader
 *   - Risk controls (max daily loss, max open trades, emergency stop) enforced per follower
 *   - Master & follower kill switches supported
 *   - Full audit trail logging for all copy actions
 *
 * Routes:
 *   POST /api/copy/register-master     - Register as Master Trader
 *   GET  /api/copy/masters             - List verified public master traders
 *   POST /api/copy/follow              - Follow a Master (with explicit consent & risk settings)
 *   POST /api/copy/unfollow/:id        - Stop following a Master
 *   POST /api/copy/master/broadcast    - Broadcast trade from Master to followers
 *   POST /api/copy/follower/:id/kill   - Emergency stop / Kill switch for specific follower
 *   GET  /api/copy/my-following        - List masters user is currently following
 *   GET  /api/copy/my-followers        - List followers (if user is a Master)
 *   GET  /api/copy/logs                - Execution logs for user's copied trades
 */

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { CopyEngine } = require('../services/copyEngine');
const { AuditLogger, CATEGORIES } = require('../services/auditLogger');
const { N } = require('../services/notifier');

const prisma = new PrismaClient();

const COPY_CONSENT_TEXT_V1 = [
  'I authorize Hello Trader to mirror trades placed by my selected Master Trader to my connected broker account.',
  'I understand that Copy Trading involves market risk and past performance of Master Traders does not guarantee future results.',
  'I acknowledge that no profits or returns are guaranteed.',
  'I remain fully responsible for my own account equity and copy trading settings.',
  'I confirm I can activate Emergency Stop or unfollow at any time to halt automated copy execution.',
].join(' | ');

// ─── POST /register-master ─────────────────────────────────────
router.post('/register-master', async (req, res) => {
  const userId = req.user.id;
  const { connectionId, displayName, description, riskLevel, isPublic, maxFollowers } = req.body;

  if (!connectionId || !displayName) {
    return res.status(400).json({ success: false, message: 'Broker connection and Display Name are required.' });
  }

  try {
    const master = await prisma.copyMaster.upsert({
      where: { userId },
      update: {
        connectionId,
        displayName,
        description: description || null,
        riskLevel: riskLevel || 'MEDIUM',
        isPublic: isPublic ?? true,
        maxFollowers: maxFollowers ? parseInt(maxFollowers) : 10,
        isActive: true,
      },
      create: {
        userId,
        connectionId,
        displayName,
        description: description || null,
        riskLevel: riskLevel || 'MEDIUM',
        isPublic: isPublic ?? true,
        maxFollowers: maxFollowers ? parseInt(maxFollowers) : 10,
        isActive: true,
      }
    });

    await AuditLogger.log({
      userId, category: CATEGORIES.COPY, action: 'MASTER_REGISTERED',
      detail: `User registered as Master Trader: ${displayName}`,
      meta: { masterId: master.id, displayName, riskLevel }, req,
    });

    res.json({ success: true, message: 'Registered as Master Trader successfully!', master });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /masters ──────────────────────────────────────────────
router.get('/masters', async (req, res) => {
  try {
    const masters = await prisma.copyMaster.findMany({
      where: { isActive: true, isPublic: true },
      include: {
        user: { select: { name: true, studentId: true } },
        _count: { select: { followers: { where: { isActive: true } } } }
      },
      orderBy: { performanceRoi: 'desc' }
    });

    const result = masters.map(m => ({
      id: m.id,
      userId: m.userId,
      displayName: m.displayName,
      description: m.description,
      riskLevel: m.riskLevel,
      winRate: m.winRate,
      performanceRoi: m.performanceRoi,
      totalTrades: m.totalTrades,
      maxFollowers: m.maxFollowers,
      currentFollowers: m._count.followers,
      traderName: m.user.name,
    }));

    res.json({ success: true, masters: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /follow ──────────────────────────────────────────────
router.post('/follow', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const {
      masterId, connectionId, allocationType, allocationValue,
      maxDailyLoss, maxOpenTrades, consentAccepted
    } = req.body || {};

    if (!consentAccepted) {
      return res.status(400).json({
        success: false,
        error: 'CONSENT_REQUIRED',
        message: 'You must explicitly accept authorization terms before copy trading.'
      });
    }

    if (!masterId || !connectionId) {
      return res.status(400).json({ success: false, message: 'Master ID and Broker Connection ID are required.' });
    }

    const master = await prisma.copyMaster.findUnique({
      where: { id: masterId },
      include: { _count: { select: { followers: { where: { isActive: true } } } } }
    });

    if (!master || !master.isActive) {
      return res.status(404).json({ success: false, message: 'Master trader not found or inactive.' });
    }

    if (master.userId === userId) {
      return res.status(400).json({ success: false, message: 'You cannot follow yourself as a Master.' });
    }

    if (master._count.followers >= master.maxFollowers) {
      return res.status(400).json({ success: false, message: `Master has reached maximum limit of ${master.maxFollowers} followers.` });
    }

    const ip = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress;

    const follower = await prisma.copyFollower.create({
      data: {
        masterId,
        userId,
        connectionId,
        allocationType: allocationType || 'FIXED_QTY',
        allocationValue: allocationValue ? parseFloat(allocationValue) : 1,
        maxDailyLoss: maxDailyLoss ? parseFloat(maxDailyLoss) : 5000,
        maxOpenTrades: maxOpenTrades ? parseInt(maxOpenTrades) : 5,
        consentAccepted: true,
        consentAt: new Date(),
        consentIp: ip,
        isActive: true,
      }
    });

    await AuditLogger.log({
      userId, category: CATEGORIES.COPY, action: 'FOLLOW_MASTER',
      detail: `Started following Master: ${master.displayName}`,
      meta: { masterId, followerId: follower.id, allocationType, allocationValue }, req,
    });

    // Notify admin
    const followerUser = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, studentId: true } });
    N.copyFollow({ followerName: followerUser?.name || 'Student', followerId: followerUser?.studentId || userId, masterName: master.displayName, masterId });

    res.json({ success: true, message: `Now copy trading under Master: ${master.displayName}!`, follower });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /unfollow/:id ────────────────────────────────────────
router.post('/unfollow/:id', async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  try {
    const follower = await prisma.copyFollower.findFirst({ where: { id, userId } });
    if (!follower) return res.status(404).json({ success: false, message: 'Follower record not found.' });

    await prisma.copyFollower.update({
      where: { id },
      data: { isActive: false }
    });

    await AuditLogger.log({
      userId, category: CATEGORIES.COPY, action: 'UNFOLLOW_MASTER',
      detail: `Unfollowed Master ID: ${follower.masterId}`,
      meta: { followerId: id }, req,
    });

    res.json({ success: true, message: 'Unfollowed master trader successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /master/broadcast ────────────────────────────────────
router.post('/master/broadcast', async (req, res) => {
  const userId = req.user.id;
  const { symbol, exchange, side, quantity, price, orderType, productType, sl, target } = req.body;

  if (!symbol || !side || !quantity) {
    return res.status(400).json({ success: false, message: 'Symbol, side (BUY/SELL), and quantity are required.' });
  }

  try {
    const masterOrder = { symbol, exchange: exchange || 'NSE', side, quantity: parseInt(quantity), price: parseFloat(price || 0), orderType, productType, sl, target };
    const result = await CopyEngine.broadcastTrade({
      masterUserId: userId,
      masterOrder,
      io: req.io,
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /follower/:id/kill ───────────────────────────────────
router.post('/follower/:id/kill', async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { active, reason } = req.body;

  try {
    const follower = await prisma.copyFollower.findFirst({ where: { id, userId } });
    if (!follower) return res.status(404).json({ success: false, message: 'Follower record not found.' });

    await prisma.copyFollower.update({
      where: { id },
      data: {
        killSwitchActive: !!active,
        killSwitchAt: active ? new Date() : null,
        emergencyStop: !!active,
      }
    });

    await AuditLogger.log({
      userId, category: CATEGORIES.KILL,
      action: active ? 'COPY_KILL_ON' : 'COPY_KILL_OFF',
      detail: `Copy Trading Kill Switch ${active ? 'ACTIVATED' : 'DEACTIVATED'} for follower record`,
      meta: { followerId: id, reason }, req,
    });

    res.json({ success: true, message: active ? '🛑 Copy trading emergency stop activated.' : '✅ Emergency stop cleared.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /my-following ─────────────────────────────────────────
router.get('/my-following', async (req, res) => {
  try {
    const following = await prisma.copyFollower.findMany({
      where: { userId: req.user.id, isActive: true },
      include: {
        master: { select: { displayName: true, riskLevel: true, winRate: true, performanceRoi: true } },
      }
    });
    res.json({ success: true, following });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /logs ─────────────────────────────────────────────────
router.get('/logs', async (req, res) => {
  try {
    const logs = await prisma.copyTradeLog.findMany({
      where: {
        follower: { userId: req.user.id }
      },
      include: {
        master: { select: { displayName: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /my-followers ─────────────────────────────────────────
// Master sees who is following them
router.get('/my-followers', async (req, res) => {
  try {
    const master = await prisma.copyMaster.findUnique({
      where: { userId: req.user.id },
      include: {
        followers: {
          include: {
            user: { select: { name: true, studentId: true } }
          }
        }
      }
    });
    if (!master) return res.status(404).json({ success: false, message: 'You are not registered as a Master Trader.' });
    res.json({ success: true, followers: master.followers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /master/stats ─────────────────────────────────────────
// Master's performance stats
router.get('/master/stats', async (req, res) => {
  try {
    const master = await prisma.copyMaster.findUnique({
      where: { userId: req.user.id },
      include: {
        _count: { select: { followers: { where: { isActive: true } } } }
      }
    });
    if (!master) return res.status(404).json({ success: false, message: 'Not a Master Trader.' });
    res.json({
      success: true,
      stats: {
        totalTrades:    master.totalTrades,
        winRate:        master.winRate,
        performanceRoi: master.performanceRoi,
        activeFollowers: master._count.followers,
        pollingEnabled: master.pollingEnabled,
        lastPolledAt:   master.lastPolledAt,
        isActive:       master.isActive,
        killSwitch:     master.killSwitch,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /master/orders ────────────────────────────────────────
// Today's detected master broker orders (polling results)
router.get('/master/orders', async (req, res) => {
  try {
    const master = await prisma.copyMaster.findUnique({ where: { userId: req.user.id } });
    if (!master) return res.status(404).json({ success: false, message: 'Not a Master Trader.' });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const orders = await prisma.copyMasterOrder.findMany({
      where: { masterId: master.id, detectedAt: { gte: today } },
      include: {
        _count: { select: { copyLogs: true } }
      },
      orderBy: { detectedAt: 'desc' }
    });

    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /master/polling/start ────────────────────────────────
// Start broker polling for master (activates Copy Trading)
router.post('/master/polling/start', async (req, res) => {
  const userId = req.user.id;
  try {
    const master = await prisma.copyMaster.findUnique({ where: { userId } });
    if (!master) return res.status(404).json({ success: false, message: 'Register as Master Trader first.' });

    await prisma.copyMaster.update({
      where: { userId },
      data: { pollingEnabled: true, isActive: true }
    });

    // Start the poller in-process
    const poller = require('../services/masterOrderPoller');
    poller.startMaster(master.id, req.io, master.pollIntervalSecs || 5);

    await AuditLogger.log({
      userId, category: CATEGORIES.COPY, action: 'POLLING_STARTED',
      detail: `Master ${master.displayName} started broker polling (Copy Trading active)`,
      meta: { masterId: master.id }, req,
    });

    res.json({ success: true, message: '✅ Copy Trading polling started. Your broker account is now being monitored.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /master/polling/stop ─────────────────────────────────
// Stop broker polling (pauses Copy Trading without unregistering)
router.post('/master/polling/stop', async (req, res) => {
  const userId = req.user.id;
  try {
    const master = await prisma.copyMaster.findUnique({ where: { userId } });
    if (!master) return res.status(404).json({ success: false, message: 'Not a Master Trader.' });

    await prisma.copyMaster.update({
      where: { userId },
      data: { pollingEnabled: false }
    });

    const poller = require('../services/masterOrderPoller');
    poller.stopMaster(master.id);

    await AuditLogger.log({
      userId, category: CATEGORIES.COPY, action: 'POLLING_STOPPED',
      detail: `Master ${master.displayName} stopped broker polling`,
      meta: { masterId: master.id }, req,
    });

    res.json({ success: true, message: '⏸️ Copy Trading polling paused. Followers will not receive new trades until you restart.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /polling/status ───────────────────────────────────────
// Check which masters are currently being polled (admin-useful)
router.get('/polling/status', async (req, res) => {
  try {
    const poller = require('../services/masterOrderPoller');
    const activePollers = poller.getActivePollers();
    res.json({ success: true, activePollers, count: activePollers.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

