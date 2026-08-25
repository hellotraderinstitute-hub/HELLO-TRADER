/**
 * agentTunnelServer.js — Cloud Agent Tunnel Gateway (Phase 1)
 *
 * SECURE PROTOCOL SPECIFICATION:
 *   - Authenticates Client-Hosted Execution Agents over WebSocket (/agent-tunnel).
 *   - Cryptographic verification: Agents provide `pairingKey` (SHA-256 hashed server-side).
 *   - Server-Side Identity Binding: Resolves `userId` strictly from verified database records.
 *   - Strict Multi-User Isolation: Each agent socket joins ONLY its private user room (`agent:${userId}`).
 *   - Heartbeat & Liveness: Evaluates `agent:ping` every 5 seconds, measures latency, updates `lastSeenAt`.
 *   - Zero Real Orders: Phase 1 supports ONLY simulation & health check messages (`AGENT_TEST_SIGNAL`).
 *   - Audit Logging: All key generation, authentication, connection, disconnection, and test signals logged.
 */

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { AuditLogger, CATEGORIES } = require('./auditLogger');

const prisma = new PrismaClient();

class AgentTunnelServer {
  constructor() {
    this.io = null;
    this.namespace = null;
    // In-memory active session map: userId -> { socketId, agentKeyId, agentIp, connectedAt, lastSeenAt, latencyMs, version }
    this.activeSessions = new Map();
    // Rate limit map: ip -> { count, resetAt }
    this.authAttempts = new Map();
    // Pending test signal promises: signalId -> { resolve, reject, timer }
    this.pendingTestSignals = new Map();
  }

