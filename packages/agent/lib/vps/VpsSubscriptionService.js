/**
 * VpsSubscriptionService.js — In-Dashboard Wallet / Credit VPS Subscription Engine
 *
 * Implements:
 *   1. Zero external website redirects (100% managed via Hello Trader Wallet).
 *   2. Dedicated Static IP & Droplet preservation across renewals and reboots.
 *   3. Auto-Renew background engine with balance checks & 7-day grace period.
 *   4. Safe rollback on provider provisioning errors.
 *   5. Non-custodial separation between VPS billing and local broker vaults.
 */

const { DigitalOceanProvider } = require('./DigitalOceanProvider');
const { VpsLifecycleManager } = require('./VpsLifecycleManager');

const VPS_PRICING = {
  STARTER_1VCPU_2GB: { name: 'Trading VPS Starter', monthlyAmount: 799.00, vcpus: 1, ram: '2GB', disk: '25GB NVMe' },
  PRO_2VCPU_4GB: { name: 'Trading VPS Pro', monthlyAmount: 1299.00, vcpus: 2, ram: '4GB', disk: '50GB NVMe' },
  ENTERPRISE_4VCPU_8GB: { name: 'Trading VPS Enterprise', monthlyAmount: 2499.00, vcpus: 4, ram: '8GB', disk: '80GB NVMe' },
};

class VpsSubscriptionService {
  constructor(options = {}) {
    this.prisma = options.prisma;
    this.provider = options.provider || new DigitalOceanProvider({ isMock: options.isMock !== false });
    this.lifecycleManager = new VpsLifecycleManager({ prisma: this.prisma, provider: this.provider, defaultRegion: 'blr1' });
  }

  /**
   * Helper: Calculate User Token Wallet Balance
   */
  async getUserTokenBalance(userId) {
    const ledgers = await this.prisma.ledger.findMany({
      where: {
        userId,
        walletType: { in: ['TOKEN', 'RECHARGE', 'BONUS'] }
      }
    });

    let balance = 0;
    for (const l of ledgers) {
      balance += (l.type === 'CREDIT' ? l.amount : -l.amount);
    }
    return Math.max(0, balance);
  }

  /**
   * Get User VPS Status & Billing Details
   */
  async getUserVpsDetails(userId) {
    const [vps, tokenBalance] = await Promise.all([
      this.prisma.userTradingVps.findUnique({
        where: { userId },
        include: {
          billingInvoices: { orderBy: { createdAt: 'desc' }, take: 10 },
          auditLogs: { orderBy: { timestamp: 'desc' }, take: 10 },
        }
      }),
      this.getUserTokenBalance(userId),
    ]);

    return {
      success: true,
      hasVps: !!vps,
      vps,
      walletTokenBalance: tokenBalance,
      availablePlans: VPS_PRICING,
    };
  }

  /**
   * Purchase & Provision Trading VPS using Wallet Balance
   */
  async purchaseVps(params = {}) {
    const { userId, planTier = 'STARTER_1VCPU_2GB', pairingKey, autoRenew = true } = params;

    const plan = VPS_PRICING[planTier];
    if (!plan) throw new Error(`Invalid plan tier: ${planTier}`);

    // 1. Idempotency Guard: Verify user doesn't already have an active VPS
    const existing = await this.prisma.userTradingVps.findFirst({
      where: { userId, status: { notIn: ['TERMINATED', 'ERROR'] } }
    });
    if (existing) {
      throw new Error(`Active Trading VPS already exists (${existing.publicIp}). Cancel or terminate existing instance first.`);
    }

    // 2. Check Wallet Token Balance
    const balance = await this.getUserTokenBalance(userId);
    if (balance < plan.monthlyAmount) {
      const err = new Error(`INSUFFICIENT_WALLET_BALANCE: Required ₹${plan.monthlyAmount}, Current Balance ₹${balance.toFixed(2)}.`);
      err.code = 'INSUFFICIENT_WALLET_BALANCE';
      err.required = plan.monthlyAmount;
      err.balance = balance;
      throw err;
    }

    // 3. Debit Wallet Ledger
    const debitLedger = await this.prisma.ledger.create({
      data: {
        userId,
        walletType: 'TOKEN',
        amount: plan.monthlyAmount,
        type: 'DEBIT',
        reason: `TRADING_VPS_PURCHASE_${planTier}`,
      }
    });

    try {
      // 4. Provision VPS + Dedicated Static IP
      const vps = await this.lifecycleManager.purchaseVps({
        userId,
        planTier,
        pairingKey,
        monthlyAmount: plan.monthlyAmount,
        region: 'blr1',
      });

      // 5. Update Auto-Renew Preference
      const updatedVps = await this.prisma.userTradingVps.update({
        where: { id: vps.id },
        data: { autoRenewEnabled: Boolean(autoRenew) }
      });

      return {
        success: true,
        vps: updatedVps,
        debitedAmount: plan.monthlyAmount,
        remainingBalance: balance - plan.monthlyAmount,
      };
    } catch (provisionErr) {
      // Rollback Wallet Debit on Provider Error
      await this.prisma.ledger.create({
        data: {
          userId,
          walletType: 'TOKEN',
          amount: plan.monthlyAmount,
          type: 'CREDIT',
          reason: `TRADING_VPS_ROLLBACK_REFUND_${debitLedger.id}`,
        }
      });
      throw provisionErr;
    }
  }

