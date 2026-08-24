/**
 * AuditLogger — Hello Trader Immutable Audit Trail
 *
 * Every important action is logged with:
 *   - userId, category, action, detail, meta (JSON), ipAddress, timestamp
 *
 * Usage:
 *   await AuditLogger.log({ userId, category: 'BROKER', action: 'CONNECTED', detail: 'Connected Dhan', req })
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CATEGORIES = {
  BROKER:     'BROKER',        // Connect, disconnect, test
  ALGO:       'ALGO',          // Enable/disable algo
  WEBHOOK:    'WEBHOOK',       // Received, processed
  RISK:       'RISK',          // Pass, fail + reason
  ORDER:      'ORDER',         // Sent, accepted, rejected, failed
  POSITION:   'POSITION',      // Opened, closed, SL hit, target hit
  COPY:       'COPY',          // Master/follower actions
  KILL:       'KILL_SWITCH',   // Kill switch toggle
  AUTH:       'AUTH',          // Login, logout
  CONSENT:    'CONSENT',       // Terms acceptance
  SYSTEM:     'SYSTEM',        // Server/scheduler events
};

class AuditLogger {
  /**
   * Write an audit log entry.
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} params.category  - Use CATEGORIES.*
   * @param {string} params.action    - e.g. 'CONNECTED', 'RISK_PASSED', 'ORDER_SENT'
   * @param {string} [params.detail]  - Human readable description
   * @param {Object} [params.meta]    - Additional data (order details, error, etc.)
   * @param {Object} [params.req]     - Express request (for IP extraction)
   * @param {string} [params.ip]      - IP address (if req not available)
   */
  static async log({ userId, category, action, detail, meta, req, ip }) {
    try {
      const ipAddress = ip || (req ? (
        req.headers['cf-connecting-ip'] ||
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.socket?.remoteAddress
      ) : null);

      await prisma.auditLog.create({
        data: {
          userId: userId || null,
          category: category || CATEGORIES.ALGO,
          action,
          detail: detail || null,
          meta: meta ? (typeof meta === 'string' ? meta : JSON.stringify(meta)) : null,
          ipAddress,
        },
      });
    } catch (err) {
      // Audit logging must never crash the main flow
      console.error('[AuditLogger] Failed to write log:', err.message);
    }
  }

  /**
   * Get audit logs for a user (paginated).
   */
  static async getLogs({ userId, category, limit = 50, offset = 0 }) {
    const where = { userId };
    if (category) where.category = category;
    return prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Get recent logs for admin (all users).
   */
  static async getAdminLogs({ category, limit = 100, offset = 0 }) {
    const where = {};
    if (category) where.category = category;
    return prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: offset,
    });
  }
}

module.exports = { AuditLogger, CATEGORIES };
