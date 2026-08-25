/**
 * deduplicator.js — Signal Deduplication & Replay Protection for Client Agent
 *
 * Prevents duplicate orders, stale signals, and replay attacks.
 */

const crypto = require('crypto');

class SignalDeduplicator {
  constructor(options = {}) {
    this.maxDriftSeconds = options.maxDriftSeconds || 5.0; // Configurable latency drift threshold
    this.dedupWindowMs = options.dedupWindowMs || 5000;
    this.processedSignals = new Map(); // hash -> timestamp
    this.processedSignalIds = new Set();
  }

  /**
   * Compute fingerprint for signal
   * @param {object} signal
   * @returns {string}
   */
  _computeFingerprint(signal) {
    const raw = `${signal.signalId || ''}:${signal.symbol || ''}:${signal.action || ''}:${signal.quantity || ''}:${Math.floor(Date.now() / this.dedupWindowMs)}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Clean up expired entries in memory
   */
  _cleanExpired() {
    const now = Date.now();
    for (const [hash, ts] of this.processedSignals.entries()) {
      if (now - ts > this.dedupWindowMs * 2) {
        this.processedSignals.delete(hash);
      }
    }
    if (this.processedSignalIds.size > 500) {
      this.processedSignalIds.clear();
    }
  }

  /**
   * Validate signal for duplicates and latency drift
   * @param {object} signal
   * @returns {{ valid: boolean, reason?: string }}
   */
  validate(signal) {
    this._cleanExpired();

    // 1. Unique Signal ID Check
    if (signal.signalId && this.processedSignalIds.has(signal.signalId)) {
      return { valid: false, reason: `DUPLICATE_SIGNAL_ID: Signal ${signal.signalId} was already processed.` };
    }

    // 2. Timestamp Drift / Stale Signal Check
    const signalTime = new Date(signal.timestamp || signal.dispatchedAt || Date.now()).getTime();
    const driftSeconds = (Date.now() - signalTime) / 1000;

    if (driftSeconds > this.maxDriftSeconds) {
      return { valid: false, reason: `STALE_SIGNAL_DRIFT: Signal latency drift of ${driftSeconds.toFixed(2)}s exceeds max ${this.maxDriftSeconds}s.` };
    }

    // 3. Payload Fingerprint Check
    const fp = this._computeFingerprint(signal);
    if (this.processedSignals.has(fp)) {
      return { valid: false, reason: 'DUPLICATE_PAYLOAD_WITHIN_WINDOW: Identical signal received within deduplication window.' };
    }

    // Record as processed
    if (signal.signalId) this.processedSignalIds.add(signal.signalId);
    this.processedSignals.set(fp, Date.now());

    return { valid: true };
  }
}

module.exports = {
  SignalDeduplicator,
};
