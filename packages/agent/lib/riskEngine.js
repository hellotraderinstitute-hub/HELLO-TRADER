/**
 * riskEngine.js — User-Controlled Local Pre-Trade Risk Engine
 *
 * Enforces pre-trade risk controls LOCALLY on the client machine before dispatching to broker adapters:
 *   1. User-Controlled Daily Profit Target (Blocks new orders on target reached).
 *   2. User-Controlled Daily Max Loss (Blocks new orders on max loss reached).
 *   3. Pause Trading Today (Instant user-controlled pause with resume & auto-day reset).
 *   4. Per-Trade Target Evaluation (Independent per-trade exit trigger).
 *   5. Square-off on daily limit flag (Default OFF, preserves open positions).
 *   6. Kill Switch, Position, Quantity, and Order Value Limits.
 */

function getISTDateString() {
  const d = new Date();
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  const istTime = new Date(utc + (3600000 * 5.5));
  return istTime.toISOString().slice(0, 10);
}

class LocalRiskEngine {
  constructor(config = {}) {
    this.config = {
      // Daily Profit Target
      dailyProfitTargetEnabled: config.dailyProfitTargetEnabled || false,
      dailyProfitTarget: Number(config.dailyProfitTarget) || 5000,

      // Daily Max Loss
      dailyMaxLossEnabled: config.dailyMaxLossEnabled !== undefined ? config.dailyMaxLossEnabled : true,
      dailyMaxLoss: Number(config.dailyMaxLoss !== undefined ? config.dailyMaxLoss : (config.maxDailyLoss !== undefined ? config.maxDailyLoss : 10000)),
      maxDailyLoss: Number(config.dailyMaxLoss !== undefined ? config.dailyMaxLoss : (config.maxDailyLoss !== undefined ? config.maxDailyLoss : 10000)),

      // Pause Trading Today
      isPausedToday: config.isPausedToday || false,
      pauseReason: config.pauseReason || 'USER_PAUSED_TODAY',

      // Position Management
      squareOffOnDailyLimitEnabled: config.squareOffOnDailyLimitEnabled || false,
      perTradeTargetEnabled: config.perTradeTargetEnabled || false,
      perTradeTarget: Number(config.perTradeTarget) || 500,

      // Core Limits
      maxOpenPositions: config.maxOpenPositions || 5,
      maxQuantityPerOrder: config.maxQuantityPerOrder || 1800,
      maxOrderValue: config.maxOrderValue || 200000,
      allowedSymbols: config.allowedSymbols || ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX'],
      allowedBrokers: config.allowedBrokers || ['DHAN', 'ANGELONE', 'GOPOCKET'],
      tradingHoursStart: config.tradingHoursStart || '09:15',
      tradingHoursEnd: config.tradingHoursEnd || '15:25',
      ...config,
    };

    // State tracking
    this.stateDateStr = config.stateDateStr || getISTDateString();
    this.currentDailyRealizedPnl = Number(config.currentDailyRealizedPnl) || 0;
    this.currentDailyLoss = Number(config.currentDailyLoss) || 0;
    this.openPositionsCount = Number(config.openPositionsCount) || 0;
  }

  /**
   * Reset daily state if calendar date has changed in IST
   */
  checkAndResetDay() {
    const today = getISTDateString();
    if (this.stateDateStr !== today) {
      this.stateDateStr = today;
      this.currentDailyRealizedPnl = 0;
      this.currentDailyLoss = 0;
      this.config.isPausedToday = false;
      this.config.pauseReason = null;
      return true; // Reset occurred
    }
    return false;
  }

  /**
   * Update full Risk Settings
   * @param {object} newSettings
   */
  updateSettings(newSettings = {}) {
    this.checkAndResetDay();
    this.config = {
      ...this.config,
      ...newSettings,
    };
  }

  /**
   * Pause Trading For Today
   * @param {string} reason
   */
  pauseTradingToday(reason = 'USER_PAUSED_TODAY') {
    this.checkAndResetDay();
    this.config.isPausedToday = true;
    this.config.pauseReason = reason;
  }

  /**
   * Resume Trading
   */
  resumeTrading() {
    this.checkAndResetDay();
    this.config.isPausedToday = false;
    this.config.pauseReason = null;
  }