  /**
   * Initialize the Agent Tunnel WebSocket Namespace
   * @param {import('socket.io').Server} io
   */
  initialize(io) {
    if (!io) throw new Error('[AgentTunnel] Socket.io server instance is required.');
    this.io = io;
    this.namespace = io.of('/agent-tunnel');

    // Attach Authentication Middleware
    this.namespace.use(async (socket, next) => {
      try {
        const clientIp = socket.handshake.headers['cf-connecting-ip'] ||
                         socket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                         socket.handshake.address ||
                         '127.0.0.1';

        // 1. Rate Limiting Protection (Max 10 auth attempts per IP per minute)
        const now = Date.now();
        const rateData = this.authAttempts.get(clientIp) || { count: 0, resetAt: now + 60000 };
        if (now > rateData.resetAt) {
          rateData.count = 0;
          rateData.resetAt = now + 60000;
        }
        rateData.count++;
        this.authAttempts.set(clientIp, rateData);

        if (rateData.count > 10) {
          console.warn(`[AgentTunnel] Rate limit exceeded for IP: ${clientIp}`);
          return next(new Error('AUTH_RATE_LIMIT_EXCEEDED'));
        }

        // 2. Extract Pairing Key from Handshake Auth or Headers
        const pairingKey = socket.handshake.auth?.pairingKey ||
                           socket.handshake.headers['x-agent-key'] ||
                           socket.handshake.query?.key;

        if (!pairingKey || typeof pairingKey !== 'string' || !pairingKey.startsWith('ht_agent_live_')) {
          console.warn(`[AgentTunnel] Connection rejected: Invalid pairing key format from IP ${clientIp}`);
          return next(new Error('INVALID_PAIRING_KEY_FORMAT'));
        }

        // 3. Compute SHA-256 Hash of Pairing Key
        const keyHash = crypto.createHash('sha256').update(pairingKey.trim()).digest('hex');

        // 4. Query Database for Active Agent Key
        const agentKey = await prisma.agentKey.findUnique({
          where: { keyHash },
          include: { user: { select: { id: true, studentId: true, name: true, status: true, role: true } } }
        });

        if (!agentKey || agentKey.status !== 'ACTIVE' || !agentKey.user || agentKey.user.status !== 'ACTIVE') {
          if (agentKey?.userId) {
            await AuditLogger.log({
              userId: agentKey.userId, category: CATEGORIES.AUTH, action: 'AGENT_AUTH_FAILED',
              detail: `Agent connection rejected: Key revoked, expired, or user inactive (Key prefix: ${pairingKey.slice(0, 16)}...) from IP ${clientIp}`,
              ip: clientIp,
            });
          } else {
            console.warn(`[AgentTunnel] Connection rejected: Unrecognized key from IP ${clientIp}`);
          }
          return next(new Error('AGENT_KEY_REVOKED_OR_INVALID'));
        }

        // 5. Attach Verified User & Agent Context to Socket (NEVER trust client-supplied userId)
        socket.userId = agentKey.user.id;
        socket.studentId = agentKey.user.studentId;
        socket.userName = agentKey.user.name;
        socket.agentKeyId = agentKey.id;

        // Resolve Real Public Egress IP
        const reportedIp = socket.handshake.auth?.publicIp;
        let resolvedIp = clientIp;
        if (reportedIp && reportedIp !== '127.0.0.1' && reportedIp !== '::1') {
          resolvedIp = reportedIp;
        } else if (clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1') {
          try {
            const assignment = await prisma.clientStaticIpAssignment.findFirst({
              where: { userId: agentKey.user.id, status: 'VERIFIED' }
            });
            if (assignment?.ipAddress) {
              resolvedIp = assignment.ipAddress;
            }
          } catch (_) {}
        }

        socket.agentIp = resolvedIp;
        socket.clientVersion = socket.handshake.auth?.version || socket.handshake.query?.v || '1.0.0';

        next();
      } catch (err) {
        console.error('[AgentTunnel] Authentication middleware error:', err.message);
        next(new Error('AGENT_AUTH_INTERNAL_ERROR'));
      }
    });

    // Handle Connection Lifecycle
    this.namespace.on('connection', async (socket) => {
      const { userId, studentId, userName, agentKeyId, agentIp, clientVersion } = socket;
      const connectedAt = new Date();

      console.log(`[AgentTunnel] 🟢 Agent Connected for User: ${studentId} (${userName}) from IP: ${agentIp} [Socket: ${socket.id}]`);

      // Strict Isolation: Agent joins ONLY its private user room
      const userRoom = `agent:${userId}`;
      socket.join(userRoom);

      // Create Agent Session Record in DB
      let sessionRecord = null;
      try {
        sessionRecord = await prisma.agentSession.create({
          data: {
            agentKeyId,
            userId,
            agentIp,
            connectedAt,
            lastHeartbeatAt: connectedAt,
            status: 'CONNECTED',
            version: clientVersion,
          }
        });

        // Update AgentKey record metadata
        await prisma.agentKey.update({
          where: { id: agentKeyId },
          data: { lastSeenAt: connectedAt, connectedAt, agentIp }
        });
      } catch (dbErr) {
        console.error('[AgentTunnel] Failed to persist session record:', dbErr.message);
      }

      // Store in In-Memory Active Registry
      this.activeSessions.set(userId, {
        socketId: socket.id,
        sessionId: sessionRecord?.id,
        agentKeyId,
        studentId,
        userName,
        agentIp,
        connectedAt,
        lastSeenAt: connectedAt,
        latencyMs: 0,
        version: clientVersion,
      });

      // Audit Log
      await AuditLogger.log({
        userId, category: CATEGORIES.BROKER, action: 'AGENT_CONNECTED',
        detail: `Client Execution Agent connected from IP ${agentIp} (Version: ${clientVersion})`,
        meta: { agentKeyId, socketId: socket.id, agentIp, version: clientVersion },
        ip: agentIp,
      });

      // Synchronize Static IP Assignment Verification
      await this.verifyUserStaticIp(userId, agentIp);

      // Emit connection ACK to the Agent
      socket.emit('agent:connected_ack', {
        status: 'READY',
        serverTime: Date.now(),
        userId,
        studentId,
        message: 'Hello Trader Agent Tunnel established successfully.',
      });

      // ─── Heartbeat Protocol (agent:ping -> agent:pong) ────────────────────
      socket.on('agent:ping', async (data) => {
        const clientTimestamp = data?.timestamp || Date.now();
        const serverTimestamp = Date.now();
        const roundTripEstimate = Math.max(0, serverTimestamp - clientTimestamp);

        const currentSession = this.activeSessions.get(userId);
        if (currentSession && currentSession.socketId === socket.id) {
          currentSession.lastSeenAt = new Date();
          currentSession.latencyMs = roundTripEstimate;
        }

        // Respond with server pong
        socket.emit('agent:pong', {
          clientTimestamp,
          serverTimestamp,
          latencyMs: roundTripEstimate,
        });

        // Periodically update DB heartbeat
        try {
          if (sessionRecord?.id) {
            await prisma.agentSession.update({
              where: { id: sessionRecord.id },
              data: { lastHeartbeatAt: new Date(), latencyMs: roundTripEstimate }
            });
          }
        } catch (_) {}
      });

      // ─── Test Signal Acknowledgement Handler ──────────────────────────────
      socket.on('agent:test_ack', async (ackData) => {
        const { signalId, status, details } = ackData || {};
        if (signalId && this.pendingTestSignals.has(signalId)) {
          const { resolve, timer } = this.pendingTestSignals.get(signalId);
          clearTimeout(timer);
          this.pendingTestSignals.delete(signalId);

          const rttMs = Date.now() - (ackData.dispatchedAt || Date.now());

          await AuditLogger.log({
            userId, category: CATEGORIES.WEBHOOK, action: 'AGENT_TEST_ACKNOWLEDGED',
            detail: `Agent acknowledged TEST signal ${signalId} (Status: ${status}, RTT: ${rttMs}ms)`,
            meta: { signalId, status, rttMs, details },
            ip: agentIp,
          });

          resolve({
            success: status === 'SUCCESS' || status === 'ACKNOWLEDGED',
            signalId,
            status,
            rttMs,
            details: details || 'Agent test signal acknowledged successfully.',
            acknowledgedAt: new Date().toISOString(),
          });
        }
      });

      // ─── Webhook Signal Acknowledgement Handler (Phase 3 Simulation) ──────
      socket.on('agent:signal_ack', async (ackData) => {
        const { signalId, success, status, orderId, broker, reason, latencyMs } = ackData || {};
        if (signalId && this.pendingTestSignals.has(signalId)) {
          const { resolve, timer } = this.pendingTestSignals.get(signalId);
          clearTimeout(timer);
          this.pendingTestSignals.delete(signalId);

          const rttMs = Date.now() - (ackData.dispatchedAt || Date.now());

          await AuditLogger.log({
            userId, category: CATEGORIES.ORDER, action: success ? 'AGENT_SIMULATION_EXECUTED' : 'AGENT_SIMULATION_REJECTED',
            detail: `Agent acknowledged signal ${signalId} via broker ${broker || 'MOCK'} (Status: ${status}, OrderID: ${orderId || 'N/A'}, Latency: ${latencyMs || rttMs}ms)`,
            meta: { signalId, success, status, orderId, broker, reason, rttMs },
            ip: agentIp,
          });

          resolve({
            success: !!success,
            signalId,
            status: status || (success ? 'SIMULATION_EXECUTED' : 'REJECTED'),
            orderId: orderId || null,
            broker: broker || 'MOCK',
            reason: reason || null,
            rttMs,
            acknowledgedAt: new Date().toISOString(),
          });
        }
      });

      // ─── Disconnect Handler ──────────────────────────────────────────────
      socket.on('disconnect', async (reason) => {
        console.log(`[AgentTunnel] 🔴 Agent Disconnected for User: ${studentId} [Reason: ${reason}]`);

        const currentSession = this.activeSessions.get(userId);
        if (currentSession && currentSession.socketId === socket.id) {
          this.activeSessions.delete(userId);
        }

        const disconnectedAt = new Date();

        try {
          if (sessionRecord?.id) {
            await prisma.agentSession.update({
              where: { id: sessionRecord.id },
              data: { status: 'DISCONNECTED', disconnectedAt }
            });
          }
          await prisma.agentKey.update({
            where: { id: agentKeyId },
            data: { lastSeenAt: disconnectedAt }
          });
        } catch (_) {}

        await AuditLogger.log({
          userId, category: CATEGORIES.BROKER, action: 'AGENT_DISCONNECTED',
          detail: `Client Execution Agent disconnected (Reason: ${reason}) from IP ${agentIp}`,
          meta: { agentKeyId, reason, disconnectedAt },
          ip: agentIp,
        });
      });
    });

    console.log('[AgentTunnel] WebSocket Namespace /agent-tunnel initialized.');
  }

