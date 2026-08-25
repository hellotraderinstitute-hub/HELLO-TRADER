#!/usr/bin/env node
/**
 * ht-agent.js — Hello Trader Client Execution Agent CLI
 */

const { program } = require('commander');
const readline = require('readline');
const { CredentialVault } = require('../lib/vault');
const { LocalKillSwitch } = require('../lib/killSwitch');
const { AgentCoreEngine } = require('../lib/agentCore');

const vault = new CredentialVault();
const killSwitch = new LocalKillSwitch();

function askQuestion(query, hidden = false) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise(resolve => {
    rl.question(query, ans => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

program
  .name('ht-agent')
  .description('Hello Trader Client-Hosted Execution Agent CLI')
  .version('1.0.0');

// ── ht-agent configure ───────────────────────────────────────────────
program
  .command('configure')
  .description('Initialize or update local encrypted vault and pairing key')
  .action(async () => {
    console.log('\n🔐 Hello Trader Client Agent — Local Configuration Wizard');
    console.log('---------------------------------------------------------');

    const masterPass = await askQuestion('Enter Master Passphrase (min 6 chars): ');
    if (!masterPass || masterPass.length < 6) {
      console.error('❌ Passphrase too short.');
      process.exit(1);
    }

    const pairingKey = await askQuestion('Enter Cloud Pairing Key (ht_agent_live_...): ');
    const serverUrl = await askQuestion('Enter Cloud Server URL [http://localhost:4000]: ') || 'http://localhost:4000';

    const initialData = {
      pairingKey,
      serverUrl,
      configuredAt: new Date().toISOString(),
      brokers: {},
    };

    vault.init(masterPass, initialData);
    console.log('✅ Local Vault encrypted and initialized at: ~/.hello-trader/vault.enc\n');
  });

// ── ht-agent status ──────────────────────────────────────────────────
program
  .command('status')
  .description('Check local agent status, vault state, and kill switch')
  .action(async () => {
    console.log('\n📊 Hello Trader Agent Status');
    console.log('---------------------------------------------------------');
    console.log(`Vault Exists:      ${vault.exists() ? '✅ YES' : '❌ NO'}`);
    console.log(`Kill Switch State: ${killSwitch.check() ? '🛑 ACTIVE (BLOCKED)' : '🟢 INACTIVE (ONLINE)'}`);
    console.log('');
  });

// ── ht-agent kill ────────────────────────────────────────────────────
program
  .command('kill')
  .description('Activate local emergency kill switch to stop all new orders')
  .action(async () => {
    killSwitch.activate('MANUAL_CLI_KILL');
    console.log('🛑 Local Emergency Kill Switch ACTIVATED. All new orders will be blocked locally.');
  });

// ── ht-agent unkill ──────────────────────────────────────────────────
program
  .command('unkill')
  .description('Deactivate local emergency kill switch')
  .action(async () => {
    killSwitch.deactivate();
    console.log('🟢 Local Emergency Kill Switch DEACTIVATED.');
  });

// ── ht-agent broker list ─────────────────────────────────────────────
program
  .command('broker list')
  .description('List configured brokers in local vault')
  .action(async () => {
    const masterPass = await askQuestion('Enter Master Passphrase: ');
    try {
      vault.unlock(masterPass);
      const list = vault.listConfiguredBrokers();
      console.log('\n💼 Configured Brokers:');
      console.table(list);
    } catch (err) {
      console.error(`❌ ${err.message}`);
    }
  });

// ── ht-agent broker connect <broker> ─────────────────────────────────
program
  .command('broker connect <broker>')
  .description('Configure credentials for a broker (DHAN | ANGELONE | GOPOCKET)')
  .action(async (broker) => {
    const b = broker.toUpperCase();
    const masterPass = await askQuestion('Enter Master Passphrase: ');

    try {
      vault.unlock(masterPass);
      console.log(`\nConnecting broker: ${b}`);

      let creds = {};
      if (b === 'DHAN') {
        const clientId = await askQuestion('Dhan Client ID: ');
        const accessToken = await askQuestion('Dhan 24h Access Token: ');
        creds = { clientId, accessToken };
      } else if (b === 'ANGELONE') {
        const clientId = await askQuestion('Angel One Client ID: ');
        const apiKey = await askQuestion('Angel One SmartAPI Key: ');
        const password = await askQuestion('Angel One Password / PIN: ');
        const totpSecret = await askQuestion('Angel One TOTP Secret (Base32): ');
        creds = { clientId, apiKey, password, totpSecret };
      } else if (b === 'GOPOCKET') {
        const clientId = await askQuestion('GoPocket Client ID: ');
        const appCode = await askQuestion('GoPocket App Code: ');
        const apiSecret = await askQuestion('GoPocket API Secret: ');
        const authCode = await askQuestion('GoPocket Auth Code: ');
        creds = { clientId, appCode, apiSecret, authCode };
      } else {
        console.error(`❌ Unsupported broker: ${b}`);
        process.exit(1);
      }

      vault.setBrokerCredentials(masterPass, b, creds);
      console.log(`✅ ${b} credentials encrypted and stored in local vault.\n`);
    } catch (err) {
      console.error(`❌ ${err.message}`);
    }
  });

// ── ht-agent start ───────────────────────────────────────────────────
program
  .command('start')
  .description('Start the Client Execution Agent daemon')
  .action(async () => {
    const masterPass = await askQuestion('Enter Master Passphrase: ');
    try {
      const data = vault.unlock(masterPass);
      console.log('✅ Vault unlocked.');

      const engine = new AgentCoreEngine({
        serverUrl: data.serverUrl,
        pairingKey: data.pairingKey,
        masterPassphrase: masterPass,
        activeBroker: Object.keys(data.brokers || {})[0] || 'DHAN',
        isMock: true,
      });

      console.log('🚀 Starting Hello Trader Execution Agent Tunnel...');
      engine.startTunnel();

      process.on('SIGINT', () => {
        console.log('\nShutting down agent...');
        engine.stop();
        process.exit(0);
      });
    } catch (err) {
      console.error(`❌ ${err.message}`);
    }
  });

program.parse(process.argv);