  /**
   * Update realized P&L for today
   * @param {number} pnl - Realized profit (positive) or loss (negative)
   */
  setDailyRealizedPnl(pnl) {
    this.checkAndResetDay();
    this.currentDailyRealizedPnl = Number(pnl) || 0;
    if (this.currentDailyRealizedPnl < 0) {
      this.currentDailyLoss = Math.abs(this.currentDailyRealizedPnl);
    } else {
      this.currentDailyLoss = 0;
    }
  }

  /**
   * Update legacy daily loss
   * @param {number} loss
   */
  setDailyLoss(loss) {
    this.checkAndResetDay();
    this.currentDailyLoss = Number(loss) || 0;
    this.currentDailyRealizedPnl = -this.currentDailyLoss;
  }

  /**
   * Update open positions count
   * @param {number} count
   */
  setOpenPositionsCount(count) {
    this.openPositionsCount = Number(count) || 0;
  }

  /**
   * Check if a specific open trade has reached its per-trade target
   * @param {object} trade - { unrealizedPnl: number, symbol: string }
   * @returns {{ shouldClose: boolean, target: number, currentProfit: number, reason?: string }}
   */
  evaluatePerTradeTarget(trade = {}) {
    if (!this.config.perTradeTargetEnabled) {
      return { shouldClose: false };
    }
    const profit = Number(trade.unrealizedPnl || trade.pnl || 0);
    const target = Number(this.config.perTradeTarget) || 0;
    if (target > 0 && profit >= target) {
      return {
        shouldClose: true,
        target,
        currentProfit: profit,
        reason: `PER_TRADE_TARGET_REACHED: Profit ₹${profit.toFixed(2)} reached target ₹${target}. Closing single trade.`
      };
    }
    return { shouldClose: false, target, currentProfit: profit };
  }

  /**
   * Evaluate if Daily Profit Target or Daily Max Loss is reached.
   * If reached: marks trading as paused for today and mandates automatic square-off of open positions.
   * @param {Array<object>} openPositions - List of current open positions
   * @returns {{ limitHit: boolean, limitType: string|null, shouldSquareOff: boolean, reason: string|null, positionsToClose: Array<object> }}
   */
  evaluateDailyLimitsAndSquareOff(openPositions = []) {
    this.checkAndResetDay();

    // 1. Daily Profit Target
    if (this.config.dailyProfitTargetEnabled) {
      const target = Number(this.config.dailyProfitTarget) || 0;
      if (target > 0 && this.currentDailyRealizedPnl >= target) {
        this.pauseTradingToday('DAILY_PROFIT_TARGET_REACHED');
        return {
          limitHit: true,
          limitType: 'DAILY_PROFIT_TARGET_REACHED',
          shouldSquareOff: true,
          reason: `DAILY_PROFIT_TARGET_REACHED: Daily realized profit ₹${this.currentDailyRealizedPnl.toFixed(2)} reached configured target ₹${target}. All open positions squared off & trading paused for today.`,
          positionsToClose: (openPositions || []).filter(p => p && (p.status === 'OPEN' || !p.status)),
        };
      }
    }

    // 2. Daily Max Loss
    if (this.config.dailyMaxLossEnabled) {
      const maxLoss = Number(this.config.dailyMaxLoss) || 0;
      const effectiveLoss = this.currentDailyRealizedPnl < 0 ? Math.abs(this.currentDailyRealizedPnl) : this.currentDailyLoss;
      if (maxLoss > 0 && effectiveLoss >= maxLoss) {
        this.pauseTradingToday('DAILY_MAX_LOSS_REACHED');
        return {
          limitHit: true,
          limitType: 'DAILY_MAX_LOSS_REACHED',
          shouldSquareOff: true,
          reason: `DAILY_MAX_LOSS_REACHED: Daily loss ₹${effectiveLoss.toFixed(2)} reached configured limit ₹${maxLoss}. All open positions squared off & trading paused for today.`,
          positionsToClose: (openPositions || []).filter(p => p && (p.status === 'OPEN' || !p.status)),
        };
      }
    }

    return {
      limitHit: false,
      limitType: null,
      shouldSquareOff: false,
      reason: null,
      positionsToClose: [],
    };
  }

