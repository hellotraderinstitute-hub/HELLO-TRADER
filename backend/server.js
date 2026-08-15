const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Ensure DATABASE_URL is valid SQLite path (Linux Render vs Windows Dev vs Prisma Accelerate)
if (
  !process.env.DATABASE_URL ||
  process.env.DATABASE_URL.includes('C:') ||
  process.env.DATABASE_URL.startsWith('prisma://')
) {
  process.env.DATABASE_URL = 'file:./backend.db';
}

// Safely ensure SQLite DB schema is pushed without crashing startCommand
try {
  const { execSync } = require('child_process');
  execSync('npx prisma db push --schema=backend/prisma/schema.prisma --accept-data-loss', { stdio: 'ignore' });
  console.log('[Server] SQLite Database schema synced successfully.');
} catch (dbSyncErr) {
  console.log('[Server] SQLite DB sync notice:', dbSyncErr.message);
}

const corsOptions = {
  origin: true, // Allow all origins (Cloudflare tunnel compatible)
  credentials: true
};

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, methods: ['GET', 'POST'], credentials: true }
});

const DhanStreamer = require('./dhanStreamer');
const dhanStreamer = new DhanStreamer(io);
const marketDataEngine = require('./services/marketDataEngine');

// Wire SMDE Engine Event Broadcasters
marketDataEngine.on('tick', (cacheEntry) => {
  io.emit('smde:tick', cacheEntry);
});

marketDataEngine.on('telemetry_update', (health) => {
  io.emit('smde:health', health);
});

// Hook DhanStreamer ticks into SMDE Ingestion Engine
dhanStreamer.onTick = (tick) => {
  marketDataEngine.ingestTick(tick);
};

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

// Inject Socket.io, DhanStreamer, and SMDE into request context
app.use((req, res, next) => {
  req.io = io;
  req.dhanStreamer = dhanStreamer;
  req.marketDataEngine = marketDataEngine;
  next();
});

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key';
const authenticateToken = (req, res, next) => {
  const token = req.cookies.accessToken || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  if (!token) return res.sendStatus(401);
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// WebSocket Logic for SMDE Streaming
io.on('connection', (socket) => {
  console.log('[Socket.IO] Client connected:', socket.id);

  // Send immediate SMDE Hot Cache Snapshot to newly connected client
  try {
    const snapshot = Array.from(marketDataEngine.cache.values());
    socket.emit('smde:snapshot', snapshot);
    socket.emit('smde:health', marketDataEngine.getHealthStatus());
  } catch (_) {}

  socket.on('join_room', (studentId) => {
    socket.join(studentId);
    console.log(`Socket ${socket.id} joined room ${studentId}`);
  });
});

// ── SMDE REST Diagnostics & Snapshot APIs ───────────────────────────
app.get('/api/smde/health', (req, res) => {
  res.json({ success: true, health: marketDataEngine.getHealthStatus() });
});

app.get('/api/smde/snapshot', (req, res) => {
  const snapshot = Array.from(marketDataEngine.cache.values());
  res.json({ success: true, count: snapshot.length, ticks: snapshot });
});

// Auto-start DhanStreamer if keys are configured
// Defer heavy database initialization & candle bootstrapping until after server.listen
function initializeBackgroundServices() {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } })
    .then(settings => {
      if (settings && settings.dhanClientId && settings.dhanAccessToken) {
        console.log('[Server] Auto-starting Dhan WebSocket Stream...');
        dhanStreamer.start(settings.dhanClientId, settings.dhanAccessToken);
      }
      marketDataEngine.bootstrapHistoricalCandles()
        .catch(err => console.error('[Server] Failed to bootstrap historical candles:', err.message));

      const masterOrderPoller = require('./services/masterOrderPoller');
      masterOrderPoller.startAll(io).catch(err =>
        console.error('[Server] Failed to start master pollers:', err.message)
      );
    })
    .catch(err => console.error('[Server] Failed to fetch settings for Dhan stream:', err.message));
}


require('./scheduler');

