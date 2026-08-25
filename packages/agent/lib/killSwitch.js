/**
 * killSwitch.js — Local Hard Kill Switch for Client Execution Agent
 *
 * Emergency stop mechanism that immediately blocks all new orders.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const KILL_SWITCH_FILE = path.join(os.homedir(), '.hello-trader', 'kill_switch.state');

class LocalKillSwitch {
  constructor(stateFile = KILL_SWITCH_FILE) {
    this.stateFile = stateFile;
    this.isActive = this._readState();
  }

  _ensureDir() {
    const dir = path.dirname(this.stateFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }

  _readState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        const raw = fs.readFileSync(this.stateFile, 'utf8');
        const data = JSON.parse(raw);
        return !!data.isActive;
      }
    } catch (_) {}
    return false;
  }

  _writeState(isActive, reason = '') {
    this._ensureDir();
    const data = {
      isActive,
      reason,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(this.stateFile, JSON.stringify(data, null, 2), { mode: 0o600 });
    this.isActive = isActive;
  }

  /**
   * Activate the local Kill Switch (Stops all new orders)
   * @param {string} reason
   */
  activate(reason = 'MANUAL_CLI_KILL') {
    this._writeState(true, reason);
    console.log(`[KillSwitch] 🛑 LOCAL KILL SWITCH ACTIVATED: ${reason}`);
    return true;
  }

  /**
   * Deactivate the local Kill Switch
   */
  deactivate() {
    this._writeState(false, 'MANUAL_DEACTIVATION');
    console.log('[KillSwitch] 🟢 LOCAL KILL SWITCH DEACTIVATED. Trading resumed.');
    return true;
  }

  /**
   * Check if Kill Switch is currently active
   * @returns {boolean}
   */
  check() {
    return this.isActive;
  }
}

module.exports = {
  LocalKillSwitch,
};
