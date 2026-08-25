/**
 * userDrawings.js — Secure Authenticated User Drawings REST API
 */
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// GET /api/user/drawings?symbol=NIFTY&timeframe=5m
router.get('/', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });

    const symbol = (req.query.symbol || 'NIFTY').toUpperCase();
    const timeframe = req.query.timeframe || null;

    const whereClause = { userId, symbol };
    if (timeframe) whereClause.timeframe = timeframe;

    const drawings = await prisma.userDrawing.findMany({
      where: whereClause,
      orderBy: { createdAt: 'asc' }
    });

    const formatted = drawings.map(d => ({
      id: d.id,
      symbol: d.symbol,
      timeframe: d.timeframe,
      type: d.type,
      points: JSON.parse(d.points || '[]'),
      style: d.style ? JSON.parse(d.style) : {},
      visible: d.visible,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt
    }));

    res.json({ success: true, count: formatted.length, drawings: formatted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/user/drawings (Create or Sync Drawing)
router.post('/', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });

    const { symbol, timeframe = 'GLOBAL', type, points, style, visible = true, id } = req.body;
    if (!symbol || !type || !Array.isArray(points)) {
      return res.status(400).json({ success: false, error: 'INVALID_DRAWING_PAYLOAD' });
    }

    const symKey = symbol.toUpperCase();
    const pointsStr = JSON.stringify(points);
    const styleStr = style ? JSON.stringify(style) : null;

    let drawing;
    if (id) {
      // Check if drawing exists
      const existing = await prisma.userDrawing.findUnique({ where: { id } });
      if (existing) {
        if (existing.userId !== userId) {
          return res.status(403).json({ success: false, error: 'FORBIDDEN_DRAWING_ACCESS' });
        }
        drawing = await prisma.userDrawing.update({
          where: { id },
          data: {
            symbol: symKey,
            timeframe,
            type,
            points: pointsStr,
            style: styleStr,
            visible
          }
        });
      }
    }

    if (!drawing) {
      drawing = await prisma.userDrawing.create({
        data: {
          userId,
          symbol: symKey,
          timeframe,
          type,
          points: pointsStr,
          style: styleStr,
          visible
        }
      });
    }

    res.json({
      success: true,
      drawing: {
        id: drawing.id,
        symbol: drawing.symbol,
        timeframe: drawing.timeframe,
        type: drawing.type,
        points: JSON.parse(drawing.points),
        style: drawing.style ? JSON.parse(drawing.style) : {},
        visible: drawing.visible
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/user/drawings/:id (Update specific drawing)
router.put('/:id', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });

    const { id } = req.params;
    const { symbol, timeframe, type, points, style, visible } = req.body;

    const existing = await prisma.userDrawing.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'DRAWING_NOT_FOUND' });
    }
    if (existing.userId !== userId) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN_DRAWING_ACCESS' });
    }

    const updateData = {};
    if (symbol) updateData.symbol = symbol.toUpperCase();
    if (timeframe) updateData.timeframe = timeframe;
    if (type) updateData.type = type;
    if (Array.isArray(points)) updateData.points = JSON.stringify(points);
    if (style !== undefined) updateData.style = style ? JSON.stringify(style) : null;
    if (visible !== undefined) updateData.visible = visible;

    const updated = await prisma.userDrawing.update({
      where: { id },
      data: updateData
    });

    res.json({
      success: true,
      drawing: {
        id: updated.id,
        symbol: updated.symbol,
        timeframe: updated.timeframe,
        type: updated.type,
        points: JSON.parse(updated.points),
        style: updated.style ? JSON.parse(updated.style) : {},
        visible: updated.visible
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/user/drawings/:id
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });

    const { id } = req.params;

    // Verify ownership before deleting
    const existing = await prisma.userDrawing.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'DRAWING_NOT_FOUND' });
    }
    if (existing.userId !== userId) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN_DRAWING_ACCESS' });
    }

    await prisma.userDrawing.delete({ where: { id } });
    res.json({ success: true, deletedId: id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/user/drawings/clear?symbol=NIFTY
router.delete('/clear/symbol', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });

    const symbol = (req.query.symbol || 'NIFTY').toUpperCase();

    const deleted = await prisma.userDrawing.deleteMany({
      where: { userId, symbol }
    });

    res.json({ success: true, count: deleted.count, symbol });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
