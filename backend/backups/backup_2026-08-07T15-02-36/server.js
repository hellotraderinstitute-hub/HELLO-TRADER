const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
require('dotenv').config();

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

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// Inject Socket.io and DhanStreamer into request
app.use((req, res, next) => {
  req.io = io;
  req.dhanStreamer = dhanStreamer;
  next();
});

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key';
const authenticateToken = (req, res, next) => {
  const token = req.cookies.accessToken;
  if (!token) return res.sendStatus(401);
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// WebSocket Logic
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send immediate market snapshot to newly connected client
  try {
    socket.emit('market_ticks', dhanStreamer.getAllTicks());
  } catch (_) {}

  socket.on('join_room', (studentId) => {
    socket.join(studentId);
    console.log(`Socket ${socket.id} joined room ${studentId}`);
  });
});

// Auto-start DhanStreamer if keys are configured
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } })
  .then(settings => {
    if (settings && settings.dhanClientId && settings.dhanAccessToken) {
      console.log('[Server] Auto-starting Dhan WebSocket Stream...');
      dhanStreamer.start(settings.dhanClientId, settings.dhanAccessToken);
    }
  })
  .catch(err => console.error('[Server] Failed to fetch settings for Dhan stream:', err.message));

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

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', authenticateToken, adminRoutes);
app.use('/api/trade', authenticateToken, tradeRoutes);
app.use('/api/wallet', authenticateToken, walletRoutes);
app.use('/api/membership', authenticateToken, membershipRoutes);
app.use('/api/referral', authenticateToken, referralRoutes);
app.use('/api/algo', authenticateToken, algoRoutes);
app.use('/api/copy', authenticateToken, copyRoutes);
app.use('/api/guardian', guardianRoutes);
// Webhook: PUBLIC — secured via per-connection webhookToken in URL
app.use('/webhook', webhookRoutes);

app.get('/api/ticks', (req, res) => {
  try {
    res.json({ status: 'ok', ticks: dhanStreamer.getAllTicks() });
  } catch (_) {
    res.json({ status: 'ok', ticks: [] });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Production Backend running on port ${PORT}`);
});
