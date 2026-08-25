/**
 * daemon.js — Production Client Execution Agent Daemon Service
 *
 * Runs as a PM2-managed process (hello-trader-agent) on the VPS:
 *   - Auto-provisions / retrieves active Agent Pairing Key for the pilot client (HT0802).
 *   - Probes public egress IP (or binds verified static IP 151.245.182.52).
 *   - Connects to local Hello Trader WebSocket Tunnel (http://localhost:4000/agent-tunnel).
 *   - Sends authenticated heartbeat pings every 5 seconds.
 *   - Listens for simulation test signals and webhook signals locally.
 *   - Zero real broker orders (simulation/safe execution only).
 */

const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables from backend/.env
const possibleEnvPaths = [
  path.join(__dirname, '../../backend/.env'),
  path.join(__dirname, '../backend/.env'),
  path.join(process.cwd(), 'backend/.env'),
  path.join(process.cwd(), '.env'),
];

for (const p of possibleEnvPaths) {
  if (fs.existsSync(p)) {
    const envConfig = dotenv.parse(fs.readFileSync(p));
    for (const k in envConfig) {
      if (!process.env[k]) process.env[k] = envConfig[k];
    }
    break;
  }
}

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('C:') || process.env.DATABASE_URL.startsWith('prisma://')) {
  process.env.DATABASE_URL = 'file:/var/www/hello-trader/backend/prisma/backend.db';
}

let prismaClientPath = '@prisma/client';
try {
  const backendPrisma = path.join(__dirname, '../../backend/node_modules/@prisma/client');
  if (fs.existsSync(backendPrisma)) prismaClientPath = backendPrisma;
} catch (_) {}

const { PrismaClient } = require(prismaClientPath);
const { HelloTraderAgent } = require('./client');
const { PILOT_AUTHORIZED_CLIENT } = require('./lib/compliance/ControlledLivePilotGate');

const dbUrl = process.env.DATABASE_URL || 'file:/var/www/hello-trader/backend/prisma/backend.db';
const prisma = new PrismaClient({
  datasources: {
    db: { url: dbUrl }
  }
});

async function getOrProvisionPilotAgentKey(userId) {
  // 1. Check for existing ACTIVE key
  let activeKey = await prisma.agentKey.findFirst({
    where: { userId, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' }
  });

  // If a key already exists, but we don't have the plaintext, we can generate a known persistent key for the daemon
  // or generate a new active key if none exists.
  const rawKey = `ht_agent_live_pilot_${crypto.createHash('sha256').update(`${userId}_hello_trader_pilot_secret`).digest('hex').slice(0, 32)}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = `${rawKey.slice(0, 18)}...`;

  const existingByHash = await prisma.agentKey.findUnique({
    where: { keyHash }
  });

  if (!existingByHash) {
    activeKey = await prisma.agentKey.create({
      data: {
        userId,
        keyHash,
        keyPrefix,
        label: 'Production VPS Pilot Agent Daemon (HT0802)',
        status: 'ACTIVE',
      }
    });
    console.log(`[AgentDaemon] Created new AgentKey for pilot user (${keyPrefix})`);
  } else if (existingByHash.status !== 'ACTIVE') {
    activeKey = await prisma.agentKey.update({
      where: { id: existingByHash.id },
      data: { status: 'ACTIVE' }
    });
  }

  return rawKey;
}

async function resolvePublicIp(userId) {
  // 1. Check verified static IP assignment
  try {
    const assignment = await prisma.clientStaticIpAssignment.findFirst({
      where: { userId, status: 'VERIFIED' }
    });
    if (assignment?.ipAddress) {
      return assignment.ipAddress;
    }
  } catch (_) {}

  // 2. Fallback: probe public egress IP
  try {
    const res = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
    if (res.data?.ip) {
      return res.data.ip;
    }
  } catch (_) {}

  return PILOT_AUTHORIZED_CLIENT.expectedProxyEgressIp || '151.245.182.52';
}

async function startAgentDaemon() {
  console.log('================================================================');
  console.log('🚀 HELLO TRADER CLIENT EXECUTION AGENT DAEMON');
  console.log('================================================================\n');

  try {
    // 1. Locate pilot user HT0802
    const user = await prisma.user.findFirst({
      where: { email: PILOT_AUTHORIZED_CLIENT.email }
    });

    if (!user) {
      console.error(`[AgentDaemon] ❌ Pilot user ${PILOT_AUTHORIZED_CLIENT.email} not found in database.`);
      process.exit(1);
    }

    console.log(`[AgentDaemon] Target Pilot Client: ${user.name} (${user.studentId})`);

    // 2. Resolve or provision pairing key
    const pairingKey = await getOrProvisionPilotAgentKey(user.id);

    // 3. Resolve public egress IP
    const publicIp = await resolvePublicIp(user.id);
    console.log(`[AgentDaemon] Egress Public IP Bound: ${publicIp}`);

    // 4. Start agent tunnel client
    const serverUrl = process.env.BACKEND_URL || 'http://localhost:4000';
    const agent = new HelloTraderAgent({
      serverUrl,
      pairingKey,
      publicIp,
      version: 'v1.0.0',
    });

    agent.on('connected', () => {
      console.log(`[AgentDaemon] 🟢 Agent Tunnel Connected to ${serverUrl}/agent-tunnel`);
    });

    agent.on('ready', (data) => {
      console.log(`[AgentDaemon] 🟢 Agent Ready & Handshake Verified for ${data.studentId}`);
    });

    agent.on('pong', (data) => {
      // Heartbeat success log every 30s
      if (Math.random() < 0.1) {
        console.log(`[AgentDaemon] 💓 Heartbeat ACK: Latency ${data.latencyMs}ms | Public IP: ${publicIp}`);
      }
    });

    agent.on('disconnected', (reason) => {
      console.warn(`[AgentDaemon] ⚠️ Disconnected from tunnel: ${reason}`);
    });

    agent.on('error', (err) => {
      console.error(`[AgentDaemon] ❌ Agent error: ${err.message}`);
    });

    agent.start();

    // Keep process alive
    process.on('SIGINT', () => {
      console.log('[AgentDaemon] Stopping agent daemon...');
      agent.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('[AgentDaemon] Stopping agent daemon...');
      agent.stop();
      process.exit(0);
    });
  } catch (err) {
    console.error('[AgentDaemon] Fatal startup error:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  startAgentDaemon();
}

module.exports = {
  startAgentDaemon,
  getOrProvisionPilotAgentKey,
  resolvePublicIp,
};
