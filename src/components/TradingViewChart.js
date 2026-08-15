'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  BarChart2, Maximize2, Minimize2, Activity, Sliders,
  Radio, AlertTriangle, X, Undo2, Redo2, Trash2,
  MousePointer, Minus, ArrowRight, AlignCenter, AlignLeft,
  Square, Circle, ArrowUpRight, Type, TrendingUp, BarChart,
  Lock, Cloud, CloudOff
} from 'lucide-react';
import { calculateEMA, calculateVWAP, calculateBollingerBands } from '../utils/technicalIndicators';
import { useTrading } from '../context/TradingContext';

// ─── Drawing Engine Constants ─────────────────────────────────────────────────
const FIB_LEVELS     = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const FIB_EXT_LEVELS = [0, 0.618, 1, 1.272, 1.618, 2.0];
const FIBO_COLORS    = ['#FF6B6B','#FFD93D','#6BCB77','#4D96FF','#9B5DE5','#F15BB5','#00BBF9'];
const HANDLE_RADIUS  = 6;  // px in CSS space

const DRAWING_TOOLS = [
  { id: 'select',     icon: MousePointer, label: 'Select',           group: 'cursor' },
  { id: 'trendline',  icon: TrendingUp,   label: 'Trend Line',       group: 'lines'  },
  { id: 'ray',        icon: ArrowRight,   label: 'Ray',              group: 'lines'  },
  { id: 'extended',   icon: Minus,        label: 'Extended Line',    group: 'lines'  },
  { id: 'hline',      icon: AlignCenter,  label: 'Horizontal Line',  group: 'lines'  },
  { id: 'vline',      icon: AlignLeft,    label: 'Vertical Line',    group: 'lines'  },
  { id: 'rectangle',  icon: Square,       label: 'Rectangle',        group: 'shapes' },
  { id: 'circle',     icon: Circle,       label: 'Circle',           group: 'shapes' },
  { id: 'arrow',      icon: ArrowUpRight, label: 'Arrow',            group: 'shapes' },
  { id: 'text',       icon: Type,         label: 'Text',             group: 'shapes' },
  { id: 'pricerange', icon: BarChart,     label: 'Price Range',      group: 'measure'},
  { id: 'daterange',  icon: BarChart2,    label: 'Date Range',       group: 'measure'},
  { id: 'measure',    icon: BarChart,     label: 'Measure',          group: 'measure'},
  { id: 'fib_ret',    icon: TrendingUp,   label: 'Fib Retracement',  group: 'fib'    },
  { id: 'fib_ext',    icon: TrendingUp,   label: 'Fib Extension',    group: 'fib'    },
  { id: 'channel',    icon: AlignCenter,  label: 'Parallel Channel', group: 'shapes' },
];

const TWO_POINT_TOOLS   = ['trendline','ray','extended','rectangle','circle','arrow','pricerange','daterange','measure','fib_ret'];
const THREE_POINT_TOOLS = ['fib_ext','channel'];
const ONE_POINT_TOOLS   = ['hline','vline','text'];
const DEFAULT_STYLE     = { color:'#00D4FF', lineWidth:2, lineStyle:'solid', fillOpacity:0.1, textSize:13 };

// ─── ID helper ───────────────────────────────────────────────────────────────
const genId = () => 'd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

// ─── LocalStorage cache ───────────────────────────────────────────────────────
const LS_KEY   = (s, tf) => 'ht_drawings_' + s + '_' + tf;
const saveLS   = (s, tf, d) => { try { localStorage.setItem(LS_KEY(s, tf), JSON.stringify(d)); } catch (_) {} };
const loadLS   = (s, tf)    => { try { const r = localStorage.getItem(LS_KEY(s, tf)); return r ? JSON.parse(r) : []; } catch (_) { return []; } };

// ─── Canvas coordinate helpers ─────────────────────────────────────────────────
function toCanvasCoord(point, chart, series) {
  try {
    const dpr = window.devicePixelRatio || 1;
    const x = chart.timeScale().timeToCoordinate(point.time);
    const y = series.priceToCoordinate(point.price);
    if (x == null || y == null || isNaN(x) || isNaN(y)) return null;
    return { x: x * dpr, y: y * dpr };
  } catch (_) { return null; }
}

// ─── Arrow head ───────────────────────────────────────────────────────────────
function drawArrowHead(ctx, from, to, size, color) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(angle - Math.PI / 6), to.y - size * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(to.x - size * Math.cos(angle + Math.PI / 6), to.y - size * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

// ─── Endpoint handle drawing (selected state) ──────────────────────────────────
function drawHandles(ctx, pts, dpr) {
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, HANDLE_RADIUS * dpr, 0, 2 * Math.PI);
    ctx.fillStyle = '#FFD700';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1 * dpr;
    ctx.stroke();
  }
}