  /**
   * Validate order against local pre-trade risk controls
   * @param {object} order
   * @param {object} context - { broker, isKillSwitchActive }
   * @returns {{ allowed: boolean, reason?: string, state?: object }}
   */
  validate(order, context = {}) {
    this.checkAndResetDay();

    // 1. Kill Switch Check
    if (context.isKillSwitchActive) {
      return { allowed: false, reason: 'LOCAL_KILL_SWITCH_ACTIVE: Trading is stopped locally.' };
    }

    // 2. User Pause Trading Today Check
    if (this.config.isPausedToday) {
      return {
        allowed: false,
        reason: `USER_PAUSED_TODAY: Trading is paused for today (${this.config.pauseReason || 'User paused'}). Resume in dashboard to allow new trades.`
      };
    }

    // 3. Daily Profit Target Check
    if (this.config.dailyProfitTargetEnabled) {
      const target = Number(this.config.dailyProfitTarget) || 0;
      if (target > 0 && this.currentDailyRealizedPnl >= target) {
        return {
          allowed: false,
          reason: `DAILY_PROFIT_TARGET_REACHED: Realized profit ₹${this.currentDailyRealizedPnl.toFixed(2)} reached target ₹${target}. New trades blocked for today.`
        };
      }
    }

    // 4. Daily Max Loss Limit Check
    if (this.config.dailyMaxLossEnabled) {
      const maxLoss = Number(this.config.dailyMaxLoss) || 0;
      const effectiveLoss = this.currentDailyRealizedPnl < 0 ? Math.abs(this.currentDailyRealizedPnl) : this.currentDailyLoss;
      if (maxLoss > 0 && effectiveLoss >= maxLoss) {
        return {
          allowed: false,
          reason: `DAILY_MAX_LOSS_REACHED (MAX_DAILY_LOSS_EXCEEDED): Daily loss ₹${effectiveLoss.toFixed(2)} reached limit ₹${maxLoss}. New trades blocked for today.`
        };
      }
    }

    // 5. Broker Whitelist Check
    const broker = (context.broker || order.broker || '').toUpperCase();
    if (broker && !this.config.allowedBrokers.includes(broker)) {
      return { allowed: false, reason: `BROKER_NOT_ALLOWED: Broker ${broker} is not in local whitelist.` };
    }

    // 6. Max Open Positions Check
    if (this.openPositionsCount >= this.config.maxOpenPositions) {
      return { allowed: false, reason: `MAX_OPEN_POSITIONS_REACHED: Open positions ${this.openPositionsCount} >= Limit ${this.config.maxOpenPositions}.` };
    }

    // 7. Max Quantity Per Order Check
    const qty = Number(order.quantity || 0);
    if (qty <= 0) {
      return { allowed: false, reason: 'INVALID_QUANTITY: Quantity must be greater than zero.' };
    }
    if (qty > this.config.maxQuantityPerOrder) {
      return { allowed: false, reason: `EXCESSIVE_QUANTITY: Quantity ${qty} exceeds max limit ${this.config.maxQuantityPerOrder}.` };
    }

    // 8. Max Order Value Check
    const price = Number(order.price || order.ltp || 0);
    const orderValue = price > 0 ? (price * qty) : 0;
    if (orderValue > this.config.maxOrderValue) {
      return { allowed: false, reason: `EXCESSIVE_ORDER_VALUE: Estimated value ₹${orderValue.toFixed(2)} exceeds limit ₹${this.config.maxOrderValue}.` };
    }

    // 9. Transaction Type Check
    const side = (order.side || order.action || '').toUpperCase();
    if (!['BUY', 'SELL', 'EXIT'].includes(side)) {
      return { allowed: false, reason: `INVALID_TRANSACTION_TYPE: ${side} is not supported.` };
    }

    return {
      allowed: true,
      reason: 'PRE_TRADE_RISK_PASSED',
      state: {
        currentDailyRealizedPnl: this.currentDailyRealizedPnl,
        isPausedToday: this.config.isPausedToday,
        dailyProfitTargetEnabled: this.config.dailyProfitTargetEnabled,
        dailyMaxLossEnabled: this.config.dailyMaxLossEnabled,
      }
    };
  }
}

module.exports = {
  LocalRiskEngine,
  getISTDateString,
};
