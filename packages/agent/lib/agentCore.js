/**
 * agentCore.js — Client-Hosted Execution Agent Core Engine
 *
 * Coordinates Local Vault, Risk Engine, Deduplicator, Kill Switch, and Broker Adapters.
 */

const EventEmitter = require('events');
const { CredentialVault } = require('./vault');
const { LocalRiskEngine } = require('./riskEngine');
const { SignalDeduplicator } = require('./deduplicator');
const { LocalKillSwitch } = require('./killSwitch');
const { BrokerCompliancePolicyEngine } = require('./compliance/brokerPolicyEngine');
const DhanAdapter = require('./adapters/DhanAdapter');
const AngelOneAdapter = require('./adapters/AngelOneAdapter');
const GoPocketAdapter = require('./adapters/GoPocketAdapter');
const { HelloTraderAgent } = require('../client');

class AgentCoreEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.serverUrl = options.serverUrl || 'http://localhost:4000';
    this.pairingKey = options.pairingKey || null;
    this.masterPassphrase = options.masterPassphrase || null;
    this.activeBroker = options.activeBroker || 'DHAN';
    this.isMock = options.isMock !== undefined ? options.isMock : true; // Default MOCK in Phase 2

    this.vault = new CredentialVault(options.vaultPath);
    this.riskEngine = new LocalRiskEngine(options.riskConfig || {});
    this.deduplicator = new SignalDeduplicator(options.dedupConfig || {});
    this.killSwitch = new LocalKillSwitch(options.killSwitchPath);
    this.complianceEngine = new BrokerCompliancePolicyEngine(options.complianceConfig || {});
    this.adapter = null;
    this.tunnel = null;
  }

  /**
   * Initialize and unlock local vault
   * @param {string} passphrase
   */
  unlockVault(passphrase) {
    this.masterPassphrase = passphrase;
    return this.vault.unlock(passphrase);
  }

  /**
   * Instantiate and connect the active broker adapter
   * @param {string} brokerKey
   */
  async initBrokerAdapter(brokerKey = this.activeBroker) {
    this.activeBroker = brokerKey.toUpperCase();
    let creds = {};

    if (this.vault.isUnlocked) {
      creds = this.vault.getBrokerCredentials(this.activeBroker) || {};
    }

    const adapterOptions = {
      isMock: this.isMock,
      publicIp: '127.0.0.1',
    };

    switch (this.activeBroker) {
      case 'DHAN':
        this.adapter = new DhanAdapter(creds, adapterOptions);
        break;
      case 'ANGELONE':
        this.adapter = new AngelOneAdapter(creds, adapterOptions);
        break;
      case 'GOPOCKET':
        this.adapter = new GoPocketAdapter(creds, adapterOptions);
        break;
      default:
        throw new Error(`Unsupported broker: ${this.activeBroker}`);
    }

    const connectResult = await this.adapter.connect();
    return connectResult;
  }

  /**
   * Start Agent Tunnel and listen for incoming signals
   */
  startTunnel() {
    if (!this.pairingKey) {
      throw new Error('Pairing key is required to start tunnel.');
    }

    this.tunnel = new HelloTraderAgent({
      serverUrl: this.serverUrl,
      pairingKey: this.pairingKey,
      version: '1.0.0',
    });

    this.tunnel.on('test_signal', async (signal) => {
      await this.processSignal(signal);
    });

    this.tunnel.on('signal', async (signal, ackCallback) => {
      this.emit('signal', signal);
      const result = await this.processSignal(signal);
      if (typeof ackCallback === 'function') {
        ackCallback(result);
      }
    });

    this.tunnel.on('update_risk', (settings) => {
      this.riskEngine.updateSettings(settings);
    });

    this.tunnel.on('pause_today', (data) => {
      this.riskEngine.pauseTradingToday(data?.reason);
    });

    this.tunnel.on('resume_today', () => {
      this.riskEngine.resumeTrading();
    });

    this.tunnel.start();
    return this.tunnel;
  }

  /**
   * Process incoming signal through local safety pipeline
   * @param {object} signal
   */
  async processSignal(signal) {
    const startMs = Date.now();

    // 1. Deduplication & Latency Drift Check
    const dedupResult = this.deduplicator.validate(signal);
    if (!dedupResult.valid) {
      console.warn(`[AgentCore] ⚠️ Signal ${signal.signalId} rejected by deduplicator: ${dedupResult.reason}`);
      return {
        success: false,
        status: 'DEDUP_REJECTED',
        reason: dedupResult.reason,
        signalId: signal.signalId,
      };
    }

    // 2. Local Pre-Trade Risk Engine Validation
    const riskResult = this.riskEngine.validate(signal, {
      broker: this.activeBroker,
      isKillSwitchActive: this.killSwitch.check(),
    });

    if (!riskResult.allowed) {
      console.warn(`[AgentCore] ⚠️ Signal ${signal.signalId} rejected by local risk engine: ${riskResult.reason}`);
      return {
        success: false,
        status: 'RISK_REJECTED',
        reason: riskResult.reason,
        signalId: signal.signalId,
      };
    }

    // 2.5. Broker Compliance & Routing Policy Check
    const complianceResult = this.complianceEngine.evaluateOrder(signal, {
      broker: this.activeBroker,
      isSimulation: this.isMock,
    });

    if (!complianceResult.allowed) {
      console.warn(`[AgentCore] ⚠️ Signal ${signal.signalId} rejected by compliance policy: ${complianceResult.reason}`);
      return {
        success: false,
        status: 'COMPLIANCE_REJECTED',
        reason: complianceResult.reason,
        signalId: signal.signalId,
      };
    }

    // 3. Dispatch to Local Broker Adapter (Mock in Phase 2/3/4/5)
    if (!this.adapter) {
      await this.initBrokerAdapter(this.activeBroker);
    }

    const orderResult = await this.adapter.placeOrder(signal);
    const latencyMs = Date.now() - startMs;

    console.log(`[AgentCore] ✅ Order processed locally: ${orderResult.orderId || 'MOCK'} (${orderResult.status}, Latency: ${latencyMs}ms)`);

    // 4. Return Normalized Execution Result (WITHOUT any secrets)
    return {
      success: orderResult.success,
      signalId: signal.signalId,
      orderId: orderResult.orderId,
      status: orderResult.status,
      broker: this.activeBroker,
      latencyMs,
      message: orderResult.message,
    };
  }

  /**
   * Stop Agent cleanly
   */
  stop() {
    if (this.tunnel) {
      this.tunnel.stop();
      this.tunnel = null;
    }
    if (this.vault) {
      this.vault.lock();
    }
  }
}

module.exports = {
  AgentCoreEngine,
};