  /**
   * Check if user's Agent is currently online
   * @param {string} userId
   * @returns {boolean}
   */
  isAgentOnline(userId) {
    const session = this.activeSessions.get(userId);
    if (!session) return false;
    // Heartbeat timeout threshold: 15 seconds
    const isRecent = (Date.now() - new Date(session.lastSeenAt).getTime()) < 15000;
    return isRecent;
  }

  /**
   * Get active session metadata for a user
   * @param {string} userId
   */
  getAgentStatus(userId) {
    const session = this.activeSessions.get(userId);
    if (!session || !this.isAgentOnline(userId)) {
      return { isOnline: false, online: false, session: null };
    }
    return {
      isOnline: true,
      online: true,
      session: {
        agentIp: session.agentIp,
        connectedAt: session.connectedAt,
        lastSeenAt: session.lastSeenAt,
        latencyMs: session.latencyMs,
        version: session.version,
      }
    };
  }

  /**
   * Dispatch a SAFE Simulation / Test Signal to a User's Agent
   * (Zero Broker Interaction)
   * @param {string} userId
   * @param {object} testPayload
   * @returns {Promise<object>}
   */
  async dispatchTestSignal(userId, testPayload = {}) {
    if (!this.isAgentOnline(userId)) {
      return {
        success: false,
        error: 'AGENT_OFFLINE',
        message: 'Client Execution Agent is currently offline. Please start your agent CLI on your VPS/machine.'
      };
    }

    const session = this.activeSessions.get(userId);
    const signalId = `test_sig_${crypto.randomBytes(8).toString('hex')}`;
    const dispatchedAt = Date.now();

    const signalEnvelope = {
      type: 'AGENT_TEST_SIGNAL',
      signalId,
      dispatchedAt,
      symbol: testPayload.symbol || 'NIFTY',
      action: testPayload.action || 'BUY',
      quantity: testPayload.quantity || 1,
      price: testPayload.price || 24500.00,
      timestamp: new Date().toISOString(),
      instructions: 'SIMULATION ONLY — DO NOT ROUTE TO BROKER',
    };

    await AuditLogger.log({
      userId, category: CATEGORIES.WEBHOOK, action: 'AGENT_TEST_DISPATCHED',
      detail: `Dispatched simulation TEST signal ${signalId} to Agent at IP ${session.agentIp}`,
      meta: { signalId, signalEnvelope },
    });

    return new Promise((resolve) => {
      // Timeout after 5 seconds if agent doesn't respond
      const timer = setTimeout(() => {
        this.pendingTestSignals.delete(signalId);
        resolve({
          success: false,
          error: 'TEST_SIGNAL_TIMEOUT',
          signalId,
          message: 'Agent did not acknowledge the test signal within 5000ms.',
        });
      }, 5000);

      this.pendingTestSignals.set(signalId, { resolve, timer });

      // Emit strictly to the user's isolated room
      this.namespace.to(`agent:${userId}`).emit('agent:test_signal', signalEnvelope);
    });
  }

