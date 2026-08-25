'use client';

import React, { useEffect, useRef, useState, useCallback, memo } from 'react';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  AreaSeries,
  BaselineSeries,
  ColorType,
  CrosshairMode,
  LineStyle
} from 'lightweight-charts';
import {
  TrendingUp, Activity, BarChart2, Eye, EyeOff, Settings,
  Trash2, Plus, RefreshCw, ZoomIn, ZoomOut, Maximize2, Minimize2,
  Sliders, Layers, Sparkles, ChevronDown, Check, ShieldCheck, ArrowRight,
  Clock
} from 'lucide-react';
import { socket } from '../utils/socketClient';
import IndicatorManagerModal from './chart/IndicatorManagerModal';
import { INDICATOR_REGISTRY } from '../utils/indicators/index';
import { UNIVERSAL_INDICATORS } from '../utils/indicators/framework';

// ─── TELEMETRY LOGGER ───────────────────────────────────────────────────────
const logTelemetry = (tag, message, data) => {
  if (typeof window !== 'undefined') {
    console.log(`%c[${tag}]`, 'color: #00D4FF; font-weight: bold;', message, data || '');
  }
};

// ─── SAFE SERIES CREATION HELPERS (LWC v5.x) ────────────────────────────────
function safeAddSeries(chart, seriesType, options = {}) {
  if (!chart || !seriesType) return null;
  try {
    if (typeof chart.addSeries === 'function') {
      const s = chart.addSeries(seriesType, options);
      logTelemetry('SERIES_CREATE', `Created series: ${seriesType?.name || 'Series'} on scale: ${options?.priceScaleId || 'right'}`);
      return s;
    }
  } catch (err) {
    logTelemetry('INDICATOR_ERROR', `Failed to create series: ${err.message}`);
  }
  return null;
}

function safeRemoveSeries(chart, series) {
  if (!chart || !series) return;
  try {
    chart.removeSeries(series);
    logTelemetry('SERIES_REMOVE', 'Removed series safely');
  } catch (err) {
    logTelemetry('INDICATOR_ERROR', `Ignored safe remove error: ${err.message}`);
  }
}

// ─── IST MARKET TIME HELPERS ────────────────────────────────────────────────
function isNSEMarketOpen() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffset + now.getTimezoneOffset() * 60 * 1000);
  const day = istDate.getDay();
  if (day === 0 || day === 6) return false;

  const hours = istDate.getHours();
  const minutes = istDate.getMinutes();
  const totalMins = hours * 60 + minutes;
  return totalMins >= 555 && totalMins <= 930;
}