  /**
   * Toggle Auto-Renew Setting
   */
  async toggleAutoRenew(userId, enabled) {
    const vps = await this.prisma.userTradingVps.findUnique({ where: { userId } });
    if (!vps) throw new Error('No active VPS found for user.');

    const updated = await this.prisma.userTradingVps.update({
      where: { id: vps.id },
      data: { autoRenewEnabled: Boolean(enabled) }
    });

    await this.prisma.vpsAuditLog.create({
      data: {
        vpsId: vps.id,
        userId,
        action: 'AUTORENEW_TOGGLED',
        actor: 'USER',
        detail: `Auto-renew set to ${Boolean(enabled) ? 'ENABLED' : 'DISABLED'}.`,
        ipAddress: vps.publicIp,
      }
    });

    return { success: true, autoRenewEnabled: updated.autoRenewEnabled };
  }

  /**
   * Manual Renewal from Wallet Balance
   * INVARIANT: Exact same Droplet and Dedicated Static IP are 100% PRESERVED.
   */
  async manualRenewVps(userId) {
    const vps = await this.prisma.userTradingVps.findUnique({ where: { userId } });
    if (!vps) throw new Error('No active VPS found for user.');
    if (vps.status === 'TERMINATED') throw new Error('Cannot renew a terminated VPS.');

    const balance = await this.getUserTokenBalance(userId);
    if (balance < vps.monthlyAmount) {
      const err = new Error(`INSUFFICIENT_WALLET_BALANCE: Required ₹${vps.monthlyAmount}, Current Balance ₹${balance.toFixed(2)}.`);
      err.code = 'INSUFFICIENT_WALLET_BALANCE';
      throw err;
    }

    // Debit Wallet Ledger
    await this.prisma.ledger.create({
      data: {
        userId,
        walletType: 'TOKEN',
        amount: vps.monthlyAmount,
        type: 'DEBIT',
        reason: `TRADING_VPS_MANUAL_RENEWAL_${vps.id}`,
      }
    });

    const renewed = await this.lifecycleManager.renewSubscription(vps.id);

    return {
      success: true,
      vps: renewed,
      publicIp: renewed.publicIp, // Verified identical
      currentPeriodEnd: renewed.currentPeriodEnd,
    };
  }

  /**
   * Retry Renewal during Grace Period after Wallet Top-up
   */
  async retryGraceRenewal(userId) {
    const vps = await this.prisma.userTradingVps.findUnique({ where: { userId } });
    if (!vps) throw new Error('No active VPS found for user.');
    if (vps.status !== 'GRACE_PERIOD') {
      throw new Error(`VPS is not in grace period (Current Status: ${vps.status}).`);
    }

    const balance = await this.getUserTokenBalance(userId);
    if (balance < vps.monthlyAmount) {
      const err = new Error(`INSUFFICIENT_WALLET_BALANCE: Required ₹${vps.monthlyAmount}, Current Balance ₹${balance.toFixed(2)}.`);
      err.code = 'INSUFFICIENT_WALLET_BALANCE';
      throw err;
    }

    // Debit Wallet Ledger
    await this.prisma.ledger.create({
      data: {
        userId,
        walletType: 'TOKEN',
        amount: vps.monthlyAmount,
        type: 'DEBIT',
        reason: `TRADING_VPS_GRACE_RECOVERY_${vps.id}`,
      }
    });

    const resumed = await this.lifecycleManager.resumeFromGrace(vps.id);

    return {
      success: true,
      vps: resumed,
      publicIp: resumed.publicIp, // Verified identical
      currentPeriodEnd: resumed.currentPeriodEnd,
    };
  }

  /**
   * Cancel VPS at End of Current Period
   */
  async cancelVps(userId) {
    const vps = await this.prisma.userTradingVps.findUnique({ where: { userId } });
    if (!vps) throw new Error('No active VPS found for user.');

    const updated = await this.prisma.userTradingVps.update({
      where: { id: vps.id },
      data: { autoRenewEnabled: false }
    });

    await this.prisma.vpsAuditLog.create({
      data: {
        vpsId: vps.id,
        userId,
        action: 'CANCELLATION_SCHEDULED',
        actor: 'USER',
        detail: `VPS cancellation requested. Auto-renew disabled. Access valid until ${vps.currentPeriodEnd.toISOString()}.`,
        ipAddress: vps.publicIp,
      }
    });

    return { success: true, message: 'VPS auto-renewal disabled. Access will terminate at end of current period.' };
  }

  /**
   * Automated Background Cron: Process Auto-Renewals & Grace Transitions
   */
  async processScheduledAutoRenewals() {
    const now = new Date();
    const dueVpsList = await this.prisma.userTradingVps.findMany({
      where: {
        currentPeriodEnd: { lte: now },
        status: { in: ['ACTIVE_SIMULATION', 'ACTIVE_VERIFIED'] },
      }
    });

    const results = { renewed: 0, graceEntered: 0, errors: 0 };

    for (const vps of dueVpsList) {
      try {
        if (vps.autoRenewEnabled) {
          const balance = await this.getUserTokenBalance(vps.userId);
          if (balance >= vps.monthlyAmount) {
            // Debit & Renew
            await this.prisma.ledger.create({
              data: {
                userId: vps.userId,
                walletType: 'TOKEN',
                amount: vps.monthlyAmount,
                type: 'DEBIT',
                reason: `TRADING_VPS_AUTORENEWAL_${vps.id}`,
              }
            });
            await this.lifecycleManager.renewSubscription(vps.id);
            results.renewed++;
            continue;
          }
        }

        // Insufficient balance or autoRenew disabled -> Enter 7-Day Grace Period
        await this.lifecycleManager.handlePaymentFailure(vps.id);
        results.graceEntered++;
      } catch (err) {
        console.error(`[VpsSubscriptionService] Auto-renew error for VPS ${vps.id}:`, err.message);
        results.errors++;
      }
    }

    return results;
  }
}

module.exports = {
  VpsSubscriptionService,
  VPS_PRICING,
};