  /**
   * Dispatch a Webhook Signal to the User's Active Client Agent (Simulation-Only in Phase 3)
   * @param {string} userId
   * @param {object} signalEnvelope
   * @returns {Promise<object>}
   */
  async dispatchSignalToAgent(userId, signalEnvelope) {
    if (!this.isAgentOnline(userId)) {
      return {
        success: false,
        error: 'AGENT_OFFLINE',
        message: 'Client Execution Agent is not connected.'
      };
    }

    const session = this.activeSessions.get(userId);
    const signalId = signalEnvelope.signalId || `sig_${crypto.randomBytes(8).toString('hex')}`;
    const payload = {
      ...signalEnvelope,
      signalId,
      dispatchedAt: Date.now(),
      isSimulation: true, // Explicit simulation flag for Phase 3
    };

    await AuditLogger.log({
      userId, category: CATEGORIES.WEBHOOK, action: 'AGENT_SIGNAL_DISPATCHED',
      detail: `Dispatched simulation webhook signal ${signalId} (${payload.symbol} ${payload.action}) to Agent at IP ${session.agentIp}`,
      meta: { signalId, payload },
    });

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingTestSignals.delete(signalId);
        resolve({
          success: false,
          error: 'SIGNAL_TIMEOUT',
          signalId,
          message: 'Client Agent did not acknowledge signal dispatch within 5000ms.',
        });
      }, 5000);

      this.pendingTestSignals.set(signalId, { resolve, timer });

      // Emit exclusively to the authenticated user's agent room
      this.namespace.to(`agent:${userId}`).emit('agent:signal', payload);
    });
  }

  /**
   * Automatically verify active ClientStaticIpAssignment against observed agent IP
   * @param {string} userId
   * @param {string} agentIp
   */
  async verifyUserStaticIp(userId, agentIp) {
    if (!userId || !agentIp) return;
    if (agentIp === '127.0.0.1' || agentIp === '::1' || agentIp === '::ffff:127.0.0.1') return;
    try {
      const assignment = await prisma.clientStaticIpAssignment.findFirst({
        where: {
          userId,
          status: { in: ['ASSIGNED', 'VERIFYING', 'VERIFIED', 'BLOCKED'] },
        },
      });
      if (assignment) {
        // If this assignment uses a Proxy (HTTPS_PROXY / HTTP_PROXY / SOCKS5 / has proxyHost),
        // the dedicated static IP is the proxy egress IP, verified through outbound proxy probes.
        // It must NOT be marked BLOCKED simply because the tunnel websocket originates from the server/VPS host IP.
        const isProxy = assignment.connectionType === 'HTTPS_PROXY' ||
                        assignment.connectionType === 'HTTP_PROXY' ||
                        assignment.connectionType === 'SOCKS5' ||
                        !!assignment.proxyHost;
        if (isProxy) {
          return;
        }

        const isMatch = (assignment.ipAddress === agentIp);
        const newStatus = isMatch ? 'VERIFIED' : 'BLOCKED';
        await prisma.clientStaticIpAssignment.update({
          where: { id: assignment.id },
          data: {
            status: newStatus,
            lastObservedOutboundIp: agentIp,
            verifiedAt: isMatch ? new Date() : assignment.verifiedAt,
          }
        });
      }
    } catch (err) {
      console.warn('[AgentTunnel] IP verification sync note:', err.message);
    }
  }

  /**
   * Revoke & Disconnect any active socket using a specific AgentKey
   * @param {string} agentKeyId
   */
  async disconnectKeySessions(agentKeyId) {
    if (!this.namespace) return;
    for (const [userId, session] of this.activeSessions.entries()) {
      if (session.agentKeyId === agentKeyId) {
        const socket = this.namespace.sockets.get(session.socketId);
        if (socket) {
          socket.emit('agent:revoked', { message: 'Your Agent Pairing Key has been revoked by the account owner.' });
          socket.disconnect(true);
        }
        this.activeSessions.delete(userId);
      }
    }
  }
}

const agentTunnelServer = new AgentTunnelServer();

module.exports = {
  AgentTunnelServer,
  agentTunnelServer,
};
