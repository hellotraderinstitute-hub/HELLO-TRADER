/**
 * Hello Trader — Client-Hosted Execution Agent (Phase 1 Runner)
 *
 * Standalone runner designed to run on the user's dedicated VPS or local machine.
 *
 * Phase 1 Capabilities:
 *   - Secure WebSocket tunnel connection using `pairingKey`.
 *   - 5-second Heartbeat loop (`agent:ping` -> `agent:pong`).
 *   - Responds to `AGENT_TEST_SIGNAL` simulation messages with ACK.
 *   - Auto-reconnect with exponential backoff.
 *   - Zero broker interaction in Phase 1 (Simulation & Handshake Only).
 */

const { io } = require('socket.io-client');
const EventEmitter = require('events');

class HelloTraderAgent extends EventEmitter {
  constructor(options = {}) {
    super();
    this.serverUrl = options.serverUrl || 'http://localhost:4000';
    this.pairingKey = options.pairingKey;
    this.publicIp = options.publicIp || null;
    this.version = options.version || '1.0.0';
    this.socket = null;
    this.heartbeatTimer = null;
    this.connected = false;
    this.lastLatencyMs = 0;
  }

  /**
   * Start the Agent Tunnel Connection
   */
  start() {
    if (!this.pairingKey) {
      throw new Error('[Agent] pairingKey is required to connect to Hello Trader Cloud Tunnel.');
    }

    const tunnelUrl = `${this.serverUrl}/agent-tunnel`;
    console.log(`[Agent] Connecting to Hello Trader Tunnel at: ${tunnelUrl}`);

    this.socket = io(tunnelUrl, {
      auth: {
        pairingKey: this.pairingKey,
        version: this.version,
        publicIp: this.publicIp,
      },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    this._setupEventHandlers();
    return this;
  }

  _setupEventHandlers() {
    // 1. Successful Connection Handshake
    this.socket.on('connect', () => {
      this.connected = true;
      console.log(`[Agent] 🟢 Tunnel Connected [Socket ID: ${this.socket.id}]`);
      this._startHeartbeat();
      this.emit('connected');
    });

    // 2. Server Connection Acknowledgement
    this.socket.on('agent:connected_ack', (data) => {
      console.log(`[Agent] Server ACK: ${data.message} (User ID: ${data.studentId})`);
      this.emit('ready', data);
    });

    // 3. Heartbeat Pong
    this.socket.on('agent:pong', (data) => {
      this.lastLatencyMs = data.latencyMs || 0;
      this.emit('pong', data);
    });

    // 4. Test / Simulation Signal Handler
    this.socket.on('agent:test_signal', (signal) => {
      console.log(`[Agent] 📨 Received TEST Simulation Signal: ${signal.signalId} (${signal.symbol} ${signal.action})`);

      // Respond with Immediate Acknowledgement
      this.socket.emit('agent:test_ack', {
        signalId: signal.signalId,
        status: 'ACKNOWLEDGED',
        dispatchedAt: signal.dispatchedAt,
        receivedAt: Date.now(),
        details: `Simulated trade for ${signal.quantity} qty ${signal.symbol} acknowledged by local runner.`,
      });

      this.emit('test_signal', signal);
    });

    // 4.5. Webhook Signal Handler (Phase 3 Simulation)
    this.socket.on('agent:signal', async (signal) => {
      console.log(`[Agent] ⚡ Received Webhook Signal: ${signal.signalId} (${signal.symbol} ${signal.action} x${signal.quantity})`);
      this.emit('signal', signal, (ackPayload) => {
        if (this.socket && this.socket.connected) {
          this.socket.emit('agent:signal_ack', {
            signalId: signal.signalId,
            dispatchedAt: signal.dispatchedAt,
            receivedAt: Date.now(),
            ...ackPayload,
          });
        }
      });
    });

    // 4.6. Risk Settings & Pause Management Events
    this.socket.on('agent:update_risk', (data) => {
      console.log(`[Agent] ⚙️ Received Risk Settings Update from Cloud Dashboard`);
      this.emit('update_risk', data);
    });

    this.socket.on('agent:pause_today', (data) => {
      console.log(`[Agent] ⏸️ Received PAUSE TRADING TODAY command: ${data?.reason || 'User paused'}`);
      this.emit('pause_today', data);
    });

    this.socket.on('agent:resume_today', () => {
      console.log(`[Agent] ▶️ Received RESUME TRADING command`);
      this.emit('resume_today');
    });

    // 5. Key Revocation Event
    this.socket.on('agent:revoked', (data) => {
      console.error(`[Agent] 🛑 Pairing Key Revoked: ${data.message}`);
      this.stop();
      this.emit('revoked', data);
    });

    // 6. Connect Error (e.g. Invalid Key)
    this.socket.on('connect_error', (err) => {
      console.error(`[Agent] ❌ Connection error: ${err.message}`);
      this.emit('error', err);
    });

    // 7. Disconnect Handler
    this.socket.on('disconnect', (reason) => {
      this.connected = false;
      this._stopHeartbeat();
      console.log(`[Agent] 🔴 Disconnected from tunnel [Reason: ${reason}]`);
      this.emit('disconnected', reason);
    });
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.socket && this.socket.connected) {
        this.socket.emit('agent:ping', { timestamp: Date.now() });
      }
    }, 5000);
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Stop the Agent Tunnel cleanly
   */
  stop() {
    this._stopHeartbeat();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.connected = false;
    console.log('[Agent] Stopped.');
    this.emit('stopped');
  }
}

module.exports = {
  HelloTraderAgent,
};
