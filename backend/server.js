const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: 'http://localhost:3000', methods: ['GET', 'POST'], credentials: true }
});

app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Inject Socket.io into request
app.use((req, res, next) => {
  req.io = io;
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
  socket.on('join_room', (studentId) => {
    socket.join(studentId);
    console.log(`Socket ${socket.id} joined room ${studentId}`);
  });
});

// Mock Market Data Feed
const symbols = [
  { s: 'NIFTY', p: 22000, v: 5 },
  { s: 'BANKNIFTY', p: 46000, v: 10 },
  { s: 'RELIANCE', p: 2900, v: 2 },
  { s: 'HDFCBANK', p: 1450, v: 1 },
  { s: 'TCS', p: 3800, v: 3 }
];

setInterval(() => {
  const ticks = symbols.map(sym => {
    // Random walk
    const change = (Math.random() - 0.5) * sym.v;
    sym.p += change;
    return { symbol: sym.s, price: parseFloat(sym.p.toFixed(2)) };
  });
  io.emit('market_ticks', ticks);
}, 1000);

require('./scheduler');

// Import Routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const tradeRoutes = require('./routes/trade');
const walletRoutes = require('./routes/wallet');
const membershipRoutes = require('./routes/membership');
const referralRoutes = require('./routes/referral');

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', authenticateToken, adminRoutes);
app.use('/api/trade', authenticateToken, tradeRoutes);
app.use('/api/wallet', authenticateToken, walletRoutes);
app.use('/api/membership', authenticateToken, membershipRoutes);
app.use('/api/referral', authenticateToken, referralRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Production Backend running on port ${PORT}`);
});