function formatISTTime(unixSeconds) {
  if (!unixSeconds) return '--';
  const d = new Date(unixSeconds * 1000);
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

const TIMEFRAME_OPTIONS = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1D'];

function TradingViewChartComponent({
  currentTicker,
  tickers = [],
  timeframe = '5m',
  onTimeframeChange,
  fetchKlines,
  subscribeKline
}) {
  const rootContainerRef = useRef(null);
  const chartContainerRef = useRef(null);
  const canvasOverlayRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);

  // DOM node references for Top Bar & Top-Left HUD (Zero React re-renders on live ticks & scroll)
  const topBarPriceRef = useRef(null);
  const topBarChangeRef = useRef(null);
  const historicalBadgeRef = useRef(null);

  const hudTimeRef = useRef(null);
  const hudOpenRef = useRef(null);
  const hudHighRef = useRef(null);
  const hudLowRef = useRef(null);
  const hudCloseRef = useRef(null);
  const hudVolRef = useRef(null);
  const hudDiffRef = useRef(null);

  // Viewport & Scroll state preservation
  const isUserAtRealtimeRef = useRef(true);
  const lastTotalBarsRef = useRef(0);
  const lastLiveCandleRef = useRef(null);
  const currentLoadedRef = useRef({ symbol: null, timeframe: null });
  const rafPendingRef = useRef(false);
  const scrollRafPendingRef = useRef(false);
  const indicatorRafPendingRef = useRef(false);

  // Historical pagination refs
  const isFetchingOlderCandlesRef = useRef(false);
  const hasMoreHistoryRef = useRef(true);

  // Master Generation Guard for Async Indicator Calculations
  const renderGenerationRef = useRef(0);

  // Master Global Tracking Set of ALL Indicator Series attached to chart
  const allTrackedIndicatorSeriesRef = useRef(new Set());

  // Authoritative Registry: instanceId -> { seriesList: [], priceScaleId: null, indicator: obj }
  const indicatorSeriesRegistryRef = useRef(new Map());

  // Cached candles data for indicator calculations
  const rawCandlesRef = useRef([]);

  // Dimensions tracking
  const dimensionsRef = useRef({ width: 800, height: 500 });

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isIndicatorModalOpen, setIsIndicatorModalOpen] = useState(false);

  // Active indicators state
  const [activeIndicators, setActiveIndicators] = useState([]);
  
  // Authoritative Mutable Ref for activeIndicators to guarantee zero-closure race conditions
  const activeIndicatorsRef = useRef([]);
  activeIndicatorsRef.current = activeIndicators;

  // SMC & Drawing Data
  const smcDataRef = useRef({
    orderBlocks: { bullishOBs: [], bearishOBs: [] },
    fvgs: { bullishFVGs: [], bearishFVGs: [] },
    bosChoch: { structureLevels: [] },
    orb: null,
    trendlines: [],
    pivots: null
  });

  // Fast DOM-based HUD updater (Zero React component re-renders)
  const updateHudDOM = useCallback((bar) => {
    if (!bar) return;
    if (hudTimeRef.current) hudTimeRef.current.textContent = formatISTTime(bar.time);
    if (hudOpenRef.current) hudOpenRef.current.textContent = bar.open ? Number(bar.open).toFixed(2) : '--';
    if (hudHighRef.current) hudHighRef.current.textContent = bar.high ? Number(bar.high).toFixed(2) : '--';
    if (hudLowRef.current) hudLowRef.current.textContent = bar.low ? Number(bar.low).toFixed(2) : '--';
    if (hudCloseRef.current) hudCloseRef.current.textContent = bar.close ? Number(bar.close).toFixed(2) : '--';
    if (hudVolRef.current) hudVolRef.current.textContent = bar.volume ? Number(bar.volume).toLocaleString() : '0';

    if (hudDiffRef.current && bar.open && bar.close) {
      const diff = bar.close - bar.open;
      const pct = (diff / bar.open) * 100;
      const isPos = diff >= 0;
      hudDiffRef.current.textContent = `${isPos ? '+' : ''}${diff.toFixed(2)} (${pct.toFixed(2)}%)`;
      hudDiffRef.current.className = `font-bold ${isPos ? 'text-[#00E676]' : 'text-[#FF5252]'}`;
    }
  }, []);

  // ─── 1. USER SETTINGS PERSISTENCE ──────────────────────────────────────────
  const saveUserSettings = useCallback((newIndicators) => {
    const sym = currentTicker?.symbol || 'NIFTY';
    const tf = timeframe || '5m';
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(`ht_chart_ind_${sym}_${tf}`, JSON.stringify(newIndicators));
        localStorage.setItem('ht_chart_active_indicators', JSON.stringify(newIndicators));
      }
    } catch (e) {
      console.warn('Failed to save user chart settings:', e);
    }
  }, [currentTicker?.symbol, timeframe]);

  // Restore user saved indicators on mount or symbol/timeframe switch
  useEffect(() => {
    const sym = currentTicker?.symbol || 'NIFTY';
    const tf = timeframe || '5m';
    try {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem(`ht_chart_ind_${sym}_${tf}`) || localStorage.getItem('ht_chart_active_indicators');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setActiveIndicators(parsed);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load user chart settings:', e);
    }
  }, [currentTicker?.symbol, timeframe]);

  // ─── 2. CLEAR ALL INDICATOR RENDERING (AUTHORITATIVE PURGE) ───────────────
  const clearAllIndicatorRendering = useCallback(() => {
    logTelemetry('INDICATOR_PURGE', 'Clearing ALL indicator series, subpanes, and overlays from chart');
    const chart = chartInstanceRef.current;

    // 1. Increment generation guard to cancel any in-flight calculations
    renderGenerationRef.current++;

    // 2. Remove EVERY tracked indicator series from Lightweight Charts
    if (chart) {
      allTrackedIndicatorSeriesRef.current.forEach((s) => {
        try {
          chart.removeSeries(s);
        } catch (e) {}
      });
      allTrackedIndicatorSeriesRef.current.clear();
      indicatorSeriesRegistryRef.current.clear();

      // 3. Reset main price scale margins to clean default
      try {
        chart.priceScale('right').applyOptions({
          scaleMargins: { top: 0.08, bottom: 0.20 }
        });
      } catch (e) {}
    }

    // 4. Clear all SMC data refs
    smcDataRef.current = {};

    // 5. Clear overlay canvas completely
    const canvas = canvasOverlayRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, dimensionsRef.current.width, dimensionsRef.current.height);
    }
  }, []);

  // ─── 3. CANVAS OVERLAYS: UNIVERSAL INDICATOR DISPATCHER ───────────────────
  const drawCanvasOverlays = useCallback(() => {
    const canvas = canvasOverlayRef.current;
    const chart = chartInstanceRef.current;
    const series = candleSeriesRef.current;
    if (!canvas || !chart || !series) return;

    const ctx = canvas.getContext('2d');
    const width = dimensionsRef.current.width;
    const height = dimensionsRef.current.height;
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;

    // Ensure physical canvas backing resolution matches CSS dimensions * DPR
    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    }

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const visibleActive = activeIndicatorsRef.current.filter(i => i && i.visible);
    if (visibleActive.length === 0) {
      ctx.restore();
      return;
    }

    const timeScale = chart.timeScale();

    // Dispatch each active overlay indicator via the Universal Indicator Framework
    visibleActive.forEach(ind => {
      const def = UNIVERSAL_INDICATORS[ind.indicatorId];
      if (def && typeof def.renderCanvas === 'function') {
        const overlayData = smcDataRef.current[ind.indicatorId];
        def.renderCanvas(ctx, timeScale, series, overlayData, ind, { width, height });
      }
    });

    ctx.restore();
  }, []);

  // ─── 4. RECONCILE INDICATOR SERIES (UNIVERSAL ENGINE DISPATCHER) ───────────
  const reconcileIndicatorSeries = useCallback((candles, indicators = null) => {
    const chart = chartInstanceRef.current;
    if (!chart) return;

    const currentIndicators = indicators !== null ? indicators : activeIndicatorsRef.current;
    const currentGen = ++renderGenerationRef.current;
    const validActive = (currentIndicators || []).filter(i => i && i.visible);
    const validInstanceIds = new Set(validActive.map(i => i.instanceId));
    const registry = indicatorSeriesRegistryRef.current;

    if (validActive.length === 0) {
      clearAllIndicatorRendering();
      return;
    }

    // PURGE: Remove any rendered series whose instanceId is NOT in validActive
    registry.forEach((res, instanceId) => {
      if (!validInstanceIds.has(instanceId)) {
        (res.seriesList || []).forEach(s => {
          safeRemoveSeries(chart, s);
          allTrackedIndicatorSeriesRef.current.delete(s);
        });
        registry.delete(instanceId);
      }
    });

    const candleList = candles || rawCandlesRef.current;
    if (!candleList || candleList.length === 0) return;

    // Multi-pane scale margin allocator
    const visibleSubPanes = validActive.filter(ind => {
      const def = UNIVERSAL_INDICATORS[ind.indicatorId];
      return def ? !def.isOverlay : !ind.isOverlay;
    });
    const subPaneCount = visibleSubPanes.length;
    const subPaneHeight = subPaneCount > 0 ? 0.32 / subPaneCount : 0;

    // Adjust main price scale margin according to sub-pane count
    try {
      chart.priceScale('right').applyOptions({
        scaleMargins: {
          top: 0.05,
          bottom: subPaneCount > 0 ? Math.min(0.48, 0.12 + subPaneCount * 0.14) : 0.08
        }
      });
    } catch (e) {}

    let currentSubPaneIndex = 0;

    // CREATE / UPDATE each active visible indicator via Universal Framework
    validActive.forEach(ind => {
      if (currentGen !== renderGenerationRef.current) return;
      const def = UNIVERSAL_INDICATORS[ind.indicatorId];
      if (!def) return;

      try {
        const data = def.calculate(candleList, ind.inputs, {
          symbol: currentTicker?.symbol || 'NIFTY',
          timeframe: timeframe || '5m'
        });

        // Series Indicator
        if (typeof def.renderSeries === 'function') {
          const isOverlay = def.isOverlay;
          let scaleId = 'right';
          if (!isOverlay) {
            scaleId = `pane_${ind.instanceId}`;
            const topMargin = 0.65 + currentSubPaneIndex * subPaneHeight;
            const bottomMargin = 0.02 + (subPaneCount - 1 - currentSubPaneIndex) * subPaneHeight;
            currentSubPaneIndex++;
            try {
              chart.priceScale(scaleId).applyOptions({
                scaleMargins: { top: Math.min(0.92, topMargin), bottom: Math.max(0.02, bottomMargin) },
                autoScale: true
              });
            } catch (e) {}
          }
          const createdSeries = def.renderSeries(chart, registry, data, ind, scaleId, {
            LineSeries,
            HistogramSeries,
            safeAddSeries,
            LineStyle
          });
          (createdSeries || []).forEach(s => allTrackedIndicatorSeriesRef.current.add(s));
        }

        // Canvas Overlay Indicator
        if (typeof def.renderCanvas === 'function') {
          smcDataRef.current[ind.indicatorId] = data;
        }
      } catch (err) {
        logTelemetry('INDICATOR_ERROR', `Error updating indicator ${ind.indicatorId}: ${err.message}`);
      }
    });

    drawCanvasOverlays();
  }, [clearAllIndicatorRendering, drawCanvasOverlays]);

  // ─── 5. HISTORICAL PAGINATION (PREPEND OLDER CANDLES ON SCROLL TO LEFT EDGE) ─
  const fetchOlderHistoricalCandles = useCallback(async () => {
    const candles = rawCandlesRef.current;
    if (!candles || candles.length === 0 || isFetchingOlderCandlesRef.current || !hasMoreHistoryRef.current) return;
    const oldestTimestamp = candles[0].time;

    isFetchingOlderCandlesRef.current = true;
    logTelemetry('HISTORY_PREPEND', `Fetching older candles before timestamp ${oldestTimestamp}`);

    try {
      const symbol = currentTicker?.symbol || 'NIFTY';
      const tf = timeframe || '5m';
      const olderCandles = await fetchKlines(symbol, tf, 500, oldestTimestamp);

      if (olderCandles && olderCandles.length > 0) {
        const existingTimes = new Set(candles.map(c => c.time));
        const newOlder = olderCandles.filter(c => !existingTimes.has(c.time));

        if (newOlder.length > 0) {
          const combined = [...newOlder, ...candles].sort((a, b) => a.time - b.time);
          const barsAdded = combined.length - candles.length;
          rawCandlesRef.current = combined;
          lastTotalBarsRef.current = combined.length;

          // Update candlestick & volume series
          if (candleSeriesRef.current) {
            candleSeriesRef.current.setData(combined);
          }
          if (volumeSeriesRef.current) {
            const volData = combined.map(c => ({
              time: c.time,
              value: c.volume || 0,
              color: c.close >= c.open ? 'rgba(0, 230, 118, 0.4)' : 'rgba(255, 82, 82, 0.4)'
            }));
            volumeSeriesRef.current.setData(volData);
          }

          // Shift visible range SYNCHRONOUSLY by barsAdded so user's visual position DOES NOT JUMP!
          if (chartInstanceRef.current) {
            const currentRange = chartInstanceRef.current.timeScale().getVisibleLogicalRange();
            if (currentRange) {
              chartInstanceRef.current.timeScale().setVisibleLogicalRange({
                from: currentRange.from + barsAdded,
                to: currentRange.to + barsAdded
              });
            }
          }

          // Reconcile indicators with extended candle array using activeIndicatorsRef.current
          reconcileIndicatorSeries(combined, activeIndicatorsRef.current);
        } else {
          hasMoreHistoryRef.current = false;
        }
      } else {
        hasMoreHistoryRef.current = false;
      }
    } catch (err) {
      console.warn('Failed to paginate historical candles:', err);
    } finally {
      isFetchingOlderCandlesRef.current = false;
    }
  }, [currentTicker?.symbol, timeframe, fetchKlines, reconcileIndicatorSeries]);

  // ─── 6. INITIALIZE LIGHTWEIGHT CHART INSTANCE ONCE ON MOUNT ────────────────
  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    logTelemetry('CHART_CREATE', 'Initializing single persistent Lightweight Chart instance');

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;
    dimensionsRef.current = { width, height };

    const chart = createChart(container, {
      width,
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
        fontSize: 11,
        fontFamily: 'Inter, -apple-system, system-ui, sans-serif'
      },
      localization: {
        locale: 'en-IN',
        dateFormat: "dd MMM ''yy",
        timeFormatter: (unixSeconds) => {
          if (!unixSeconds) return '';
          const d = new Date(unixSeconds * 1000);
          return d.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit',
            month: 'short',
            year: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          }).replace(',', '');
        }
      },
      grid: {
        vertLines: { color: 'rgba(51, 65, 85, 0.25)', style: 1 },
        horzLines: { color: 'rgba(51, 65, 85, 0.25)', style: 1 }
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#38bdf8',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#0284c7',
          labelVisible: true
        },
        horzLine: {
          color: '#38bdf8',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#0284c7',
          labelVisible: true
        }
      },
      rightPriceScale: {
        borderColor: 'rgba(51, 65, 85, 0.4)',
        scaleMargins: { top: 0.08, bottom: 0.20 },
        autoScale: true
      },
      timeScale: {
        borderColor: 'rgba(51, 65, 85, 0.4)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 8,
        minBarSpacing: 3,
        tickMarkFormatter: (time) => {
          const d = new Date(time * 1000);
          return d.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          });
        }
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true }
    });

    // Create Persistent Main Candlestick Series
    const candleSeries = safeAddSeries(chart, CandlestickSeries, {
      upColor: '#00E676',
      downColor: '#FF5252',
      borderUpColor: '#00E676',
      borderDownColor: '#FF5252',
      wickUpColor: '#00E676',
      wickDownColor: '#FF5252'
    });

    // Create Persistent Volume Histogram Series
    const volumeSeries = safeAddSeries(chart, HistogramSeries, {
      color: '#38bdf8',
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol_scale'
    });
    if (volumeSeries) {
      try {
        chart.priceScale('vol_scale').applyOptions({
          scaleMargins: { top: 0.85, bottom: 0.01 }
        });
      } catch (e) {}
    }

    chartInstanceRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    // ─── VIEWPORT & SCROLL TRACKING & PAGINATION TRIGGER ───────────────────
    chart.timeScale().subscribeVisibleLogicalRangeChange((logicalRange) => {
      if (!logicalRange) return;
      const totalBars = lastTotalBarsRef.current;
      if (totalBars > 0) {
        const atRealtime = logicalRange.to >= (totalBars - 3);
        isUserAtRealtimeRef.current = atRealtime;
        // Direct DOM update (Zero React re-render or layout reflow)
        if (historicalBadgeRef.current) {
          historicalBadgeRef.current.style.display = atRealtime ? 'none' : 'flex';
        }
      }

      // If user scrolls close to the left boundary (< 20 bars), trigger historical pagination
      if (logicalRange.from < 20 && !isFetchingOlderCandlesRef.current && hasMoreHistoryRef.current) {
        fetchOlderHistoricalCandles();
      }

      if (!scrollRafPendingRef.current) {
        scrollRafPendingRef.current = true;
        requestAnimationFrame(() => {
          scrollRafPendingRef.current = false;
          drawCanvasOverlays();
        });
      }
    });

    // ─── CROSSHAIR & TOP-LEFT HUD LISTENER ──────────────────────────────────
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time || !param.seriesData || !candleSeriesRef.current) {
        if (lastLiveCandleRef.current) {
          updateHudDOM(lastLiveCandleRef.current);
        }
        return;
      }

      const bar = param.seriesData.get(candleSeriesRef.current);
      if (bar) {
        updateHudDOM({
          time: param.time,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume || 0
        });
      }
    });

    // ─── RESIZE OBSERVER (SIZE CANVAS ONLY ON ACTUAL RESIZE) ────────────────
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width: newW, height: newH } = entries[0].contentRect;
      if (newW > 0 && newH > 0) {
        dimensionsRef.current = { width: newW, height: newH };
        if (chartInstanceRef.current) {
          try {
            chartInstanceRef.current.applyOptions({ width: newW, height: newH });
          } catch (e) {}
        }
        if (canvasOverlayRef.current) {
          const dpr = window.devicePixelRatio || 1;
          canvasOverlayRef.current.width = newW * dpr;
          canvasOverlayRef.current.height = newH * dpr;
          const ctx = canvasOverlayRef.current.getContext('2d');
          ctx.scale(dpr, dpr);
          drawCanvasOverlays();
        }
      }
    });
    // ─── POINTER & DRAG LISTENERS FOR REAL-TIME VERTICAL/HORIZONTAL SYNCHRONIZATION ───
    const triggerInstantOverlayRedraw = () => {
      if (!scrollRafPendingRef.current) {
        scrollRafPendingRef.current = true;
        requestAnimationFrame(() => {
          scrollRafPendingRef.current = false;
          drawCanvasOverlays();
        });
      }
    };

    container.addEventListener('pointerdown', triggerInstantOverlayRedraw);
    window.addEventListener('pointermove', triggerInstantOverlayRedraw);
    window.addEventListener('pointerup', triggerInstantOverlayRedraw);
    container.addEventListener('wheel', triggerInstantOverlayRedraw, { passive: true });

    return () => {
      container.removeEventListener('pointerdown', triggerInstantOverlayRedraw);
      window.removeEventListener('pointermove', triggerInstantOverlayRedraw);
      window.removeEventListener('pointerup', triggerInstantOverlayRedraw);
      container.removeEventListener('wheel', triggerInstantOverlayRedraw);
      resizeObserver.disconnect();
      if (chartInstanceRef.current) {
        try {
          chartInstanceRef.current.remove();
        } catch (e) {}
        chartInstanceRef.current = null;
      }
    };
  }, [drawCanvasOverlays]); // Run ONCE on mount with drawCanvasOverlays ref

  // ─── 7. HISTORICAL DATA LOADER ────────────────────────────────────────────
  const loadHistoricalCandles = useCallback(async (sym, tf) => {
    if (!fetchKlines || !candleSeriesRef.current) return;
    hasMoreHistoryRef.current = true;
    logTelemetry('HISTORY_FETCH', `Loading historical candles for ${sym} on ${tf}`);

    try {
      const klines = await fetchKlines(sym, tf, 500);

      if (klines && klines.length > 0) {
        const sorted = [...klines].sort((a, b) => a.time - b.time);
        rawCandlesRef.current = sorted;
        lastTotalBarsRef.current = sorted.length;

        // Set series data
        if (candleSeriesRef.current) {
          candleSeriesRef.current.setData(sorted);
        }

        if (volumeSeriesRef.current) {
          const volData = sorted.map(c => ({
            time: c.time,
            value: c.volume || 0,
            color: c.close >= c.open ? 'rgba(0, 230, 118, 0.4)' : 'rgba(255, 82, 82, 0.4)'
          }));
          volumeSeriesRef.current.setData(volData);
        }

        // Set HUD to latest historical candle
        const lastBar = sorted[sorted.length - 1];
        lastLiveCandleRef.current = lastBar;
        updateHudDOM(lastBar);

        // Reconcile indicators with newly loaded candle dataset
        reconcileIndicatorSeries(sorted, activeIndicatorsRef.current);

        // Initial fitContent on symbol or timeframe switch
        if (chartInstanceRef.current) {
          try {
            chartInstanceRef.current.timeScale().fitContent();
          } catch (e) {}
        }
      }
    } catch (e) {
      logTelemetry('INDICATOR_ERROR', `Failed to load historical candles: ${e.message}`);
    }
  }, [fetchKlines, reconcileIndicatorSeries, updateHudDOM]);

  // Trigger historical load ONLY when symbol or timeframe genuinely changes
  const activeSymbol = currentTicker?.symbol || 'NIFTY';
  useEffect(() => {
    if (currentLoadedRef.current.symbol === activeSymbol && currentLoadedRef.current.timeframe === timeframe) {
      return;
    }
    currentLoadedRef.current = { symbol: activeSymbol, timeframe: timeframe };
    loadHistoricalCandles(activeSymbol, timeframe);
  }, [activeSymbol, timeframe, loadHistoricalCandles]);

  // ─── 8. REAL-TIME CANDLE STREAMING (ZERO VIEWPORT MANIPULATION) ───────────
  useEffect(() => {
    const symbol = currentTicker?.symbol || 'NIFTY';
    const tf = timeframe || '5m';
    if (!candleSeriesRef.current) return;

    const onCandleUpdate = (payload) => {
      if (!payload || payload.symbol !== symbol || payload.timeframe.toLowerCase() !== tf.toLowerCase()) return;
      const c = payload.candle;
      if (!c || !c.time) return;

      logTelemetry('CANDLE_UPDATE', `Received live tick for ${payload.symbol} ${tf}`, c);

      // Incremental series update (Zero DOM recreation, zero viewport manipulation)
      try {
        if (candleSeriesRef.current) {
          candleSeriesRef.current.update(c);
        }

        if (volumeSeriesRef.current) {
          volumeSeriesRef.current.update({
            time: c.time,
            value: c.volume || 0,
            color: c.close >= c.open ? 'rgba(0, 230, 118, 0.4)' : 'rgba(255, 82, 82, 0.4)'
          });
        }
      } catch (e) {}

      // Update in-memory candles cache
      const list = rawCandlesRef.current;
      const last = list[list.length - 1];
      if (last && last.time === c.time) {
        list[list.length - 1] = c;
      } else if (!last || c.time > last.time) {
        list.push(c);
        lastTotalBarsRef.current = list.length;
      }

      // Update HUD and live candle reference
      lastLiveCandleRef.current = c;
      updateHudDOM(c);

      // Update top control bar price DOM elements directly (Zero React re-render)
      if (topBarPriceRef.current) {
        topBarPriceRef.current.textContent = `₹${Number(c.close).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
      }

      // Throttled live indicator calculation update (Zero main-thread blocking)
      if (activeIndicatorsRef.current.length > 0 && !indicatorRafPendingRef.current) {
        indicatorRafPendingRef.current = true;
        requestAnimationFrame(() => {
          indicatorRafPendingRef.current = false;
          try {
            reconcileIndicatorSeries(rawCandlesRef.current, activeIndicatorsRef.current);
          } catch (e) {}
        });
      }

      // Throttled canvas overlay redraw
      if (!rafPendingRef.current) {
        rafPendingRef.current = true;
        requestAnimationFrame(() => {
          rafPendingRef.current = false;
          drawCanvasOverlays();
        });
      }
    };

    socket.on('smde:candle_update', onCandleUpdate);

    return () => {
      socket.off('smde:candle_update', onCandleUpdate);
    };
  }, [currentTicker?.symbol, timeframe, drawCanvasOverlays, updateHudDOM]);

  // Re-run indicators reconciliation when activeIndicators state changes
  useEffect(() => {
    if (activeIndicators.length === 0) {
      clearAllIndicatorRendering();
    } else if (rawCandlesRef.current.length > 0) {
      reconcileIndicatorSeries(rawCandlesRef.current, activeIndicators);
    }
  }, [activeIndicators, clearAllIndicatorRendering, reconcileIndicatorSeries]);

  // ─── 9. FULLSCREEN HANDLER (NATIVE BROWSER API) ───────────────────────────
  const toggleFullscreen = useCallback(() => {
    const elem = rootContainerRef.current;
    if (!elem) return;

    if (!document.fullscreenElement) {
      if (elem.requestFullscreen) {
        elem.requestFullscreen().catch(err => console.warn('Fullscreen failed:', err));
      } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(err => console.warn('Exit fullscreen failed:', err));
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      const isFs = !!document.fullscreenElement;
      setIsFullscreen(isFs);
      if (chartContainerRef.current && chartInstanceRef.current) {
        const { clientWidth, clientHeight } = chartContainerRef.current;
        dimensionsRef.current = { width: clientWidth, height: clientHeight };
        chartInstanceRef.current.applyOptions({ width: clientWidth, height: clientHeight });
        if (canvasOverlayRef.current) {
          const dpr = window.devicePixelRatio || 1;
          canvasOverlayRef.current.width = clientWidth * dpr;
          canvasOverlayRef.current.height = clientHeight * dpr;
          const ctx = canvasOverlayRef.current.getContext('2d');
          ctx.scale(dpr, dpr);
        }
        drawCanvasOverlays();
      }
    };

    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, [drawCanvasOverlays]);

  // ─── 10. ZOOM & VIEWPORT ANALYSIS CONTROLS ────────────────────────────────
  const handleZoomIn = () => {
    if (!chartInstanceRef.current) return;
    try {
      const ts = chartInstanceRef.current.timeScale();
      const currentSpacing = ts.options ? ts.options().barSpacing : 8;
      ts.applyOptions({ barSpacing: Math.min(60, (currentSpacing || 8) * 1.3) });
    } catch (e) {}
  };

  const handleZoomOut = () => {
    if (!chartInstanceRef.current) return;
    try {
      const ts = chartInstanceRef.current.timeScale();
      const currentSpacing = ts.options ? ts.options().barSpacing : 8;
      ts.applyOptions({ barSpacing: Math.max(1, (currentSpacing || 8) * 0.7) });
    } catch (e) {}
  };

  const handleFitContent = () => {
    if (!chartInstanceRef.current) return;
    try {
      chartInstanceRef.current.timeScale().fitContent();
    } catch (e) {}
  };

  const handleGoToRealtime = () => {
    if (!chartInstanceRef.current) return;
    try {
      chartInstanceRef.current.timeScale().scrollToRealTime();
      isUserAtRealtimeRef.current = true;
      if (historicalBadgeRef.current) {
        historicalBadgeRef.current.style.display = 'none';
      }
    } catch (e) {}
  };

  // ─── 11. AUTHORITATIVE INDICATOR MANAGEMENT HANDLERS ──────────────────────
  const handleAddIndicator = (arg) => {
    const indId = typeof arg === 'string' ? arg : (arg?.id || arg?.indicatorId);
    const meta = INDICATOR_REGISTRY.find(m => m.id === indId) || (typeof arg === 'object' ? arg : null);
    if (!meta) {
      logTelemetry('INDICATOR_ERROR', `Indicator not found in registry: ${indId}`);
      return;
    }

    logTelemetry('INDICATOR_ADD', `Adding indicator: ${meta.name} (id: ${meta.id})`);
    const newInst = {
      instanceId: `ind_${meta.id}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      indicatorId: meta.id,
      name: meta.name,
      shortName: meta.shortName || meta.name,
      category: meta.category,
      isOverlay: meta.isOverlay,
      visible: true,
      inputs: { ...(meta.defaultInputs || {}) },
      styles: { ...(meta.defaultStyles || {}) }
    };
    const updated = [...activeIndicators, newInst];
    setActiveIndicators(updated);
    saveUserSettings(updated);
  };

  const handleUpdateIndicator = (instanceIdOrObj, updates) => {
    let updated;
    if (typeof instanceIdOrObj === 'string') {
      updated = activeIndicators.map(i => i.instanceId === instanceIdOrObj ? {
        ...i,
        ...updates,
        inputs: { ...(i.inputs || {}), ...(updates?.inputs || {}) },
        styles: { ...(i.styles || {}), ...(updates?.styles || {}) }
      } : i);
    } else {
      updated = activeIndicators.map(i => i.instanceId === instanceIdOrObj.instanceId ? instanceIdOrObj : i);
    }
    setActiveIndicators(updated);
    saveUserSettings(updated);
  };

  const handleRemoveIndicator = (instanceId) => {
    logTelemetry('INDICATOR_REMOVE', `Removing indicator instance: ${instanceId}`);
    
    // 1. Instantly remove its series from Lightweight Charts
    const chart = chartInstanceRef.current;
    if (chart) {
      const res = indicatorSeriesRegistryRef.current.get(instanceId);
      if (res && res.seriesList) {
        res.seriesList.forEach(s => {
          safeRemoveSeries(chart, s);
          allTrackedIndicatorSeriesRef.current.delete(s);
        });
      }
      indicatorSeriesRegistryRef.current.delete(instanceId);
    }

    // 2. Update React activeIndicators array & persistent storage
    const updated = activeIndicators.filter(i => i.instanceId !== instanceId);
    setActiveIndicators(updated);
    saveUserSettings(updated);

    // 3. If zero indicators remain, clear everything immediately
    if (updated.length === 0) {
      clearAllIndicatorRendering();
    }
  };

  const handleToggleVisibility = (instanceId) => {
    const updated = activeIndicators.map(i => {
      if (i.instanceId === instanceId) {
        const nextVis = !i.visible;
        if (!nextVis && chartInstanceRef.current) {
          const res = indicatorSeriesRegistryRef.current.get(instanceId);
          if (res && res.seriesList) {
            res.seriesList.forEach(s => {
              safeRemoveSeries(chartInstanceRef.current, s);
              allTrackedIndicatorSeriesRef.current.delete(s);
            });
          }
          indicatorSeriesRegistryRef.current.delete(instanceId);
        }
        return { ...i, visible: nextVis };
      }
      return i;
    });
    setActiveIndicators(updated);
    saveUserSettings(updated);
    if (updated.filter(i => i.visible).length === 0) {
      clearAllIndicatorRendering();
    }
  };

  const handleResetIndicators = () => {
    clearAllIndicatorRendering();
    setActiveIndicators([]);
    saveUserSettings([]);
  };

  const handleTimeframeSelect = (tf) => {
    if (onTimeframeChange) {
      onTimeframeChange(tf);
    }
  };

  return (
    <div
      ref={rootContainerRef}
      className={`relative flex flex-col bg-[#0b0e14] border border-[#1e293b] rounded-lg overflow-hidden select-none ${
        isFullscreen ? 'w-screen h-screen rounded-none z-[9999]' : 'w-full h-full min-h-[460px]'
      }`}
    >
      
      {/* ─── TOP CONTROL BAR ─── */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#0f172a]/95 border-b border-[#1e293b] text-xs font-mono z-10 backdrop-blur shrink-0 h-[38px]">
        
        {/* Symbol, Price, Timeframes & Market Status */}
        <div className="flex items-center space-x-3 overflow-hidden">
          <div className="flex items-center space-x-1.5 shrink-0">
            <span className="font-extrabold text-white text-sm tracking-wide">{currentTicker?.symbol || 'NIFTY'}</span>
            <span className="text-[10px] text-gray-400 font-sans uppercase">NSE</span>
          </div>
 
          <div className="hidden sm:flex items-center space-x-2 text-xs shrink-0">
            <span ref={topBarPriceRef} className="font-bold text-white">
              ₹{currentTicker?.price ? currentTicker.price.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '--'}
            </span>
            <span
              ref={topBarChangeRef}
              className={`text-[11px] font-semibold ${(currentTicker?.change || 0) >= 0 ? 'text-[#00E676]' : 'text-[#FF5252]'}`}
            >
              {(currentTicker?.change || 0) >= 0 ? '+' : ''}
              {Number(currentTicker?.change || 0).toFixed(2)} ({Number(currentTicker?.percentChange || 0).toFixed(2)}%)
            </span>
          </div>
 
          {/* ─── TIME FRAME SELECTOR TOOLBAR ─── */}
          <div className="flex items-center space-x-0.5 bg-[#151c27] p-0.5 rounded border border-white/10 shrink-0">
            {TIMEFRAME_OPTIONS.map(tf => {
              const isActive = (timeframe || '5m').toLowerCase() === tf.toLowerCase();
              return (
                <button
                  key={tf}
                  onClick={() => handleTimeframeSelect(tf)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-cyan-500 text-black shadow-sm font-black'
                      : 'text-gray-400 hover:text-white hover:bg-white/10'
                  }`}
                  title={`Switch to ${tf} timeframe`}
                >
                  {tf}
                </button>
              );
            })}
          </div>

          {/* Market Status Badge */}
          <div className="hidden md:flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>MARKET LIVE (IST)</span>
          </div>

          {/* Historical View Warning / Go to Realtime button (DOM ref, zero React re-render) */}
          <button
            ref={historicalBadgeRef}
            onClick={handleGoToRealtime}
            style={{ display: 'none' }}
            className="items-center space-x-1 px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded text-[10px] font-bold transition-colors cursor-pointer shrink-0"
            title="Return to latest live candle"
          >
            <span>Viewing History</span>
            <ArrowRight className="w-3 h-3 ml-0.5" />
            <span>Go to Realtime</span>
          </button>
        </div>

        {/* Indicators, Zoom, Pan, Fit, Fullscreen Controls */}
        <div className="flex items-center space-x-1.5 shrink-0">
          {/* Indicators Button */}
          <button
            onClick={() => setIsIndicatorModalOpen(true)}
            className="flex items-center space-x-1.5 px-2.5 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded font-medium text-xs transition-all shadow-sm cursor-pointer"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Indicators ({activeIndicators.filter(i => i.visible).length})</span>
          </button>

          {/* Zoom In (+) */}
          <button
            onClick={handleZoomIn}
            className="p-1 hover:bg-[#1e293b] text-gray-400 hover:text-white rounded transition-colors cursor-pointer"
            title="Zoom In (Time Scale)"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          {/* Zoom Out (-) */}
          <button
            onClick={handleZoomOut}
            className="p-1 hover:bg-[#1e293b] text-gray-400 hover:text-white rounded transition-colors cursor-pointer"
            title="Zoom Out (Time Scale)"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          {/* Reset View / Fit Content */}
          <button
            onClick={handleFitContent}
            className="p-1 hover:bg-[#1e293b] text-gray-400 hover:text-white rounded transition-colors cursor-pointer"
            title="Fit All Content"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {/* Native Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="p-1 hover:bg-[#1e293b] text-gray-400 hover:text-white rounded transition-colors cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Real Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* ─── TRADINGVIEW-STYLE CANDLE HOVER HEADER (DIRECT DOM HUD) ─── */}
      <div className="flex items-center space-x-4 px-3 py-1 bg-[#090d16]/95 border-b border-[#1e293b]/60 text-[11px] font-mono text-gray-300 z-10 shrink-0 h-[28px] overflow-x-auto">
        <span ref={hudTimeRef} className="text-gray-400 font-semibold">--</span>
        <div>O: <span ref={hudOpenRef} className="text-white font-bold">--</span></div>
        <div>H: <span ref={hudHighRef} className="text-[#00E676] font-bold">--</span></div>
        <div>L: <span ref={hudLowRef} className="text-[#FF5252] font-bold">--</span></div>
        <div>C: <span ref={hudCloseRef} className="text-white font-bold">--</span></div>
        <div>Vol: <span ref={hudVolRef} className="text-cyan-400 font-bold">--</span></div>
        <div>Diff: <span ref={hudDiffRef} className="font-bold text-[#00E676]">--</span></div>

        {/* Active Indicators Diagnostic Tags */}
        <div className="ml-auto flex items-center space-x-1.5 shrink-0">
          {activeIndicators.filter(i => i.visible).map(ind => (
            <span
              key={ind.instanceId}
              className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
            >
              {ind.shortName || ind.name}
            </span>
          ))}
        </div>
      </div>

      {/* ─── MAIN CHART & OVERLAY CANVAS CONTAINER ─── */}
      <div className="relative flex-1 min-h-0 w-full h-full overflow-hidden">
        {/* Lightweight Charts Canvas */}
        <div ref={chartContainerRef} className="absolute inset-0 w-full h-full" />

        {/* SMC & Technical Overlay Canvas */}
        <canvas ref={canvasOverlayRef} className="absolute inset-0 w-full h-full pointer-events-none z-[3]" />
      </div>

      {/* ─── INDICATOR SETTINGS MANAGER MODAL ─── */}
      <IndicatorManagerModal
        isOpen={isIndicatorModalOpen}
        onClose={() => setIsIndicatorModalOpen(false)}
        activeIndicators={activeIndicators}
        onAddIndicator={handleAddIndicator}
        onUpdateIndicator={handleUpdateIndicator}
        onRemoveIndicator={handleRemoveIndicator}
        onToggleVisibility={handleToggleVisibility}
        onResetAll={handleResetIndicators}
        onResetDefaults={handleResetIndicators}
      />
    </div>
  );
}

// Memoize TradingViewChart so incoming parent ticks never re-render or tear down the chart canvas
const TradingViewChart = memo(TradingViewChartComponent, (prevProps, nextProps) => {
  return (
    prevProps.currentTicker?.symbol === nextProps.currentTicker?.symbol &&
    prevProps.timeframe === nextProps.timeframe
  );
});

export default TradingViewChart;