// ─── Main canvas drawing renderer ─────────────────────────────────────────────
function renderDrawings(canvas, chart, series, drawings, selectedId, previewDrawing) {
  if (!canvas || !chart || !series) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const all = previewDrawing ? [...drawings, previewDrawing] : drawings;

  for (const d of all) {
    if (d.visible === false) continue;
    const isSelected = d.id === selectedId;
    const style = { ...DEFAULT_STYLE, ...(d.style || {}) };
    const color = isSelected ? '#FFD700' : (style.color || '#00D4FF');
    const lw    = (style.lineWidth || 2) * dpr;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = lw;
    if (style.lineStyle === 'dashed')  ctx.setLineDash([8 * dpr, 4 * dpr]);
    else if (style.lineStyle === 'dotted') ctx.setLineDash([2 * dpr, 4 * dpr]);
    else ctx.setLineDash([]);

    const pts = (d.points || []).map(p => toCanvasCoord(p, chart, series));
    const valid = pts.filter(Boolean);

    // ── Horizontal Line ───────────────────────────────────────────────
    if (d.type === 'hline') {
      const p = pts[0];
      if (p) {
        ctx.beginPath(); ctx.moveTo(0, p.y); ctx.lineTo(canvas.width, p.y); ctx.stroke();
        ctx.font = 'bold ' + (10 * dpr) + 'px monospace';
        ctx.fillStyle = color;
        ctx.fillText(d.points[0].price.toFixed(2), 8 * dpr, p.y - 4 * dpr);
        if (isSelected) drawHandles(ctx, [{ x: canvas.width / 2, y: p.y }], dpr);
      }

    // ── Vertical Line ─────────────────────────────────────────────────
    } else if (d.type === 'vline') {
      const p = pts[0];
      if (p) {
        ctx.beginPath(); ctx.moveTo(p.x, 0); ctx.lineTo(p.x, canvas.height); ctx.stroke();
        if (isSelected) drawHandles(ctx, [{ x: p.x, y: canvas.height / 2 }], dpr);
      }

    // ── Trend Line ────────────────────────────────────────────────────
    } else if (d.type === 'trendline') {
      if (valid.length >= 2) {
        ctx.beginPath(); ctx.moveTo(valid[0].x, valid[0].y); ctx.lineTo(valid[1].x, valid[1].y); ctx.stroke();
        if (isSelected) drawHandles(ctx, valid, dpr);
      }

    // ── Ray ───────────────────────────────────────────────────────────
    } else if (d.type === 'ray') {
      if (valid.length >= 2) {
        const dx = valid[1].x - valid[0].x, dy = valid[1].y - valid[0].y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const scale = canvas.width * 3 / len;
        ctx.beginPath(); ctx.moveTo(valid[0].x, valid[0].y);
        ctx.lineTo(valid[0].x + dx * scale, valid[0].y + dy * scale); ctx.stroke();
        if (isSelected) drawHandles(ctx, valid, dpr);
      }

    // ── Extended Line ─────────────────────────────────────────────────
    } else if (d.type === 'extended') {
      if (valid.length >= 2) {
        const dx = valid[1].x - valid[0].x, dy = valid[1].y - valid[0].y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const scale = canvas.width * 3 / len;
        ctx.beginPath();
        ctx.moveTo(valid[0].x - dx * scale, valid[0].y - dy * scale);
        ctx.lineTo(valid[0].x + dx * scale, valid[0].y + dy * scale); ctx.stroke();
        if (isSelected) drawHandles(ctx, valid, dpr);
      }

    // ── Arrow ─────────────────────────────────────────────────────────
    } else if (d.type === 'arrow') {
      if (valid.length >= 2) {
        ctx.beginPath(); ctx.moveTo(valid[0].x, valid[0].y); ctx.lineTo(valid[1].x, valid[1].y); ctx.stroke();
        drawArrowHead(ctx, valid[0], valid[1], 14 * dpr, color);
        if (isSelected) drawHandles(ctx, valid, dpr);
      }

    // ── Rectangle ─────────────────────────────────────────────────────
    } else if (d.type === 'rectangle') {
      if (valid.length >= 2) {
        const [a, b] = valid;
        ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
        ctx.fillStyle = style.color || '#00D4FF';
        ctx.globalAlpha = style.fillOpacity || 0.1;
        ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
        ctx.globalAlpha = 1;
        if (isSelected) drawHandles(ctx, [
          { x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }
        ], dpr);
      }

    // ── Circle ────────────────────────────────────────────────────────
    } else if (d.type === 'circle') {
      if (valid.length >= 2) {
        const [a, b] = valid;
        const rx = Math.abs(b.x - a.x) / 2, ry = Math.abs(b.y - a.y) / 2;
        const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(rx, 2), Math.max(ry, 2), 0, 0, 2 * Math.PI); ctx.stroke();
        ctx.fillStyle = style.color || '#00D4FF'; ctx.globalAlpha = style.fillOpacity || 0.08; ctx.fill(); ctx.globalAlpha = 1;
        if (isSelected) drawHandles(ctx, valid, dpr);
      }

    // ── Text ──────────────────────────────────────────────────────────
    } else if (d.type === 'text') {
      const p = pts[0];
      if (p && d.text) {
        const fs = (style.textSize || 13) * dpr;
        ctx.font = 'bold ' + fs + 'px sans-serif';
        ctx.fillStyle = color;
        ctx.fillText(d.text, p.x + 4 * dpr, p.y - 4 * dpr);
        if (isSelected) drawHandles(ctx, [p], dpr);
      }

    // ── Price Range ───────────────────────────────────────────────────
    } else if (d.type === 'pricerange') {
      if (valid.length >= 2) {
        const [a, b] = valid;
        const diff = Math.abs(d.points[1].price - d.points[0].price);
        const pct  = d.points[0].price > 0 ? (diff / d.points[0].price) * 100 : 0;
        const top  = Math.min(a.y, b.y);
        ctx.strokeRect(0, top, canvas.width, Math.abs(b.y - a.y));
        ctx.fillStyle = style.color || '#00D4FF'; ctx.globalAlpha = 0.07;
        ctx.fillRect(0, top, canvas.width, Math.abs(b.y - a.y)); ctx.globalAlpha = 1;
        ctx.font = 'bold ' + (11 * dpr) + 'px monospace'; ctx.fillStyle = color;
        ctx.fillText('Delta Rs.' + diff.toFixed(2) + '  ' + pct.toFixed(2) + '%', 8 * dpr, top - 5 * dpr);
        if (isSelected) drawHandles(ctx, [{ x: canvas.width / 2, y: a.y }, { x: canvas.width / 2, y: b.y }], dpr);
      }

    // ── Date Range ────────────────────────────────────────────────────
    } else if (d.type === 'daterange') {
      if (valid.length >= 2) {
        const [a, b] = valid;
        const secs = Math.abs(d.points[1].time - d.points[0].time);
        const left = Math.min(a.x, b.x);
        ctx.strokeRect(left, 0, Math.abs(b.x - a.x), canvas.height);
        ctx.fillStyle = style.color || '#9B5DE5'; ctx.globalAlpha = 0.07;
        ctx.fillRect(left, 0, Math.abs(b.x - a.x), canvas.height); ctx.globalAlpha = 1;
        ctx.font = 'bold ' + (11 * dpr) + 'px monospace'; ctx.fillStyle = color;
        ctx.fillText(Math.floor(secs / 3600) + 'h ' + Math.floor((secs % 3600) / 60) + 'm', left + 5 * dpr, 20 * dpr);
        if (isSelected) drawHandles(ctx, [{ x: a.x, y: canvas.height / 2 }, { x: b.x, y: canvas.height / 2 }], dpr);
      }

    // ── Measure ───────────────────────────────────────────────────────
    } else if (d.type === 'measure') {
      if (valid.length >= 2) {
        const [a, b] = valid;
        const diff = Math.abs(d.points[1].price - d.points[0].price);
        const pct  = d.points[0].price > 0 ? (diff / d.points[0].price) * 100 : 0;
        const secs = Math.abs(d.points[1].time - d.points[0].time);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - 30 * dpr;
        ctx.fillStyle = '#1A1F2E'; ctx.globalAlpha = 0.92; ctx.fillRect(mx - 70 * dpr, my, 140 * dpr, 50 * dpr); ctx.globalAlpha = 1;
        ctx.strokeRect(mx - 70 * dpr, my, 140 * dpr, 50 * dpr);
        ctx.font = 'bold ' + (10 * dpr) + 'px monospace'; ctx.fillStyle = '#00FF41';
        ctx.fillText('Rs.' + diff.toFixed(2) + ' | ' + pct.toFixed(2) + '%', mx - 62 * dpr, my + 18 * dpr);
        ctx.fillStyle = '#A0AEC0';
        ctx.fillText(Math.floor(secs / 60) + 'm | ~' + Math.round(secs / 60) + ' bars', mx - 62 * dpr, my + 36 * dpr);
        if (isSelected) drawHandles(ctx, valid, dpr);
      }

    // ── Fibonacci Retracement ─────────────────────────────────────────
    } else if (d.type === 'fib_ret') {
      if (valid.length >= 2 && d.points.length >= 2) {
        const high  = Math.max(d.points[0].price, d.points[1].price);
        const low   = Math.min(d.points[0].price, d.points[1].price);
        const range = high - low;
        const leftX = Math.min(valid[0].x, valid[1].x);
        FIB_LEVELS.forEach((level, i) => {
          const price = high - level * range;
          try {
            const fy = series.priceToCoordinate(price) * dpr;
            if (fy == null || isNaN(fy)) return;
            ctx.strokeStyle = FIBO_COLORS[i % FIBO_COLORS.length];
            ctx.setLineDash([5 * dpr, 3 * dpr]);
            ctx.beginPath(); ctx.moveTo(leftX, fy); ctx.lineTo(canvas.width - 62 * dpr, fy); ctx.stroke();
            ctx.setLineDash([]);
            ctx.font = (10 * dpr) + 'px monospace'; ctx.fillStyle = FIBO_COLORS[i % FIBO_COLORS.length];
            ctx.fillText(level + ' (' + price.toFixed(2) + ')', canvas.width - 60 * dpr, fy - 3 * dpr);
          } catch (_) {}
        });
        ctx.strokeStyle = color; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(valid[0].x, valid[0].y); ctx.lineTo(valid[1].x, valid[1].y); ctx.stroke();
        if (isSelected) drawHandles(ctx, valid, dpr);
      }

    // ── Fibonacci Extension (3-point) ─────────────────────────────────
    } else if (d.type === 'fib_ext') {
      if (valid.length >= 3 && d.points.length >= 3) {
        const [p0, p1, p2] = d.points;
        const swing = p1.price - p0.price;
        FIB_EXT_LEVELS.forEach((level, i) => {
          const price = p2.price + swing * level;
          try {
            const fy = series.priceToCoordinate(price) * dpr;
            if (fy == null || isNaN(fy)) return;
            ctx.strokeStyle = FIBO_COLORS[i % FIBO_COLORS.length];
            ctx.setLineDash([5 * dpr, 3 * dpr]);
            ctx.beginPath(); ctx.moveTo(valid[2].x, fy); ctx.lineTo(canvas.width - 62 * dpr, fy); ctx.stroke();
            ctx.setLineDash([]);
            ctx.font = (10 * dpr) + 'px monospace'; ctx.fillStyle = FIBO_COLORS[i % FIBO_COLORS.length];
            ctx.fillText(level + ' (' + price.toFixed(2) + ')', canvas.width - 60 * dpr, fy - 3 * dpr);
          } catch (_) {}
        });
        ctx.strokeStyle = color; ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(valid[0].x, valid[0].y); ctx.lineTo(valid[1].x, valid[1].y);
        ctx.lineTo(valid[2].x, valid[2].y); ctx.stroke();
        if (isSelected) drawHandles(ctx, valid, dpr);
      }

    // ── Parallel Channel (3-point: A, B define base line; C defines offset) ─
    } else if (d.type === 'channel') {
      if (valid.length >= 3 && d.points.length >= 3) {
        const [pa, pb, pc] = d.points;
        const [va, vb, vc] = valid;
        // Base line: A → B
        ctx.beginPath(); ctx.moveTo(va.x, va.y); ctx.lineTo(vb.x, vb.y); ctx.stroke();
        // Slope of base line in price/time space
        const dtBase  = pb.time  - pa.time;
        const dpBase  = pb.price - pa.price;
        // Price offset at C's time projected back onto the baseline slope
        const tRatio  = dtBase !== 0 ? (pc.time - pa.time) / dtBase : 0;
        const priceOnBase = pa.price + tRatio * dpBase;  // price on base line at C's time
        const offset  = pc.price - priceOnBase;          // perpendicular price offset
        // Draw parallel line: each base-line point offset by `offset` in price
        try {
          const vaOff = { x: va.x, y: toCanvasCoord({ time: pa.time, price: pa.price + offset }, chart, series)?.y ?? va.y };
          const vbOff = { x: vb.x, y: toCanvasCoord({ time: pb.time, price: pb.price + offset }, chart, series)?.y ?? vb.y };
          ctx.setLineDash([4 * dpr, 4 * dpr]);
          ctx.beginPath(); ctx.moveTo(vaOff.x, vaOff.y); ctx.lineTo(vbOff.x, vbOff.y); ctx.stroke();
          ctx.setLineDash([]);
          // Fill
          ctx.fillStyle = style.color || '#00D4FF'; ctx.globalAlpha = 0.05;
          ctx.beginPath();
          ctx.moveTo(va.x, va.y); ctx.lineTo(vb.x, vb.y);
          ctx.lineTo(vbOff.x, vbOff.y); ctx.lineTo(vaOff.x, vaOff.y);
          ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
        } catch (_) {}
        if (isSelected) drawHandles(ctx, valid.slice(0, 3), dpr);
      }
    }
    ctx.restore();
  }
}

