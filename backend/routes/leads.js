/**
 * leads.js — Hello Trader Education Lead Capture Routes
 *
 * PUBLIC routes (no auth required):
 *   POST /api/leads/enquiry  — Course enquiry form
 *   POST /api/leads/demo     — Free demo booking
 *
 * ADMIN routes (auth required):
 *   GET  /api/leads          — View all leads (admin only)
 */

'use strict';

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { N } = require('../services/notifier');

const LEADS_PATH = path.join(__dirname, '../data/leads.json');

// ─── Helpers ───────────────────────────────────────────────────────────────
function readLeads() {
  try {
    if (!fs.existsSync(LEADS_PATH)) return [];
    return JSON.parse(fs.readFileSync(LEADS_PATH, 'utf8'));
  } catch (_) { return []; }
}

function saveLead(lead) {
  try {
    const dir = path.dirname(LEADS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const leads = readLeads();
    leads.unshift(lead);
    fs.writeFileSync(LEADS_PATH, JSON.stringify(leads, null, 2));
  } catch (err) {
    console.error('[Leads] Failed to save lead:', err.message);
  }
}

function sanitize(str) {
  if (!str) return '';
  return String(str).trim().slice(0, 500);
}

// ─── POST /api/leads/enquiry ───────────────────────────────────────────────
router.post('/enquiry', (req, res) => {
  try {
    const { name, phone, email, interest, message } = req.body || {};

    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required.' });
    }

    const phoneClean = sanitize(phone).replace(/[^0-9+]/g, '');
    if (phoneClean.length < 10) {
      return res.status(400).json({ error: 'Please enter a valid phone number.' });
    }

    const lead = {
      id: `LEAD_${Date.now()}`,
      type: 'ENQUIRY',
      name: sanitize(name),
      phone: phoneClean,
      email: sanitize(email),
      interest: sanitize(interest),
      message: sanitize(message),
      ip: req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress,
      createdAt: new Date().toISOString(),
    };

    saveLead(lead);

    // Instant Telegram notification
    N.newLead({ name: lead.name, phone: lead.phone, email: lead.email, interest: lead.interest, message: lead.message });

    return res.json({ success: true, message: 'Thank you! We will contact you shortly.' });
  } catch (err) {
    console.error('[Leads/enquiry] Error:', err.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ─── POST /api/leads/demo ──────────────────────────────────────────────────
router.post('/demo', (req, res) => {
  try {
    const { name, phone, email, interest, message } = req.body || {};

    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required.' });
    }

    const phoneClean = sanitize(phone).replace(/[^0-9+]/g, '');
    if (phoneClean.length < 10) {
      return res.status(400).json({ error: 'Please enter a valid phone number.' });
    }

    const lead = {
      id: `DEMO_${Date.now()}`,
      type: 'DEMO',
      name: sanitize(name),
      phone: phoneClean,
      email: sanitize(email),
      interest: sanitize(interest),
      message: sanitize(message),
      ip: req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress,
      createdAt: new Date().toISOString(),
    };

    saveLead(lead);

    // Instant Telegram notification
    N.newDemo({ name: lead.name, phone: lead.phone, email: lead.email, interest: lead.interest, message: lead.message });

    return res.json({ success: true, message: 'Demo booking confirmed! We will call you shortly.' });
  } catch (err) {
    console.error('[Leads/demo] Error:', err.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ─── GET /api/leads — Admin only ───────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    // Basic admin check — must be authenticated and ADMIN role
    if (!req.user || req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    const leads = readLeads();
    return res.json({ success: true, count: leads.length, leads });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