// Import Routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const tradeRoutes = require('./routes/trade');
const walletRoutes = require('./routes/wallet');
const membershipRoutes = require('./routes/membership');
const referralRoutes = require('./routes/referral');
const algoRoutes = require('./routes/algo');
const copyRoutes = require('./routes/copy');
const guardianRoutes = require('./routes/guardian');
const webhookRoutes = require('./routes/webhook');
const leadsRoutes = require('./routes/leads');
const crmLeadsRoutes = require('./routes/crmLeads');
const crmDemosRoutes = require('./routes/crmDemos');
const crmEmployeesRoutes = require('./routes/crmEmployees');
const crmConfigRoutes = require('./routes/crmConfig');
const crmAdminActionsRoutes = require('./routes/crmAdminActions');
const telegramBotHandler = require('./routes/telegramBotHandler');
const crmRemindersRoutes = require('./routes/crmReminders');
const crmCustomersRoutes = require('./routes/crmCustomers');
const crmJustdialRoutes = require('./routes/crmJustdial');

const aiLabRoutes = require('./routes/aiLab');
const userDrawingsRoutes = require('./routes/userDrawings');

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', authenticateToken, adminRoutes);
app.use('/api/trade', authenticateToken, tradeRoutes);
app.use('/api/wallet', authenticateToken, walletRoutes);
app.use('/api/membership', (req, res, next) => {
  if (req.path === '/plans' && req.method === 'GET') return next();
  return authenticateToken(req, res, next);
}, membershipRoutes);
app.use('/api/referral', authenticateToken, referralRoutes);
app.use('/api/algo', authenticateToken, algoRoutes);
app.use('/api/copy', authenticateToken, copyRoutes);
app.use('/api/guardian', guardianRoutes);
const optionalAuthenticateToken = (req, res, next) => {
  const token = req.cookies?.accessToken;
  if (!token) {
    req.user = { id: 'demo_trader_id' };
    return next();
  }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) req.user = { id: 'demo_trader_id' };
    else req.user = user;
    next();
  });
};

app.use('/api/ai-lab', optionalAuthenticateToken, aiLabRoutes);
// Webhook: PUBLIC — secured via per-connection webhookToken in URL
app.use('/webhook', webhookRoutes);
// Telegram Bot Inbound Webhook: PUBLIC
app.use('/api/telegram', telegramBotHandler);
// Education Leads: PUBLIC endpoints (enquiry/demo) + admin-only GET
app.use('/api/leads', leadsRoutes);
// CRM System Routes
app.use('/api/crm/leads', authenticateToken, crmLeadsRoutes);
app.use('/api/crm/demos', authenticateToken, crmDemosRoutes);
app.use('/api/crm/employees', authenticateToken, crmEmployeesRoutes);
app.use('/api/crm/config', authenticateToken, crmConfigRoutes);
app.use('/api/crm/admin', authenticateToken, crmAdminActionsRoutes);
app.use('/api/crm/reminders', authenticateToken, crmRemindersRoutes);
app.use('/api/crm/customers', authenticateToken, crmCustomersRoutes);
app.use('/api/crm/justdial', crmJustdialRoutes);
// User Drawing Engine: Authenticated, ownership-enforced
app.use('/api/user/drawings', authenticateToken, userDrawingsRoutes);
console.log('[Server] User drawings routes mounted at /api/user/drawings');

app.get('/api/ticks', (req, res) => {
  try {
    res.json({ status: 'ok', ticks: dhanStreamer.getAllTicks() });
  } catch (_) {
    res.json({ status: 'ok', ticks: [] });
  }
});