// ─── Hit-test drawing by proximity ────────────────────────────────────────────
function hitTest(px, py, drawings, chart, series) {
  if (!chart || !series) return { drawingId: null, handleIndex: -1 };
  const dpr = window.devicePixelRatio || 1;
  const THRESH = 14 * dpr;

  const coord = (p) => {
    try {
      const x = chart.timeScale().timeToCoordinate(p.time) * dpr;
      const y = series.priceToCoordinate(p.price) * dpr;
      return (x != null && y != null && !isNaN(x) && !isNaN(y)) ? { x, y } : null;
    } catch (_) { return null; }
  };

  const segDist = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx*dx + dy*dy;
    if (l2 === 0) return Math.hypot(px-ax, py-ay);
    const t = Math.max(0, Math.min(1, ((px-ax)*dx + (py-ay)*dy) / l2));
    return Math.hypot(px - (ax + t*dx), py - (ay + t*dy));
  };

  for (let i = drawings.length - 1; i >= 0; i--) {
    const d = drawings[i];
    if (d.visible === false) continue;
    const pts = (d.points || []).map(p => coord(p));

    // Check individual endpoint handles first (for selected drawing)
    for (let hi = 0; hi < pts.length; hi++) {
      const p = pts[hi];
      if (p && Math.hypot(px*dpr - p.x, py*dpr - p.y) < THRESH) {
        return { drawingId: d.id, handleIndex: hi };
      }
    }

    // Then check the drawing body
    const valid = pts.filter(Boolean);
    let hit = false;
    if (d.type === 'hline' && valid[0] && Math.abs(py*dpr - valid[0].y) < THRESH) hit = true;
    else if (d.type === 'vline' && valid[0] && Math.abs(px*dpr - valid[0].x) < THRESH) hit = true;
    else if (valid.length >= 2) {
      const dist = segDist(px*dpr, py*dpr, valid[0].x, valid[0].y, valid[1].x, valid[1].y);
      if (dist < THRESH) hit = true;
    } else if (valid.length === 1 && Math.hypot(px*dpr - valid[0].x, py*dpr - valid[0].y) < THRESH*2) hit = true;

    if (hit) return { drawingId: d.id, handleIndex: -1 };
  }
  return { drawingId: null, handleIndex: -1 };
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function TradingViewChart({
  currentTicker, tickers, timeframe = '5m',
  onTimeframeChange, fetchKlines, subscribeKline
}) {
  const { isExpiredTrial, openRechargeModal } = useTrading();
  const containerRef      = useRef(null);
  const canvasRef         = useRef(null);
  const chartInstanceRef  = useRef(null);
  const candleSeriesRef   = useRef(null);
  const volumeSeriesRef   = useRef(null);
  const animFrameRef      = useRef(null);
  const isFetchingOlderRef = useRef(false);
  const hasMoreHistoryRef  = useRef(true);
  const candlesDataRef    = useRef([]);

  // ── State ──────────────────────────────────────────────────────────────────
  const [candlesData, setCandlesData]       = useState([]);
  const [loadingCandles, setLoadingCandles] = useState(true);
  const [candleError, setCandleError]       = useState(null);
  const [chartType, setChartType]           = useState('candlestick');
  const [isMaximized, setIsMaximized]       = useState(false);
  const [hoveredCandle, setHoveredCandle]   = useState(null);
  const [activeIndicators, setActiveIndicators] = useState({ ema20:true, ema50:false, vwap:false, bollinger:false });
  const [showIndicatorModal, setShowIndicatorModal] = useState(false);

  // Drawing State
  const [showDrawingToolbar, setShowDrawingToolbar] = useState(false);
  const [activeTool, setActiveTool]         = useState('select');
  const [drawings, setDrawings]             = useState([]);
  const [selectedId, setSelectedId]         = useState(null);
  const [drawHistory, setDrawHistory]       = useState([]);
  const [redoStack, setRedoStack]           = useState([]);
  const [previewDrawing, setPreviewDrawing] = useState(null);
  const [pendingPoints, setPendingPoints]   = useState([]);
  const [drawStyle, setDrawStyle]           = useState({ ...DEFAULT_STYLE });
  const [showStylePanel, setShowStylePanel] = useState(false);
  const [textInput, setTextInput]           = useState('');
  const [textPromptPt, setTextPromptPt]     = useState(null);
  const [syncStatus, setSyncStatus]         = useState('idle'); // idle | syncing | synced | error

  // Drag/handle state
  const dragRef = useRef({ active: false, drawingId: null, handleIndex: -1, startPts: null, startPt: null });

  // Session state (populated once auth is verified)
  const sessionTokenRef = useRef(null);

  const TIMEFRAMES = [
    { id: '1m', label: '1m' }, { id: '3m', label: '3m' }, { id: '5m', label: '5m' },
    { id: '15m', label: '15m' }, { id: '30m', label: '30m' },
    { id: '1h', label: '1H' }, { id: '2h', label: '2H' }, { id: '4h', label: '4H' },
    { id: '1D', label: '1D' }, { id: '1W', label: '1W' }
  ];
  const CHART_TYPES = [
    { id: 'candlestick', label: 'Candles' }, { id: 'bar', label: 'Bar' },
    { id: 'line', label: 'Line' }, { id: 'area', label: 'Area' },
    { id: 'heikin-ashi', label: 'Heikin Ashi' }
  ];

  // ── Heikin-Ashi ───────────────────────────────────────────────────────────
  const calculateHeikinAshi = useCallback((raw = []) => {
    if (!raw.length) return [];
    const ha = [];
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      const haClose = (c.open + c.high + c.low + c.close) / 4;
      const haOpen  = i === 0 ? (c.open + c.close) / 2 : (ha[i-1].open + ha[i-1].close) / 2;
      ha.push({ time: c.time, open: +haOpen.toFixed(2),
        high: +Math.max(c.high, haOpen, haClose).toFixed(2),
        low:  +Math.min(c.low,  haOpen, haClose).toFixed(2),
        close: +haClose.toFixed(2), volume: c.volume || 0 });
    }
    return ha;
  }, []);

  // ── Backend sync helper ───────────────────────────────────────────────────
  const isAuthenticated = useCallback(() => {
    // Check for cookie — if accessToken cookie exists we are authenticated
    return typeof document !== 'undefined' && document.cookie.includes('accessToken');
  }, []);

  const backendFetch = useCallback(async (method, path, body) => {
    try {
      const res = await fetch(path, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
    } catch (_) {
      return { ok: false, status: 0, data: {} };
    }
  }, []);

  // ── Load drawings: backend for auth users, localStorage for guests ─────────
  const loadDrawings = useCallback(async (symbol, tf) => {
    if (!symbol) return;
    const sym = symbol.toUpperCase();
    const cached = loadLS(sym, tf);

    if (isAuthenticated()) {
      setSyncStatus('syncing');
      const r = await backendFetch('GET', '/api/user/drawings?symbol=' + sym + '&timeframe=' + tf);
      if (r.ok && r.data.drawings) {
        const serverDrawings = r.data.drawings.map(d => ({
          ...d,
          points: Array.isArray(d.points) ? d.points : JSON.parse(d.points || '[]'),
          style:  typeof d.style === 'object' ? d.style : JSON.parse(d.style || '{}'),
        }));
        setDrawings(serverDrawings);
        saveLS(sym, tf, serverDrawings); // update local cache
        setSyncStatus('synced');
      } else {
        // Backend unavailable — fall back to localStorage cache
        setDrawings(cached);
        setSyncStatus('error');
      }
    } else {
      setDrawings(cached);
    }
  }, [isAuthenticated, backendFetch]);

  // ── Persist single drawing CREATE to backend ──────────────────────────────
  const syncCreate = useCallback(async (drawing, symbol, tf) => {
    if (!isAuthenticated()) return;
    setSyncStatus('syncing');
    const r = await backendFetch('POST', '/api/user/drawings', {
      id: drawing.id, symbol, timeframe: tf, type: drawing.type,
      points: drawing.points, style: drawing.style, visible: drawing.visible !== false,
    });
    setSyncStatus(r.ok ? 'synced' : 'error');
  }, [isAuthenticated, backendFetch]);

  // ── Persist drawing DELETE to backend ─────────────────────────────────────
  const syncDelete = useCallback(async (id) => {
    if (!isAuthenticated()) return;
    setSyncStatus('syncing');
    const r = await backendFetch('DELETE', '/api/user/drawings/' + id);
    setSyncStatus(r.ok ? 'synced' : 'error');
  }, [isAuthenticated, backendFetch]);

  // ── Persist drawing UPDATE to backend ────────────────────────────────────
  const syncUpdate = useCallback(async (drawing, symbol, tf) => {
    if (!isAuthenticated()) return;
    setSyncStatus('syncing');
    const r = await backendFetch('POST', '/api/user/drawings', {
      id: drawing.id, symbol, timeframe: tf, type: drawing.type,
      points: drawing.points, style: drawing.style, visible: drawing.visible !== false,
    });
    setSyncStatus(r.ok ? 'synced' : 'error');
  }, [isAuthenticated, backendFetch]);

  // ── Reload drawings on symbol/timeframe change ────────────────────────────
  useEffect(() => {
    if (!currentTicker?.symbol) return;
    setSelectedId(null); setPendingPoints([]); setPreviewDrawing(null);
    setDrawHistory([]); setRedoStack([]);
    loadDrawings(currentTicker.symbol, timeframe);
  }, [currentTicker?.symbol, timeframe]); // eslint-disable-line

  // ── Persist drawings to localStorage on every change ─────────────────────
  useEffect(() => {
    if (!currentTicker?.symbol) return;
    saveLS(currentTicker.symbol.toUpperCase(), timeframe, drawings);
  }, [drawings, currentTicker?.symbol, timeframe]);

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'Escape') {
        if (isMaximized) setIsMaximized(false);
        setPendingPoints([]); setPreviewDrawing(null); setActiveTool('select');
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        handleDeleteDrawing(selectedId);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }); // eslint-disable-line

  // ── Candle loading ─────────────────────────────────────────────────────────
  const deduplicateAndSort = (candles) => {
    const map = new Map();
    candles.forEach(c => { if (c?.time && c.open > 0 && c.close > 0) map.set(c.time, c); });
    return Array.from(map.values()).sort((a, b) => a.time - b.time);
  };

  const loadCandleData = useCallback(async () => {
    if (!currentTicker?.symbol) return;
    setLoadingCandles(true); setCandleError(null); hasMoreHistoryRef.current = true;
    try {
      const data = await fetchKlines(currentTicker.symbol, timeframe, 300);
      if (Array.isArray(data) && data.length > 0) {
        setCandlesData(data); candlesDataRef.current = data;
      } else {
        setCandlesData([]); candlesDataRef.current = []; setCandleError('CANDLE_FEED_UNAVAILABLE');
      }
    } catch (_) {
      setCandlesData([]); candlesDataRef.current = []; setCandleError('CANDLE_FEED_UNAVAILABLE');
    } finally { setLoadingCandles(false); }
  }, [currentTicker?.symbol, timeframe, fetchKlines]);

  useEffect(() => { loadCandleData(); }, [loadCandleData]);

  useEffect(() => { candlesDataRef.current = candlesData; }, [candlesData]);

  const fetchOlderHistory = useCallback(async () => {
    const data = candlesDataRef.current;
    if (!data?.length || isFetchingOlderRef.current || !hasMoreHistoryRef.current) return;
    if (!currentTicker?.symbol || typeof fetchKlines !== 'function') return;
    isFetchingOlderRef.current = true;
    const oldest = data[0].time;
    try {
      const older = await fetchKlines(currentTicker.symbol, timeframe, 250, oldest);
      if (Array.isArray(older) && older.length > 0) {
        const valid = older.filter(c => c.time < oldest);
        if (valid.length > 0) {
          const merged = deduplicateAndSort([...valid, ...data]);
          setCandlesData(merged);
          if (chartInstanceRef.current && candleSeriesRef.current) {
            const renderData = chartType === 'heikin-ashi' ? calculateHeikinAshi(merged)
              : (chartType === 'line' || chartType === 'area') ? merged.map(c => ({ time: c.time, value: c.close }))
              : merged;
            candleSeriesRef.current.setData(renderData);
            if (volumeSeriesRef.current) volumeSeriesRef.current.setData(merged.map(c => ({
              time: c.time, value: c.volume || 0, color: c.close >= c.open ? 'rgba(0,255,65,0.3)' : 'rgba(255,49,49,0.3)'
            })));
            try {
              const range = chartInstanceRef.current.timeScale().getVisibleLogicalRange();
              if (range) chartInstanceRef.current.timeScale().setVisibleLogicalRange({
                from: range.from + valid.length, to: range.to + valid.length
              });
            } catch (_) {}
          }
        } else hasMoreHistoryRef.current = false;
      } else hasMoreHistoryRef.current = false;
    } catch (_) {} finally { isFetchingOlderRef.current = false; }
  }, [currentTicker?.symbol, timeframe, fetchKlines, chartType, calculateHeikinAshi]);

  // ── Init Lightweight Chart ─────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    let isMounted = true;

    import('lightweight-charts').then(({ createChart, CandlestickSeries, BarSeries, LineSeries, AreaSeries, HistogramSeries, ColorType }) => {
      if (!isMounted || !containerRef.current) return;
      if (chartInstanceRef.current) { try { chartInstanceRef.current.remove(); } catch (_) {} }

      const chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height: isMaximized ? window.innerHeight - 100 : containerRef.current.clientHeight || 480,
        layout: { background: { type: ColorType.Solid, color: '#0B0E14' }, textColor: '#A0AEC0' },
        grid: { vertLines: { color: 'rgba(255,255,255,0.05)' }, horzLines: { color: 'rgba(255,255,255,0.05)' } },
        crosshair: { mode: 1 },
        rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)', autoScale: true },
        timeScale: { borderColor: 'rgba(255,255,255,0.1)', timeVisible: true, secondsVisible: false },
        handleScroll: activeTool === 'select',
        handleScale: activeTool === 'select',
      });

      let candleSeries;
      if      (chartType === 'bar')  candleSeries = chart.addSeries(BarSeries, { upColor:'#00FF41', downColor:'#FF3131' });
      else if (chartType === 'line') candleSeries = chart.addSeries(LineSeries, { color:'#00D4FF', lineWidth:2 });
      else if (chartType === 'area') candleSeries = chart.addSeries(AreaSeries, { lineColor:'#00D4FF', topColor:'rgba(0,212,255,0.4)', bottomColor:'rgba(0,212,255,0.0)' });
      else candleSeries = chart.addSeries(CandlestickSeries, { upColor:'#00FF41', downColor:'#FF3131', borderUpColor:'#00FF41', borderDownColor:'#FF3131', wickUpColor:'#00FF41', wickDownColor:'#FF3131' });

      const volSeries = chart.addSeries(HistogramSeries, { color:'#00D4FF', priceFormat:{ type:'volume' }, priceScaleId:'vol' });
      chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

      chartInstanceRef.current = chart; candleSeriesRef.current = candleSeries; volumeSeriesRef.current = volSeries;

      if (candlesData.length > 0) {
        let rd = chartType === 'heikin-ashi' ? calculateHeikinAshi(candlesData)
          : (chartType === 'line' || chartType === 'area') ? candlesData.map(c => ({ time: c.time, value: c.close }))
          : candlesData;
        candleSeries.setData(rd);
        volSeries.setData(candlesData.map(c => ({ time: c.time, value: c.volume || 0, color: c.close >= c.open ? 'rgba(0,255,65,0.3)' : 'rgba(255,49,49,0.3)' })));

        if (activeIndicators.ema20) {
          const s = chart.addSeries(LineSeries, { color:'#00D4FF', lineWidth:1.5 });
          s.setData(calculateEMA(candlesData, 20));
        }
        if (activeIndicators.ema50) {
          const s = chart.addSeries(LineSeries, { color:'#FFD700', lineWidth:1.5 });
          s.setData(calculateEMA(candlesData, 50));
        }
        if (activeIndicators.vwap) {
          const s = chart.addSeries(LineSeries, { color:'#A855F7', lineWidth:2 });
          s.setData(calculateVWAP(candlesData));
        }
        if (activeIndicators.bollinger) {
          const bb = calculateBollingerBands(candlesData, 20, 2);
          if (bb.middle.length) {
            chart.addSeries(LineSeries, { color:'#3B82F6', lineWidth:1 }).setData(bb.middle);
            chart.addSeries(LineSeries, { color:'#60A5FA', lineWidth:1, lineStyle:2 }).setData(bb.upper);
            chart.addSeries(LineSeries, { color:'#60A5FA', lineWidth:1, lineStyle:2 }).setData(bb.lower);
          }
        }
        chart.timeScale().fitContent();
      }

      chart.subscribeCrosshairMove(param => {
        if (!param?.time || !param.seriesData?.size) { setHoveredCandle(null); return; }
        setHoveredCandle(param.seriesData.get(candleSeries) || null);
      });

      chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range && range.from < 15 && !isFetchingOlderRef.current && hasMoreHistoryRef.current) fetchOlderHistory();
      });

      const onResize = () => {
        if (containerRef.current && chart) {
          try { chart.applyOptions({ width: containerRef.current.clientWidth, height: isMaximized ? window.innerHeight - 100 : containerRef.current.clientHeight || 480 }); } catch (_) {}
          resizeCanvas();
        }
      };
      window.addEventListener('resize', onResize);
      resizeCanvas();
      scheduleRedraw();
      return () => window.removeEventListener('resize', onResize);
    });

    return () => {
      isMounted = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (chartInstanceRef.current) { try { chartInstanceRef.current.remove(); } catch (_) {} chartInstanceRef.current = null; }
    };
  }, [candlesData, activeIndicators, chartType, isMaximized, calculateHeikinAshi]); // eslint-disable-line

  useEffect(() => {
    if (!chartInstanceRef.current) return;
    try { chartInstanceRef.current.applyOptions({ handleScroll: activeTool === 'select', handleScale: activeTool === 'select' }); } catch (_) {}
  }, [activeTool]);

  // ── Canvas helpers ─────────────────────────────────────────────────────────
  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = parent.clientWidth  * dpr;
    canvas.height = parent.clientHeight * dpr;
    canvas.style.width  = parent.clientWidth  + 'px';
    canvas.style.height = parent.clientHeight + 'px';
  };

  const drawingsRef = useRef(drawings);
  const selectedIdRef = useRef(selectedId);
  const previewRef = useRef(previewDrawing);
  useEffect(() => { drawingsRef.current = drawings; }, [drawings]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { previewRef.current = previewDrawing; }, [previewDrawing]);

  const scheduleRedraw = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(() => {
      renderDrawings(canvasRef.current, chartInstanceRef.current, candleSeriesRef.current,
        drawingsRef.current, selectedIdRef.current, previewRef.current);
    });
  }, []);

  // Redraw whenever anything visual changes
  useEffect(() => {
    scheduleRedraw();
    const chart = chartInstanceRef.current;
    if (!chart) return;
    const u1 = chart.timeScale().subscribeVisibleLogicalRangeChange(scheduleRedraw);
    const u2 = chart.subscribeCrosshairMove(scheduleRedraw);
    return () => { try { u1?.(); } catch (_) {} try { u2?.(); } catch (_) {} };
  }, [scheduleRedraw, drawings, selectedId, previewDrawing]);

  // ── Coordinate helpers ────────────────────────────────────────────────────
  const pixelToPoint = useCallback((px, py) => {
    const chart = chartInstanceRef.current, series = candleSeriesRef.current;
    if (!chart || !series) return null;
    try {
      const time  = chart.timeScale().coordinateToTime(px);
      const price = series.coordinateToPrice(py);
      return (time != null && price != null) ? { time, price } : null;
    } catch (_) { return null; }
  }, []);

  const getCanvasPt = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { px: 0, py: 0 };
    const rect = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { px: src.clientX - rect.left, py: src.clientY - rect.top };
  };

  // ── History helpers ───────────────────────────────────────────────────────
  const pushHistory = useCallback((prev) => {
    setDrawHistory(h => [...h.slice(-49), prev]);
    setRedoStack([]);
  }, []);

  const undo = useCallback(() => {
    setDrawHistory(h => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      setRedoStack(r => [drawings, ...r.slice(0, 49)]);
      setDrawings(prev);
      return h.slice(0, -1);
    });
  }, [drawings]);

  const redo = useCallback(() => {
    setRedoStack(r => {
      if (!r.length) return r;
      const next = r[0];
      setDrawHistory(h => [...h, drawings]);
      setDrawings(next);
      return r.slice(1);
    });
  }, [drawings]);

  const handleDeleteDrawing = useCallback((id) => {
    setDrawings(prev => { pushHistory(prev); return prev.filter(d => d.id !== id); });
    syncDelete(id);
    setSelectedId(null);
  }, [pushHistory, syncDelete]);

  const clearAllDrawings = useCallback(() => {
    drawings.forEach(d => syncDelete(d.id));
    pushHistory(drawings);
    setDrawings([]); setSelectedId(null); setPendingPoints([]); setPreviewDrawing(null);
  }, [drawings, pushHistory, syncDelete]);

  // ── Canvas pointer events ─────────────────────────────────────────────────
  const handleCanvasClick = useCallback((e) => {
    if (activeTool === 'select') return;
    const { px, py } = getCanvasPt(e);
    const pt = pixelToPoint(px, py);
    if (!pt) return;

    if (activeTool === 'text') { setTextPromptPt(pt); setTextInput(''); return; }

    const maxPts = THREE_POINT_TOOLS.includes(activeTool) ? 3 : TWO_POINT_TOOLS.includes(activeTool) ? 2 : 1;
    const newPending = [...pendingPoints, pt];

    if (newPending.length >= maxPts) {
      const newD = { id: genId(), type: activeTool, points: newPending, style: { ...drawStyle }, visible: true };
      setDrawings(prev => { pushHistory(prev); return [...prev, newD]; });
      setSelectedId(newD.id);
      setPendingPoints([]); setPreviewDrawing(null);
      if (ONE_POINT_TOOLS.includes(activeTool)) setActiveTool('select');
      syncCreate(newD, currentTicker?.symbol, timeframe);
    } else {
      setPendingPoints(newPending);
    }
  }, [activeTool, pendingPoints, pixelToPoint, drawStyle, pushHistory, syncCreate, currentTicker?.symbol, timeframe]);

  const handleCanvasMouseDown = useCallback((e) => {
    if (activeTool !== 'select') return;
    const { px, py } = getCanvasPt(e);
    const { drawingId, handleIndex } = hitTest(px, py, drawings, chartInstanceRef.current, candleSeriesRef.current);
    if (drawingId) {
      setSelectedId(drawingId);
      const d = drawings.find(x => x.id === drawingId);
      if (d) {
        dragRef.current = {
          active: true, drawingId, handleIndex,
          startPts: d.points.map(p => ({ ...p })),
          startPt: pixelToPoint(px, py)
        };
      }
      e.stopPropagation?.();
    } else {
      setSelectedId(null);
    }
  }, [activeTool, drawings, pixelToPoint]);

  const handleCanvasMouseMove = useCallback((e) => {
    const { px, py } = getCanvasPt(e);
    const pt = pixelToPoint(px, py);
    if (!pt) return;

    if (dragRef.current.active && activeTool === 'select') {
      const { drawingId, handleIndex, startPts, startPt } = dragRef.current;
      if (!startPt) return;
      const dtime  = pt.time  - startPt.time;
      const dprice = pt.price - startPt.price;

      setDrawings(prev => prev.map(d => {
        if (d.id !== drawingId) return d;
        if (handleIndex >= 0 && handleIndex < d.points.length) {
          // Individual endpoint drag — only move the specific handle
          const newPts = d.points.map((p, i) => i === handleIndex
            ? { time: startPts[i].time + dtime, price: startPts[i].price + dprice }
            : p);
          return { ...d, points: newPts };
        } else {
          // Move entire drawing
          return { ...d, points: startPts.map(p => ({ time: p.time + dtime, price: p.price + dprice })) };
        }
      }));
      return;
    }

    if (activeTool !== 'select' && pendingPoints.length > 0 && activeTool !== 'text') {
      setPreviewDrawing({ id: '__preview__', type: activeTool, points: [...pendingPoints, pt], style: { ...drawStyle }, visible: true });
    }
  }, [activeTool, pendingPoints, pixelToPoint, drawStyle]);

  const handleCanvasMouseUp = useCallback(() => {
    if (dragRef.current.active) {
      // Commit drag — persist to backend
      const drawing = drawings.find(d => d.id === dragRef.current.drawingId);
      if (drawing) syncUpdate(drawing, currentTicker?.symbol, timeframe);
      pushHistory(drawings);
      dragRef.current = { active: false, drawingId: null, handleIndex: -1 };
    }
  }, [drawings, pushHistory, syncUpdate, currentTicker?.symbol, timeframe]);

  const handleCanvasDblClick = useCallback((e) => {
    if (activeTool !== 'select' && pendingPoints.length >= 2) {
      const { px, py } = getCanvasPt(e);
      const pt = pixelToPoint(px, py);
      const pts = pt ? [...pendingPoints, pt] : pendingPoints;
      if (pts.length >= 2) {
        const newD = { id: genId(), type: activeTool, points: pts, style: { ...drawStyle }, visible: true };
        setDrawings(prev => { pushHistory(prev); return [...prev, newD]; });
        setSelectedId(newD.id);
        setPendingPoints([]); setPreviewDrawing(null);
        syncCreate(newD, currentTicker?.symbol, timeframe);
      }
    }
  }, [activeTool, pendingPoints, pixelToPoint, drawStyle, pushHistory, syncCreate, currentTicker?.symbol, timeframe]);

  // ── Text commit ───────────────────────────────────────────────────────────
  const commitText = () => {
    if (!textInput.trim() || !textPromptPt) { setTextPromptPt(null); return; }
    const newD = { id: genId(), type: 'text', points: [textPromptPt], text: textInput, style: { ...drawStyle }, visible: true };
    setDrawings(prev => { pushHistory(prev); return [...prev, newD]; });
    setSelectedId(newD.id); setTextPromptPt(null); setTextInput(''); setActiveTool('select');
    syncCreate(newD, currentTicker?.symbol, timeframe);
  };

  const selectedDrawing = drawings.find(d => d.id === selectedId);
  const updateSelectedStyle = (key, val) => {
    setDrawings(prev => prev.map(d => d.id !== selectedId ? d : { ...d, style: { ...(d.style || {}), [key]: val } }));
    const upd = drawings.find(d => d.id === selectedId);
    if (upd) syncUpdate({ ...upd, style: { ...(upd.style || {}), [key]: val } }, currentTicker?.symbol, timeframe);
  };

  // ── Navigation ────────────────────────────────────────────────────────────
  const handleZoomIn    = () => { try { chartInstanceRef.current?.timeScale().zoomIn(); } catch (_) {} };
  const handleZoomOut   = () => { try { chartInstanceRef.current?.timeScale().zoomOut(); } catch (_) {} };
  const handleResetChart = () => { try { chartInstanceRef.current?.timeScale().fitContent(); chartInstanceRef.current?.priceScale('right').applyOptions({ autoScale: true }); } catch (_) {} };
  const handleGoToLatest = () => { try { chartInstanceRef.current?.timeScale().scrollToRealTime(); } catch (_) {} };

  const cursorStyle = activeTool === 'select' ? 'default' : 'crosshair';
  const syncIcon = syncStatus === 'synced' ? <Cloud className="w-3 h-3 text-emerald-400" />
    : syncStatus === 'error' ? <CloudOff className="w-3 h-3 text-red-400" />
    : syncStatus === 'syncing' ? <Cloud className="w-3 h-3 text-yellow-400 animate-pulse" />
    : null;

  return (
    <div className={`flex flex-col bg-[#0B0E14] text-white border border-white/10 rounded-xl overflow-hidden transition-all ${
      isMaximized ? 'fixed inset-0 z-[100] p-0' : 'relative w-full h-[520px]'
    }`}>

      {/* ── TOP TOOLBAR ──────────────────────────────────────────────────────── */}
      <div className="bg-[#161B22] px-3 py-2 border-b border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs font-mono shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-white text-sm">{currentTicker?.display || 'NIFTY 50'}</span>
            <span className="text-emerald-400 font-extrabold">
              Rs.{currentTicker?.price ? currentTicker.price.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '--'}
            </span>
            {syncIcon && <span title={'Sync: ' + syncStatus}>{syncIcon}</span>}
          </div>
          <div className="h-4 w-[1px] bg-white/10" />
          <div className="flex items-center gap-0.5 bg-[#0B0E14] p-0.5 rounded border border-white/10 overflow-x-auto">
            {TIMEFRAMES.map(tf => (
              <button key={tf.id} onClick={() => onTimeframeChange?.(tf.id)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                  timeframe === tf.id ? 'bg-[#00D4FF] text-black' : 'text-gray-400 hover:text-white'}`}>
                {tf.label}
              </button>
            ))}
          </div>
          <select value={chartType} onChange={e => setChartType(e.target.value)}
            className="bg-[#0B0E14] text-[#00D4FF] font-bold px-2 py-0.5 rounded border border-white/10 text-[10px] focus:outline-none cursor-pointer">
            {CHART_TYPES.map(ct => <option key={ct.id} value={ct.id}>{ct.label}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => isExpiredTrial ? openRechargeModal() : setShowIndicatorModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 rounded border border-purple-500/40 text-[11px] font-bold transition-all">
            <Activity className="w-3.5 h-3.5" />INDICATORS
            {isExpiredTrial && <Lock className="w-3 h-3 text-[#D4AF37]" />}
          </button>
          <button onClick={() => setShowDrawingToolbar(!showDrawingToolbar)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold border transition-all ${
              showDrawingToolbar ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'}`}>
            <Sliders className="w-3.5 h-3.5" />DRAW
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 bg-[#0B0E14] p-0.5 rounded border border-white/10">
            <button onClick={handleZoomIn}    className="px-2 py-0.5 text-gray-400 hover:text-white font-bold text-xs">+</button>
            <button onClick={handleZoomOut}   className="px-2 py-0.5 text-gray-400 hover:text-white font-bold text-xs">-</button>
            <button onClick={handleResetChart} className="px-2 py-0.5 text-cyan-400 hover:text-cyan-300 font-bold text-[10px]">Reset</button>
            <button onClick={handleGoToLatest} className="px-2 py-0.5 text-emerald-400 hover:text-emerald-300 font-bold text-[10px]">Latest</button>
          </div>
          <span className="text-[10px] font-extrabold text-[#00FF41] bg-[#00FF41]/10 px-2 py-0.5 rounded border border-[#00FF41]/30 hidden sm:flex items-center gap-1">
            <Radio className="w-3 h-3 animate-pulse" />LIVE
          </span>
          <button onClick={() => setIsMaximized(!isMaximized)}
            className="p-1.5 bg-[#00D4FF]/20 text-[#00D4FF] hover:bg-[#00D4FF]/30 rounded border border-[#00D4FF]/40 transition-all">
            {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ── DRAWING TOOLBAR ───────────────────────────────────────────────────── */}
      {showDrawingToolbar && (
        <div className="bg-[#111827] px-3 py-1.5 border-b border-white/10 flex flex-wrap items-center gap-1 text-[10px] font-mono">
          {DRAWING_TOOLS.map(tool => {
            const Icon = tool.icon;
            return (
              <button key={tool.id} title={tool.label}
                onClick={() => { setActiveTool(tool.id); setPendingPoints([]); setPreviewDrawing(null); }}
                className={`flex items-center gap-1 px-2 py-1 rounded border transition-all ${
                  activeTool === tool.id
                    ? 'bg-[#00D4FF]/20 text-[#00D4FF] border-[#00D4FF]/50 font-bold'
                    : 'bg-white/5 text-gray-400 border-white/10 hover:text-white hover:border-white/30'}`}>
                <Icon className="w-3 h-3" />
                <span className="hidden sm:inline">{tool.label}</span>
              </button>
            );
          })}
          <div className="h-4 w-[1px] bg-white/10 mx-0.5" />
          <button onClick={undo} title="Undo (Ctrl+Z)" disabled={!drawHistory.length}
            className="flex items-center gap-1 px-2 py-1 rounded border border-white/10 bg-white/5 text-gray-400 hover:text-white disabled:opacity-30">
            <Undo2 className="w-3 h-3" />
          </button>
          <button onClick={redo} title="Redo (Ctrl+Y)" disabled={!redoStack.length}
            className="flex items-center gap-1 px-2 py-1 rounded border border-white/10 bg-white/5 text-gray-400 hover:text-white disabled:opacity-30">
            <Redo2 className="w-3 h-3" />
          </button>
          <button onClick={() => setShowStylePanel(!showStylePanel)}
            className="flex items-center gap-1 px-2 py-1 rounded border border-white/10 bg-white/5 text-gray-300 hover:text-white text-[10px]">
            <span style={{ background: drawStyle.color }} className="w-3 h-3 rounded-full inline-block border border-white/30" />
            Style
          </button>
          {selectedId && (
            <button onClick={() => handleDeleteDrawing(selectedId)}
              className="flex items-center gap-1 px-2 py-1 rounded border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20">
              <Trash2 className="w-3 h-3" />Del
            </button>
          )}
          <button onClick={clearAllDrawings} className="px-2 py-1 rounded border border-red-500/20 bg-red-500/5 text-red-400 hover:bg-red-500/15 ml-auto">
            Clear All
          </button>
        </div>
      )}

      {/* Style panel */}
      {showStylePanel && (
        <div className="bg-[#0D1117] border-b border-white/10 px-4 py-2 flex flex-wrap items-center gap-4 text-[10px] font-mono text-gray-300">
          <label className="flex items-center gap-2">Color
            <input type="color" value={drawStyle.color} onChange={e => setDrawStyle(s => ({ ...s, color: e.target.value }))}
              className="w-7 h-6 rounded cursor-pointer border-0 bg-transparent" />
          </label>
          <label className="flex items-center gap-2">Width
            <input type="range" min={1} max={6} value={drawStyle.lineWidth}
              onChange={e => setDrawStyle(s => ({ ...s, lineWidth: +e.target.value }))}
              className="w-20 accent-cyan-500" />{drawStyle.lineWidth}px
          </label>
          <label className="flex items-center gap-2">Style
            <select value={drawStyle.lineStyle} onChange={e => setDrawStyle(s => ({ ...s, lineStyle: e.target.value }))}
              className="bg-[#161B22] border border-white/10 rounded px-1 py-0.5 text-white focus:outline-none">
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </select>
          </label>
          <label className="flex items-center gap-2">Fill
            <input type="range" min={0} max={0.5} step={0.01} value={drawStyle.fillOpacity}
              onChange={e => setDrawStyle(s => ({ ...s, fillOpacity: +e.target.value }))}
              className="w-16 accent-cyan-500" />
          </label>
          <button onClick={() => setShowStylePanel(false)} className="ml-auto text-gray-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── MAIN CHART AREA ───────────────────────────────────────────────────── */}
      <div className="relative flex-1 w-full bg-[#0B0E14] overflow-hidden">

        {/* OHLC HUD */}
        {candlesData.length > 0 && (
          <div className="absolute top-2 left-2 z-10 bg-[#0B0E14]/80 backdrop-blur-sm p-2 rounded border border-white/10 text-[10px] font-mono pointer-events-none space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-white">{currentTicker?.display || 'NIFTY'}</span>
              <span className="text-[#00D4FF] font-bold">{timeframe.toUpperCase()}</span>
              <span className="text-gray-400 uppercase">({chartType})</span>
            </div>
            {(() => {
              const a = hoveredCandle || candlesData[candlesData.length - 1];
              if (!a) return null;
              const open  = typeof a.open  === 'number' ? a.open  : a.value || 0;
              const high  = typeof a.high  === 'number' ? a.high  : open;
              const low   = typeof a.low   === 'number' ? a.low   : open;
              const close = typeof a.close === 'number' ? a.close : open;
              const diff = close - open;
              const pct  = open > 0 ? (diff / open) * 100 : 0;
              const isUp = diff >= 0;
              return (
                <div className="flex items-center gap-2 flex-wrap">
                  <span>O <b className="text-gray-200">{open.toFixed(2)}</b></span>
                  <span>H <b className="text-gray-200">{high.toFixed(2)}</b></span>
                  <span>L <b className="text-gray-200">{low.toFixed(2)}</b></span>
                  <span>C <b className="text-gray-200">{close.toFixed(2)}</b></span>
                  <span className={'font-bold ' + (isUp ? 'text-[#00FF41]' : 'text-[#FF3131]')}>
                    {isUp ? '+' : ''}{diff.toFixed(2)} ({isUp ? '+' : ''}{pct.toFixed(2)}%)
                  </span>
                </div>
              );
            })()}
          </div>
        )}

        {isFetchingOlderRef.current && (
          <div className="absolute top-2 right-2 z-10 bg-[#00D4FF]/20 text-[#00D4FF] border border-[#00D4FF]/40 px-2 py-0.5 rounded text-[9px] font-mono font-bold animate-pulse pointer-events-none">
            FETCHING HISTORICAL DATA...
          </div>
        )}

        {activeTool !== 'select' && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 bg-[#1A1F2E]/90 text-[#00D4FF] border border-[#00D4FF]/30 px-3 py-1 rounded text-[10px] font-mono font-bold pointer-events-none">
            {activeTool === 'text' ? 'Click chart to place text' :
             pendingPoints.length === 0 ? 'Click to set first point' :
             pendingPoints.length + ' point(s) set — click to ' + (
               (TWO_POINT_TOOLS.includes(activeTool) && pendingPoints.length >= 1) ||
               (THREE_POINT_TOOLS.includes(activeTool) && pendingPoints.length >= 2) ? 'complete' : 'add next'
             ) + ' (or dbl-click to finish)'}
          </div>
        )}

        {(candleError || candlesData.length === 0) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-[#0B0E14]/90 z-20 space-y-3">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-amber-400 animate-pulse" />
            </div>
            <h3 className="text-sm font-black text-amber-300 uppercase tracking-wider">
              {currentTicker?.price ? 'CANDLE FEED TEMPORARILY UNAVAILABLE' : 'LIVE MARKET DATA TEMPORARILY UNAVAILABLE'}
            </h3>
          </div>
        )}

        <div ref={containerRef} className="w-full h-full" />

        {/* Drawing Canvas */}
        <canvas ref={canvasRef}
          className="absolute inset-0 z-[5] pointer-events-auto"
          style={{ cursor: cursorStyle }}
          onClick={handleCanvasClick}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onDoubleClick={handleCanvasDblClick}
          onTouchStart={e => { handleCanvasMouseDown(e); }}
          onTouchMove={e => { e.preventDefault(); handleCanvasMouseMove(e); }}
          onTouchEnd={handleCanvasMouseUp}
        />
      </div>

      {/* ── Text Prompt Modal ─────────────────────────────────────────────────── */}
      {textPromptPt && (
        <div className="absolute inset-0 z-[50] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-[#161B22] border border-white/20 rounded-xl p-5 w-72 space-y-3 shadow-2xl">
            <h3 className="font-bold text-sm text-white">Add Text Label</h3>
            <input autoFocus type="text" value={textInput}
              onChange={e => setTextInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && commitText()}
              placeholder="e.g. Strong Resistance"
              className="w-full bg-[#0B0E14] border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#00D4FF]" />
            <div className="flex gap-2">
              <button onClick={commitText} className="flex-1 py-2 bg-[#00D4FF] text-black font-bold text-xs rounded-lg hover:bg-cyan-400">Place</button>
              <button onClick={() => setTextPromptPt(null)} className="px-3 py-2 bg-white/5 text-gray-400 border border-white/10 rounded-lg hover:text-white"><X className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      )}

      {/* ── Selected drawing quick-style bar ─────────────────────────────────── */}
      {selectedDrawing && (
        <div className="absolute bottom-0 left-0 right-0 z-[8] bg-[#0D1117]/95 border-t border-white/10 px-4 py-2 flex items-center gap-4 text-[10px] font-mono text-gray-300">
          <span className="text-[#00D4FF] font-bold uppercase">{selectedDrawing.type}</span>
          <input type="color" value={selectedDrawing.style?.color || '#00D4FF'}
            onChange={e => updateSelectedStyle('color', e.target.value)}
            className="w-6 h-5 rounded cursor-pointer border-0 bg-transparent" />
          <select value={selectedDrawing.style?.lineStyle || 'solid'}
            onChange={e => updateSelectedStyle('lineStyle', e.target.value)}
            className="bg-[#161B22] border border-white/10 rounded px-1 text-white focus:outline-none">
            <option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option>
          </select>
          <label className="flex items-center gap-1">W
            <input type="range" min={1} max={6} value={selectedDrawing.style?.lineWidth || 2}
              onChange={e => updateSelectedStyle('lineWidth', +e.target.value)}
              className="w-16 accent-cyan-500" />
          </label>
          <button onClick={() => handleDeleteDrawing(selectedId)}
            className="ml-auto flex items-center gap-1 px-2 py-1 rounded bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30">
            <Trash2 className="w-3 h-3" />Delete
          </button>
          <button onClick={() => setSelectedId(null)} className="text-gray-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* ── Indicator Modal ───────────────────────────────────────────────────── */}
      {showIndicatorModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[120] flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-white/20 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-purple-400" />Technical Indicators
              </h3>
              <button onClick={() => setShowIndicatorModal(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-2 text-xs font-mono max-h-[300px] overflow-y-auto pr-1">
              {[
                { id: 'ema20', name: 'EMA 20' }, { id: 'ema50', name: 'EMA 50' },
                { id: 'vwap', name: 'VWAP' }, { id: 'bollinger', name: 'Bollinger Bands (20, 2)' }
              ].map(ind => (
                <label key={ind.id} className="flex items-center justify-between p-2 rounded bg-[#0B0E14] border border-white/5 cursor-pointer hover:border-white/20">
                  <span className="text-gray-300">{ind.name}</span>
                  <input type="checkbox" checked={!!activeIndicators[ind.id]}
                    onChange={() => setActiveIndicators(p => ({ ...p, [ind.id]: !p[ind.id] }))}
                    className="accent-purple-500 w-4 h-4" />
                </label>
              ))}
            </div>
            <button onClick={() => setShowIndicatorModal(false)} className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs">Apply</button>
          </div>
        </div>
      )}
    </div>
  );
}
