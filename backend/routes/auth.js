const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key';

// Cookie options
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
};

router.post('/signup-request', async (req, res) => {
  try {
    const { name, email, phone, referralCode } = req.body;
    const existingUser = await prisma.user.findFirst({ where: { OR: [{ email }, { phone }] } });
    if (existingUser) return res.status(400).json({ error: 'Account exists' });

    const existingReq = await prisma.signupRequest.findFirst({ where: { OR: [{ email }, { phone }] } });
    if (existingReq) return res.status(400).json({ error: 'Request already pending' });

    const request = await prisma.signupRequest.create({
      data: { 
        name, 
        email, 
        phone, 
        referralCode,
        ipAddress: req.ip || req.connection.remoteAddress
      }
    });
    
    if (req.io) req.io.emit('new_signup_request', request);

    res.json({ success: true, request });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { emailOrPhone, password } = req.body;
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: emailOrPhone }, { phone: emailOrPhone }, { studentId: emailOrPhone }]
      },
      include: { wallets: true }
    });

    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.status === 'LOCKED') return res.status(403).json({ error: 'Account locked' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid password' });

    const accessToken = jwt.sign({ id: user.id, role: user.role, studentId: user.studentId }, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
    
    res.cookie('accessToken', accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
    res.cookie('refreshToken', refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });

    const { password: _, ...userWithoutPass } = user;
    res.json({ success: true, user: userWithoutPass });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/refresh', (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) return res.status(401).json({ error: 'No refresh token' });

  jwt.verify(refreshToken, JWT_SECRET, async (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid refresh token' });

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const newAccessToken = jwt.sign({ id: user.id, role: user.role, studentId: user.studentId }, JWT_SECRET, { expiresIn: '15m' });
    res.cookie('accessToken', newAccessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
    
    res.json({ success: true });
  });
});

router.post('/logout', (req, res) => {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
  res.json({ success: true });
});

router.get('/me', (req, res) => {
  const token = req.cookies.accessToken;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: { wallets: true }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { password: _, ...userWithoutPass } = user;
    res.json({ user: userWithoutPass });
  });
});

module.exports = router;