app.get('/api/smde/klines', async (req, res) => {
  try {
    const symbol = req.query.symbol || 'NIFTY';
    const tf = req.query.timeframe || '5m';
    const limit = parseInt(req.query.limit || '200', 10);
    const to = req.query.to ? parseInt(req.query.to, 10) : null;
    const result = await marketDataEngine.getKlinesAsync(symbol, tf, limit, to);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── SMDE Option Chain Endpoints (Market Data — No Auth Required) ─────
const dhanOptionChainService = require('./services/dhanOptionChainService');

app.get('/api/smde/option-chain/expiries', async (req, res) => {
  try {
    const symbol = (req.query.symbol || 'NIFTY').toUpperCase();
    const result = await dhanOptionChainService.getExpiries(symbol);
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: 'SERVER_ERROR', expiries: [] });
  }
});

app.get('/api/smde/option-chain', async (req, res) => {
  try {
    const symbol = (req.query.symbol || 'NIFTY').toUpperCase();
    const expiry = req.query.expiry;
    if (!expiry) return res.json({ success: false, error: 'EXPIRY_REQUIRED', contracts: null });
    const result = await dhanOptionChainService.getOptionChain(symbol, expiry);
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: 'SERVER_ERROR', contracts: null });
  }
});

app.get('/api/smde/option-chain/status', async (req, res) => {
  try {
    res.json({ success: true, ...dhanOptionChainService.getServiceStatus() });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── SMDE Official FII / DII Endpoint ──────────────────────────────────
const fiiDiiService = require('./services/fiiDiiService');

app.get('/api/smde/fii-dii', async (req, res) => {
  try {
    const data = await fiiDiiService.getFiiDiiData();
    res.json(data);
  } catch (err) {
    res.json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message,
    });
  }
});

// ── SMDE Live Market News Endpoint (Indian & Global) ─────────────────
const marketNewsService = require('./services/marketNewsService');

app.get('/api/smde/news', async (req, res) => {
  try {
    const category = req.query.category || 'ALL';
    const data = await marketNewsService.getLiveNews(category);
    res.json(data);
  } catch (err) {
    res.json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message,
      articles: [],
    });
  }
});



app.get('/api/payment-config', async (req, res) => {
  try {
    let settings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });
    if (!settings) {
      settings = await prisma.systemSettings.create({ data: { id: 'CONFIG' } });
    }

    res.json({
      success: true,
      upiEnabled: settings.upiEnabled ?? true,
      upiId: settings.upiId || '7665977937@ybl',
      upiHolderName: settings.upiHolderName || 'Hello Trader Institute',

      qrEnabled: settings.qrEnabled ?? true,
      qrImageUrl: settings.qrImageUrl || '/images/payment_qr.png',

      bankEnabled: settings.bankEnabled ?? true,
      bankName: settings.bankName || 'Bank of Baroda',
      bankAccountName: settings.bankAccountName || 'Hello Trader Institute',
      bankAccountNumber: settings.bankAccountNumber || '28668100005444',
      bankIfsc: settings.bankIfsc || 'BARB0SHIVBS',
      bankBranch: settings.bankBranch || 'Main Branch'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/monitoring/frontend-error', async (req, res) => {
  try {
    const marketHealthMonitor = require('./services/marketHealthMonitor');
    await marketHealthMonitor.reportFrontendError(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Production Backend running on 0.0.0.0:${PORT}`);

  // Defer non-critical background processes so Express server listens and responds instantly
  setTimeout(() => {
    try {
      initializeBackgroundServices();
    } catch (bgErr) {
      console.error('[Server] Background services init error:', bgErr.message);
    }

    try {
      const { runCredentialMigration } = require('./migrate_credentials');
      runCredentialMigration().catch(err => console.error('[Server] Credential migration error:', err.message));
    } catch (migErr) {
      console.error('[Server] Failed to launch credential migration:', migErr.message);
    }

    try {
      const mode = process.env.JUSTDIAL_INGESTION_MODE || 'OAUTH2';
      if (mode === 'IMAP') {
        const { startJustdialImapWorker } = require('./services/justdialImapWorker');
        startJustdialImapWorker();
      } else {
        const { startJustdialGmailOAuthWorker } = require('./services/justdialGmailOAuthWorker');
        startJustdialGmailOAuthWorker();
      }
    } catch (workerErr) {
      console.error('[Server] Failed to initialize Justdial ingestion worker:', workerErr.message);
    }
  }, 3000);
});
