/**
 * ============================================================================
 * HELLO TRADER UNIVERSAL INDICATOR FRAMEWORK & PLUGIN CONTRACT v5.0
 * ============================================================================
 * 
 * STANDARD INDICATOR CONTRACT:
 * {
 *   id: string,
 *   name: string,
 *   shortName: string,
 *   category: 'TREND' | 'MOMENTUM' | 'VOLATILITY' | 'VOLUME' | 'SMC' | 'AUTO',
 *   isOverlay: boolean,
 *   defaultInputs: Object,
 *   defaultStyles: Object,
 *   calculate: (candles: Array, inputs: Object, context: Object) => any,
 *   renderSeries?: (chart, registry, data, instance, scaleId, helpers) => Array,
 *   renderCanvas?: (ctx, timeScale, series, data, instance, dimensions) => void,
 *   updateLive?: (seriesList, newCandle, allCandles, data, instance) => void,
 *   remove?: (chart, instanceRecord) => void
 * }
 * ============================================================================
 */

import {
  calculateEMA, calculateSMA, calculateWMA, calculateHMA, calculateVWMA,
  calculateDEMA, calculateTEMA, calculateSupertrend, calculateParabolicSAR,
  calculateBollingerBands, calculateKeltner, calculateDonchian,
  calculateRSI, calculateMACD, calculateStochastic, calculateStochRSI,
  calculateCCI, calculateMomentum, calculateROC, calculateWilliamsR,
  calculateAwesomeOscillator, calculateATR, calculateADX, calculateVWAP, calculateOBV,
  calculateCPR, calculatePivotPoints, detectOrderBlocks, detectFairValueGaps,
  detectBOSandCHOCH, calculateORB, calculateAutoTrendlines
} from './index.js';

// ─── HELPER: CLAMP VIEWPORT COORDINATES FOR CANVAS DRAWINGS ─────────────────
export function clampCoordinates(timeScale, startTime, endTime, width) {
  let startX = timeScale.timeToCoordinate(startTime);
  let endX = endTime ? timeScale.timeToCoordinate(endTime) : null;

  if (startX === null) {
    if (endX !== null && endX > 0) {
      startX = 0;
    } else if (endX === null) {
      startX = 0;
      endX = width;
    }
  }

  if (endX === null) {
    endX = width;
  }

  return { startX, endX, isVisible: startX !== null && endX !== null && endX > startX };
}

// ─── UNIVERSAL INDICATOR DEFINITIONS ────────────────────────────────────────

export const UNIVERSAL_INDICATORS = {
  // ── 1. TREND (SINGLE-LINE OVERLAYS) ──
  ema: {
    id: 'ema',
    name: 'Exponential Moving Average (EMA)',
    shortName: 'EMA',
    category: 'TREND',
    isOverlay: true,
    defaultInputs: { period: 20 },
    defaultStyles: { color: '#00D4FF', lineWidth: 2 },
    calculate: (candles, inputs) => calculateEMA(candles, Number(inputs?.period || 20)),
    renderSeries: (chart, registry, data, ind, scaleId, { LineSeries, safeAddSeries }) => {
      let rec = registry.get(ind.instanceId);
      if (!rec) {
        const s = safeAddSeries(chart, LineSeries, {
          color: ind.styles?.color || '#00D4FF',
          lineWidth: ind.styles?.lineWidth || 2,
          priceScaleId: scaleId,
          title: ind.shortName || ind.name
        });
        if (s) {
          s.setData(data);
          registry.set(ind.instanceId, { seriesList: [s], priceScaleId: scaleId, indicator: ind });
          return [s];
        }
      } else if (rec.seriesList[0]) {
        rec.seriesList[0].setData(data);
        return rec.seriesList;
      }
      return [];
    }
  },

  sma: {
    id: 'sma',
    name: 'Simple Moving Average (SMA)',
    shortName: 'SMA',
    category: 'TREND',
    isOverlay: true,
    defaultInputs: { period: 50 },
    defaultStyles: { color: '#FFD700', lineWidth: 2 },
    calculate: (candles, inputs) => calculateSMA(candles, Number(inputs?.period || 50)),
    renderSeries: (chart, registry, data, ind, scaleId, { LineSeries, safeAddSeries }) => {
      let rec = registry.get(ind.instanceId);
      if (!rec) {
        const s = safeAddSeries(chart, LineSeries, {
          color: ind.styles?.color || '#FFD700',
          lineWidth: ind.styles?.lineWidth || 2,
          priceScaleId: scaleId,
          title: ind.shortName || ind.name
        });
        if (s) {
          s.setData(data);
          registry.set(ind.instanceId, { seriesList: [s], priceScaleId: scaleId, indicator: ind });
          return [s];
        }
      } else if (rec.seriesList[0]) {
        rec.seriesList[0].setData(data);
        return rec.seriesList;
      }
      return [];
    }
  },

  wma: {
    id: 'wma',
    name: 'Weighted Moving Average (WMA)',
    shortName: 'WMA',
    category: 'TREND',
    isOverlay: true,
    defaultInputs: { period: 20 },
    defaultStyles: { color: '#38BDF8', lineWidth: 2 },
    calculate: (candles, inputs) => calculateWMA(candles, Number(inputs?.period || 20)),
    renderSeries: (chart, registry, data, ind, scaleId, { LineSeries, safeAddSeries }) => {
      let rec = registry.get(ind.instanceId);
      if (!rec) {
        const s = safeAddSeries(chart, LineSeries, {
          color: ind.styles?.color || '#38BDF8',
          lineWidth: ind.styles?.lineWidth || 2,
          priceScaleId: scaleId,
          title: ind.shortName || ind.name
        });
        if (s) {
          s.setData(data);
          registry.set(ind.instanceId, { seriesList: [s], priceScaleId: scaleId, indicator: ind });
          return [s];
        }
      } else if (rec.seriesList[0]) {
        rec.seriesList[0].setData(data);
        return rec.seriesList;
      }
      return [];
    }
  },

  hma: {
    id: 'hma',
    name: 'Hull Moving Average (HMA)',
    shortName: 'HMA',
    category: 'TREND',
    isOverlay: true,
    defaultInputs: { period: 20 },
    defaultStyles: { color: '#F43F5E', lineWidth: 2 },
    calculate: (candles, inputs) => calculateHMA(candles, Number(inputs?.period || 20)),
    renderSeries: (chart, registry, data, ind, scaleId, { LineSeries, safeAddSeries }) => {
      let rec = registry.get(ind.instanceId);
      if (!rec) {
        const s = safeAddSeries(chart, LineSeries, {
          color: ind.styles?.color || '#F43F5E',
          lineWidth: ind.styles?.lineWidth || 2,
          priceScaleId: scaleId,
          title: ind.shortName || ind.name
        });
        if (s) {
          s.setData(data);
          registry.set(ind.instanceId, { seriesList: [s], priceScaleId: scaleId, indicator: ind });
          return [s];
        }
      } else if (rec.seriesList[0]) {
        rec.seriesList[0].setData(data);
        return rec.seriesList;
      }
      return [];
    }
  },

  vwma: {
    id: 'vwma',
    name: 'Volume Weighted Moving Average (VWMA)',
    shortName: 'VWMA',
    category: 'TREND',
    isOverlay: true,
    defaultInputs: { period: 20 },
    defaultStyles: { color: '#A855F7', lineWidth: 2 },
    calculate: (candles, inputs) => calculateVWMA(candles, Number(inputs?.period || 20)),
    renderSeries: (chart, registry, data, ind, scaleId, { LineSeries, safeAddSeries }) => {
      let rec = registry.get(ind.instanceId);
      if (!rec) {
        const s = safeAddSeries(chart, LineSeries, {
          color: ind.styles?.color || '#A855F7',
          lineWidth: ind.styles?.lineWidth || 2,
          priceScaleId: scaleId,
          title: ind.shortName || ind.name
        });
        if (s) {
          s.setData(data);
          registry.set(ind.instanceId, { seriesList: [s], priceScaleId: scaleId, indicator: ind });
          return [s];
        }
      } else if (rec.seriesList[0]) {
        rec.seriesList[0].setData(data);
        return rec.seriesList;
      }
      return [];
    }
  },

  dema: {
    id: 'dema',
    name: 'Double Exponential Moving Average (DEMA)',
    shortName: 'DEMA',
    category: 'TREND',
    isOverlay: true,
    defaultInputs: { period: 20 },
    defaultStyles: { color: '#10B981', lineWidth: 2 },
    calculate: (candles, inputs) => calculateDEMA(candles, Number(inputs?.period || 20)),
    renderSeries: (chart, registry, data, ind, scaleId, { LineSeries, safeAddSeries }) => {
      let rec = registry.get(ind.instanceId);
      if (!rec) {
        const s = safeAddSeries(chart, LineSeries, {
          color: ind.styles?.color || '#10B981',
          lineWidth: ind.styles?.lineWidth || 2,
          priceScaleId: scaleId,
          title: ind.shortName || ind.name
        });
        if (s) {
          s.setData(data);
          registry.set(ind.instanceId, { seriesList: [s], priceScaleId: scaleId, indicator: ind });
          return [s];
        }
      } else if (rec.seriesList[0]) {
        rec.seriesList[0].setData(data);
        return rec.seriesList;
      }
      return [];
    }
  },

  tema: {
    id: 'tema',
    name: 'Triple Exponential Moving Average (TEMA)',
    shortName: 'TEMA',
    category: 'TREND',
    isOverlay: true,
    defaultInputs: { period: 20 },
    defaultStyles: { color: '#F59E0B', lineWidth: 2 },
    calculate: (candles, inputs) => calculateTEMA(candles, Number(inputs?.period || 20)),
    renderSeries: (chart, registry, data, ind, scaleId, { LineSeries, safeAddSeries }) => {
      let rec = registry.get(ind.instanceId);
      if (!rec) {
        const s = safeAddSeries(chart, LineSeries, {
          color: ind.styles?.color || '#F59E0B',
          lineWidth: ind.styles?.lineWidth || 2,
          priceScaleId: scaleId,
          title: ind.shortName || ind.name
        });
        if (s) {
          s.setData(data);
          registry.set(ind.instanceId, { seriesList: [s], priceScaleId: scaleId, indicator: ind });
          return [s];
        }
      } else if (rec.seriesList[0]) {
        rec.seriesList[0].setData(data);
        return rec.seriesList;
      }
      return [];
    }
  },

  supertrend: {
    id: 'supertrend',
    name: 'Supertrend',
    shortName: 'Supertrend',
    category: 'TREND',
    isOverlay: true,
    defaultInputs: { period: 10, multiplier: 3 },
    defaultStyles: { upColor: '#00E676', downColor: '#FF5252', lineWidth: 2 },
    calculate: (candles, inputs) => calculateSupertrend(candles, Number(inputs?.period || 10), Number(inputs?.multiplier || 3)),
    renderSeries: (chart, registry, data, ind, scaleId, { LineSeries, safeAddSeries }) => {
      let rec = registry.get(ind.instanceId);
      if (!rec) {
        const up = safeAddSeries(chart, LineSeries, { color: ind.styles?.upColor || '#00E676', lineWidth: ind.styles?.lineWidth || 2, priceScaleId: scaleId, title: 'ST Long' });
        const down = safeAddSeries(chart, LineSeries, { color: ind.styles?.downColor || '#FF5252', lineWidth: ind.styles?.lineWidth || 2, priceScaleId: scaleId, title: 'ST Short' });
        if (up && down) {
          up.setData(data.upLine || []);
          down.setData(data.downLine || []);
          registry.set(ind.instanceId, { seriesList: [up, down], priceScaleId: scaleId, indicator: ind });
          return [up, down];
        }
      } else {
        if (rec.seriesList[0]) rec.seriesList[0].setData(data.upLine || []);
        if (rec.seriesList[1]) rec.seriesList[1].setData(data.downLine || []);
        return rec.seriesList;
      }
      return [];
    }
  },

  psar: {
    id: 'psar',
    name: 'Parabolic SAR',
    shortName: 'PSAR',
    category: 'TREND',
    isOverlay: true,
    defaultInputs: { step: 0.02, maxStep: 0.2 },
    defaultStyles: { color: '#F59E0B', lineWidth: 2 },
    calculate: (candles, inputs) => calculateParabolicSAR(candles, Number(inputs?.step || 0.02), Number(inputs?.maxStep || 0.2)),
    renderSeries: (chart, registry, data, ind, scaleId, { LineSeries, safeAddSeries, LineStyle }) => {
      let rec = registry.get(ind.instanceId);
      if (!rec) {
        const s = safeAddSeries(chart, LineSeries, {
          color: ind.styles?.color || '#F59E0B',
          lineWidth: 2,
          lineStyle: LineStyle ? LineStyle.Dotted : 1,
          priceScaleId: scaleId,
          title: 'PSAR'
        });
        if (s) {
          s.setData(data);
          registry.set(ind.instanceId, { seriesList: [s], priceScaleId: scaleId, indicator: ind });
          return [s];
        }
      } else if (rec.seriesList[0]) {
        rec.seriesList[0].setData(data);
        return rec.seriesList;
      }
      return [];
    }
  },

  donchian: {
    id: 'donchian',
    name: 'Donchian Channels',
    shortName: 'Donchian',
    category: 'TREND',
    isOverlay: true,
    defaultInputs: { period: 20 },
    defaultStyles: { color: '#38BDF8', lineWidth: 1.5 },
    calculate: (candles, inputs) => calculateDonchian(candles, Number(inputs?.period || 20)),
    renderSeries: (chart, registry, data, ind, scaleId, { LineSeries, safeAddSeries }) => {
      let rec = registry.get(ind.instanceId);
      if (!rec) {
        const u = safeAddSeries(chart, LineSeries, { color: ind.styles?.color || '#38BDF8', lineWidth: 1.5, priceScaleId: scaleId, title: 'Donchian Upper' });
        const m = safeAddSeries(chart, LineSeries, { color: ind.styles?.color || '#38BDF8', lineWidth: 1, priceScaleId: scaleId, title: 'Donchian Mid' });
        const l = safeAddSeries(chart, LineSeries, { color: ind.styles?.color || '#38BDF8', lineWidth: 1.5, priceScaleId: scaleId, title: 'Donchian Lower' });
        if (u && m && l) {
          u.setData(data.upper || []);
          m.setData(data.middle || []);
          l.setData(data.lower || []);
          registry.set(ind.instanceId, { seriesList: [u, m, l], priceScaleId: scaleId, indicator: ind });
          return [u, m, l];
        }
      } else {
        if (rec.seriesList[0]) rec.seriesList[0].setData(data.upper || []);
        if (rec.seriesList[1]) rec.seriesList[1].setData(data.middle || []);
        if (rec.seriesList[2]) rec.seriesList[2].setData(data.lower || []);
        return rec.seriesList;
      }
      return [];
    }
  },

  keltner: {
    id: 'keltner',
    name: 'Keltner Channels',
    shortName: 'Keltner',
    category: 'TREND',
    isOverlay: true,
    defaultInputs: { emaPeriod: 20, atrPeriod: 10, multiplier: 2 },
    defaultStyles: { color: '#A78BFA', lineWidth: 1.5 },
    calculate: (candles, inputs) => calculateKeltner(candles, Number(inputs?.emaPeriod || 20), Number(inputs?.atrPeriod || 10), Number(inputs?.multiplier || 2)),
    renderSeries: (chart, registry, data, ind, scaleId, { LineSeries, safeAddSeries }) => {
      let rec = registry.get(ind.instanceId);
      if (!rec) {
        const u = safeAddSeries(chart, LineSeries, { color: ind.styles?.color || '#A78BFA', lineWidth: 1.5, priceScaleId: scaleId, title: 'KC Upper' });
        const m = safeAddSeries(chart, LineSeries, { color: ind.styles?.color || '#A78BFA', lineWidth: 1, priceScaleId: scaleId, title: 'KC Mid' });
        const l = safeAddSeries(chart, LineSeries, { color: ind.styles?.color || '#A78BFA', lineWidth: 1.5, priceScaleId: scaleId, title: 'KC Lower' });
        if (u && m && l) {
          u.setData(data.upper || []);
          m.setData(data.middle || []);
          l.setData(data.lower || []);
          registry.set(ind.instanceId, { seriesList: [u, m, l], priceScaleId: scaleId, indicator: ind });
          return [u, m, l];
        }
      } else {
        if (rec.seriesList[0]) rec.seriesList[0].setData(data.upper || []);
        if (rec.seriesList[1]) rec.seriesList[1].setData(data.middle || []);
        if (rec.seriesList[2]) rec.seriesList[2].setData(data.lower || []);
        return rec.seriesList;
      }
      return [];
    }
  },

  bollinger: {
    id: 'bollinger',
    name: 'Bollinger Bands',
    shortName: 'BB',
    category: 'VOLATILITY',
    isOverlay: true,
    defaultInputs: { period: 20, stdDev: 2 },
    defaultStyles: { middleColor: '#3B82F6', bandColor: '#60A5FA', lineWidth: 1.5 },
    calculate: (candles, inputs) => calculateBollingerBands(candles, Number(inputs?.period || 20), Number(inputs?.stdDev || 2)),
    renderSeries: (chart, registry, data, ind, scaleId, { LineSeries, safeAddSeries }) => {
      let rec = registry.get(ind.instanceId);
      if (!rec) {
        const u = safeAddSeries(chart, LineSeries, { color: ind.styles?.bandColor || '#60A5FA', lineWidth: 1.5, priceScaleId: scaleId, title: 'BB Upper' });
        const m = safeAddSeries(chart, LineSeries, { color: ind.styles?.middleColor || '#3B82F6', lineWidth: 1.5, priceScaleId: scaleId, title: 'BB Basis' });
        const l = safeAddSeries(chart, LineSeries, { color: ind.styles?.bandColor || '#60A5FA', lineWidth: 1.5, priceScaleId: scaleId, title: 'BB Lower' });
        if (u && m && l) {
          u.setData(data.upper || []);
          m.setData(data.middle || []);
          l.setData(data.lower || []);
          registry.set(ind.instanceId, { seriesList: [u, m, l], priceScaleId: scaleId, indicator: ind });
          return [u, m, l];
        }
      } else {
        if (rec.seriesList[0]) rec.seriesList[0].setData(data.upper || []);
        if (rec.seriesList[1]) rec.seriesList[1].setData(data.middle || []);
        if (rec.seriesList[2]) rec.seriesList[2].setData(data.lower || []);
        return rec.seriesList;
      }
      return [];
    }
  },

  vwap: {
    id: 'vwap',
    name: 'Volume Weighted Average Price (VWAP)',
    shortName: 'VWAP',
    category: 'VOLUME',
    isOverlay: true,
    defaultInputs: {},
    defaultStyles: { color: '#E11D48', lineWidth: 2 },
    calculate: (candles) => calculateVWAP(candles),
    renderSeries: (chart, registry, data, ind, scaleId, { LineSeries, safeAddSeries }) => {
      let rec = registry.get(ind.instanceId);
      if (!rec) {
        const s = safeAddSeries(chart, LineSeries, {
          color: ind.styles?.color || '#E11D48',
          lineWidth: ind.styles?.lineWidth || 2,
          priceScaleId: scaleId,
          title: 'VWAP'
        });
        if (s) {
          s.setData(data);
          registry.set(ind.instanceId, { seriesList: [s], priceScaleId: scaleId, indicator: ind });
          return [s];
        }
      } else if (rec.seriesList[0]) {
        rec.seriesList[0].setData(data);
        return rec.seriesList;
      }
      return [];
    }
  },

  // ── 2. MOMENTUM & OSCILLATORS (SUB-PANES) ──
  rsi: {
    id: 'rsi',
    name: 'Relative Strength Index (RSI)',
    shortName: 'RSI',
    category: 'MOMENTUM',
    isOverlay: false,
    defaultInputs: { period: 14, overbought: 70, oversold: 30 },
    defaultStyles: { color: '#A855F7', lineWidth: 2 },
    calculate: (candles, inputs) => calculateRSI(candles, Number(inputs?.period || 14)),
    renderSeries: (chart, registry, data, ind, scaleId, { LineSeries, safeAddSeries }) => {
      let rec = registry.get(ind.instanceId);
      if (!rec) {
        const s = safeAddSeries(chart, LineSeries, {
          color: ind.styles?.color || '#A855F7',
          lineWidth: 2,
          priceScaleId: scaleId,
          title: `RSI (${ind.inputs?.period || 14})`
        });
        if (s) {
          s.setData(data);
          registry.set(ind.instanceId, { seriesList: [s], priceScaleId: scaleId, indicator: ind });
          return [s];
        }
      } else if (rec.seriesList[0]) {
        rec.seriesList[0].setData(data);
        return rec.seriesList;
      }
      return [];
    }
  },

  macd: {
    id: 'macd',
    name: 'Moving Average Convergence Divergence (MACD)',
    shortName: 'MACD',
    category: 'MOMENTUM',
    isOverlay: false,
    defaultInputs: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
    defaultStyles: { macdColor: '#00D4FF', signalColor: '#FFD700' },
    calculate: (candles, inputs) => calculateMACD(candles, Number(inputs?.fastPeriod || 12), Number(inputs?.slowPeriod || 26), Number(inputs?.signalPeriod || 9)),
    renderSeries: (chart, registry, data, ind, scaleId, { LineSeries, HistogramSeries, safeAddSeries }) => {
      let rec = registry.get(ind.instanceId);
      if (!rec) {
        const m = safeAddSeries(chart, LineSeries, { color: ind.styles?.macdColor || '#00D4FF', lineWidth: 2, priceScaleId: scaleId, title: 'MACD' });
        const sig = safeAddSeries(chart, LineSeries, { color: ind.styles?.signalColor || '#FFD700', lineWidth: 1.5, priceScaleId: scaleId, title: 'Signal' });
        const h = safeAddSeries(chart, HistogramSeries, { priceScaleId: scaleId, title: 'Hist' });
        if (m && sig && h) {
          m.setData(data.macd || []);
          sig.setData(data.signal || []);
          h.setData(data.histogram || []);
          registry.set(ind.instanceId, { seriesList: [m, sig, h], priceScaleId: scaleId, indicator: ind });
          return [m, sig, h];
        }
      } else {
        if (rec.seriesList[0]) rec.seriesList[0].setData(data.macd || []);
        if (rec.seriesList[1]) rec.seriesList[1].setData(data.signal || []);
        if (rec.seriesList[2]) rec.seriesList[2].setData(data.histogram || []);
        return rec.seriesList;
      }
      return [];
    }
  },

  stoch: {
    id: 'stoch',
    name: 'Stochastic Oscillator',
    shortName: 'Stoch',
    category: 'MOMENTUM',
    isOverlay: false,
    defaultInputs: { kPeriod: 14, dPeriod: 3 },
    defaultStyles: { kColor: '#00E676', dColor: '#FF5252' },
    calculate: (candles, inputs) => calculateStochastic(candles, Number(inputs?.kPeriod || 14), Number(inputs?.dPeriod || 3)),
    renderSeries: (chart, registry, data, ind, scaleId, { LineSeries, safeAddSeries }) => {
      let rec = registry.get(ind.instanceId);
      if (!rec) {
        const k = safeAddSeries(chart, LineSeries, { color: ind.styles?.kColor || '#00E676', lineWidth: 2, priceScaleId: scaleId, title: '%K' });
        const d = safeAddSeries(chart, LineSeries, { color: ind.styles?.dColor || '#FF5252', lineWidth: 1.5, priceScaleId: scaleId, title: '%D' });
        if (k && d) {
          k.setData(data.k || []);
          d.setData(data.d || []);
          registry.set(ind.instanceId, { seriesList: [k, d], priceScaleId: scaleId, indicator: ind });
          return [k, d];
        }
      } else {
        if (rec.seriesList[0]) rec.seriesList[0].setData(data.k || []);
        if (rec.seriesList[1]) rec.seriesList[1].setData(data.d || []);
        return rec.seriesList;
      }
      return [];
    }
  },

  stoch_rsi: {
    id: 'stoch_rsi',
    name: 'Stochastic RSI',
    shortName: 'Stoch RSI',
    category: 'MOMENTUM',
    isOverlay: false,
    defaultInputs: { rsiPeriod: 14, stochPeriod: 14, kPeriod: 3, dPeriod: 3 },
    defaultStyles: { kColor: '#38BDF8', dColor: '#F59E0B' },
    calculate: (candles, inputs) => calculateStochRSI(candles, Number(inputs?.rsiPeriod || 14), Number(inputs?.stochPeriod || 14), Number(inputs?.kPeriod || 3), Number(inputs?.dPeriod || 3)),
    renderSeries: (chart, registry, data, ind, scaleId, { LineSeries, safeAddSeries }) => {
      let rec = registry.get(ind.instanceId);
      if (!rec) {
        const k = safeAddSeries(chart, LineSeries, { color: ind.styles?.kColor || '#38BDF8', lineWidth: 2, priceScaleId: scaleId, title: 'StochRSI %K' });
        const d = safeAddSeries(chart, LineSeries, { color: ind.styles?.dColor || '#F59E0B', lineWidth: 1.5, priceScaleId: scaleId, title: 'StochRSI %D' });
        if (k && d) {
          k.setData(data.k || []);
          d.setData(data.d || []);
          registry.set(ind.instanceId, { seriesList: [k, d], priceScaleId: scaleId, indicator: ind });
          return [k, d];
        }
      } else {
        if (rec.seriesList[0]) rec.seriesList[0].setData(data.k || []);
        if (rec.seriesList[1]) rec.seriesList[1].setData(data.d || []);
        return rec.seriesList;
      }
      return [];
    }
  },

  cci: {
    id: 'cci',
    name: 'Commodity Channel Index (CCI)',
    shortName: 'CCI',
    category: 'MOMENTUM',
    isOverlay: false,
    defaultInputs: { period: 20 },
    defaultStyles: { color: '#EC4899', lineWidth: 2 },
    calculate: (candles, inputs) => calculateCCI(candles, Number(inputs?.period || 20)),
    renderSeries: (chart, registry, data, ind, scaleId, { LineSeries, safeAddSeries }) => {
      let rec = registry.get(ind.instanceId);
      if (!rec) {
        const s = safeAddSeries(chart, LineSeries, { color: ind.styles?.color || '#EC4899', lineWidth: 2, priceScaleId: scaleId, title: 'CCI' });
        if (s) {
          s.setData(data);
          registry.set(ind.instanceId, { seriesList: [s], priceScaleId: scaleId, indicator: ind });
          return [s];
        }
      } else if (rec.seriesList[0]) {
        rec.seriesList[0].setData(data);
        return rec.seriesList;
      }
      return [];
    }
  },

  momentum: {
    id: 'momentum',
    name: 'Momentum',
    shortName: 'MOM',
    category: 'MOMENTUM',
    isOverlay: false,
    defaultInputs: { period: 10 },
    defaultStyles: { color: '#00E676', lineWidth: 2 },
    calculate: (candles, inputs) => calculateMomentum(candles, Number(inputs?.period || 10)),
    renderSeries: (chart, registry, data, ind, scaleId, { LineSeries, safeAddSeries }) => {
      let rec = registry.get(ind.instanceId);
      if (!rec) {
        const s = safeAddSeries(chart, LineSeries, { color: ind.styles?.color || '#00E676', lineWidth: 2, priceScaleId: scaleId, title: 'MOM' });
        if (s) {
          s.setData(data);
          registry.set(ind.instanceId, { seriesList: [s], priceScaleId: scaleId, indicator: ind });
          return [s];
        }
      } else if (rec.seriesList[0]) {
        rec.seriesList[0].setData(data);
        return rec.seriesList;
      }
      return [];
    }
  },

  roc: {
    id: 'roc',
    name: 'Rate of Change (ROC)',
    shortName: 'ROC',
    category: 'MOMENTUM',
    isOverlay: false,
    defaultInputs: { period: 12 },
    defaultStyles: { color: '#F97316', lineWidth: 2 },
    calculate: (candles, inputs) => calculateROC(candles, Number(inputs?.period || 12)),
    renderSeries: (chart, registry, data, ind, scaleId, { LineSeries, safeAddSeries }) => {
      let rec = registry.get(ind.instanceId);
      if (!rec) {
        const s = safeAddSeries(chart, LineSeries, { color: ind.styles?.color || '#F97316', lineWidth: 2, priceScaleId: scaleId, title: 'ROC' });
        if (s) {
          s.setData(data);
          registry.set(ind.instanceId, { seriesList: [s], priceScaleId: scaleId, indicator: ind });
          return [s];
        }
      } else if (rec.seriesList[0]) {
        rec.seriesList[0].setData(data);
        return rec.seriesList;
      }
      return [];
    }
  },

  williams_r: {
    id: 'williams_r',
    name: 'Williams %R',
    shortName: '%R',
    category: 'MOMENTUM',
    isOverlay: false,
    defaultInputs: { period: 14 },
    defaultStyles: { color: '#06B6D4', lineWidth: 2 },
    calculate: (candles, inputs) => calculateWilliamsR(candles, Number(inputs?.period || 14)),
    renderSeries: (chart, registry, data, ind, scaleId, { LineSeries, safeAddSeries }) => {
      let rec = registry.get(ind.instanceId);
      if (!rec) {
        const s = safeAddSeries(chart, LineSeries, { color: ind.styles?.color || '#06B6D4', lineWidth: 2, priceScaleId: scaleId, title: '%R' });
        if (s) {
          s.setData(data);
          registry.set(ind.instanceId, { seriesList: [s], priceScaleId: scaleId, indicator: ind });
          return [s];
        }
      } else if (rec.seriesList[0]) {
        rec.seriesList[0].setData(data);
        return rec.seriesList;
      }
      return [];
    }
  },

  awesome_osc: {
    id: 'awesome_osc',
    name: 'Awesome Oscillator (AO)',
    shortName: 'AO',
    category: 'MOMENTUM',
    isOverlay: false,
    defaultInputs: {},
    defaultStyles: { upColor: '#00E676', downColor: '#FF5252' },
    calculate: (candles) => calculateAwesomeOscillator(candles),
    renderSeries: (chart, registry, data, ind, scaleId, { HistogramSeries, safeAddSeries }) => {
      let rec = registry.get(ind.instanceId);
      if (!rec) {
        const s = safeAddSeries(chart, HistogramSeries, { priceScaleId: scaleId, title: 'AO' });
        if (s) {
          s.setData(data);
          registry.set(ind.instanceId, { seriesList: [s], priceScaleId: scaleId, indicator: ind });
          return [s];
        }
      } else if (rec.seriesList[0]) {
        rec.seriesList[0].setData(data);
        return rec.seriesList;
      }
      return [];
    }
  },

  adx: {
    id: 'adx',
    name: 'Average Directional Index (ADX)',
    shortName: 'ADX',
    category: 'MOMENTUM',
    isOverlay: false,
    defaultInputs: { period: 14 },
    defaultStyles: { adxColor: '#00D4FF', plusColor: '#00E676', minusColor: '#FF5252' },
    calculate: (candles, inputs) => calculateADX(candles, Number(inputs?.period || 14)),
    renderSeries: (chart, registry, data, ind, scaleId, { LineSeries, safeAddSeries }) => {
      let rec = registry.get(ind.instanceId);
      if (!rec) {
        const adx = safeAddSeries(chart, LineSeries, { color: ind.styles?.adxColor || '#00D4FF', lineWidth: 2, priceScaleId: scaleId, title: 'ADX' });
        const plus = safeAddSeries(chart, LineSeries, { color: ind.styles?.plusColor || '#00E676', lineWidth: 1.5, priceScaleId: scaleId, title: '+DI' });
        const minus = safeAddSeries(chart, LineSeries, { color: ind.styles?.minusColor || '#FF5252', lineWidth: 1.5, priceScaleId: scaleId, title: '-DI' });
        if (adx && plus && minus) {
          adx.setData(data.adx || []);
          plus.setData(data.plusDI || []);
          minus.setData(data.minusDI || []);
          registry.set(ind.instanceId, { seriesList: [adx, plus, minus], priceScaleId: scaleId, indicator: ind });
          return [adx, plus, minus];
        }
      } else {
        if (rec.seriesList[0]) rec.seriesList[0].setData(data.adx || []);
        if (rec.seriesList[1]) rec.seriesList[1].setData(data.plusDI || []);
        if (rec.seriesList[2]) rec.seriesList[2].setData(data.minusDI || []);
        return rec.seriesList;
      }
      return [];
    }
  },

  atr: {
    id: 'atr',
    name: 'Average True Range (ATR)',
    shortName: 'ATR',
    category: 'VOLATILITY',
    isOverlay: false,
    defaultInputs: { period: 14 },
    defaultStyles: { color: '#F97316', lineWidth: 2 },
    calculate: (candles, inputs) => calculateATR(candles, Number(inputs?.period || 14)),
    renderSeries: (chart, registry, data, ind, scaleId, { LineSeries, safeAddSeries }) => {
      let rec = registry.get(ind.instanceId);
      if (!rec) {
        const s = safeAddSeries(chart, LineSeries, { color: ind.styles?.color || '#F97316', lineWidth: 2, priceScaleId: scaleId, title: 'ATR' });
        if (s) {
          s.setData(data);
          registry.set(ind.instanceId, { seriesList: [s], priceScaleId: scaleId, indicator: ind });
          return [s];
        }
      } else if (rec.seriesList[0]) {
        rec.seriesList[0].setData(data);
        return rec.seriesList;
      }
      return [];
    }
  },

  obv: {
    id: 'obv',
    name: 'On-Balance Volume (OBV)',
    shortName: 'OBV',
    category: 'VOLUME',
    isOverlay: false,
    defaultInputs: {},
    defaultStyles: { color: '#06B6D4', lineWidth: 2 },
    calculate: (candles) => calculateOBV(candles),
    renderSeries: (chart, registry, data, ind, scaleId, { LineSeries, safeAddSeries }) => {
      let rec = registry.get(ind.instanceId);
      if (!rec) {
        const s = safeAddSeries(chart, LineSeries, { color: ind.styles?.color || '#06B6D4', lineWidth: 2, priceScaleId: scaleId, title: 'OBV' });
        if (s) {
          s.setData(data);
          registry.set(ind.instanceId, { seriesList: [s], priceScaleId: scaleId, indicator: ind });
          return [s];
        }
      } else if (rec.seriesList[0]) {
        rec.seriesList[0].setData(data);
        return rec.seriesList;
      }
      return [];
    }
  },

  // ── 3. SMART MONEY CONCEPTS & AUTO-ANALYSIS (CANVAS OVERLAYS) ──
  order_blocks: {
    id: 'order_blocks',
    name: 'Order Block (OB) Detector',
    shortName: 'Order Blocks',
    category: 'SMC',
    isOverlay: true,
    defaultInputs: { lookback: 200 },
    defaultStyles: { bullColor: 'rgba(0,230,118,0.25)', bearColor: 'rgba(255,82,82,0.25)' },
    calculate: (candles, inputs) => detectOrderBlocks(candles, Number(inputs?.lookback || 200)),
    renderCanvas: (ctx, timeScale, series, data, ind, { width, height }) => {
      if (!data) return;
      const drawOBList = (obList, defaultColor, borderColor) => {
        (obList || []).forEach(ob => {
          try {
            const { startX, endX, isVisible } = clampCoordinates(timeScale, ob.startTime || ob.time, ob.endTime, width);
            const yTop = series.priceToCoordinate(ob.top);
            const yBottom = series.priceToCoordinate(ob.bottom);

            if (isVisible && yTop !== null && yBottom !== null) {
              const topY = Math.min(yTop, yBottom);
              const boxHeight = Math.max(Math.abs(yBottom - yTop), 2);
              const boxWidth = endX - startX;

              ctx.fillStyle = ob.color || defaultColor;
              ctx.fillRect(startX, topY, boxWidth, boxHeight);

              ctx.strokeStyle = ob.borderColor || borderColor;
              ctx.lineWidth = 1.5;
              ctx.strokeRect(startX, topY, boxWidth, boxHeight);

              ctx.fillStyle = ob.borderColor || borderColor;
              ctx.font = 'bold 10px monospace';
              const label = ob.type === 'BULLISH_OB' ? 'OB Bullish' : 'OB Bearish';
              ctx.fillText(label, Math.max(startX + 4, 10), topY + 12);
            }
          } catch (e) {}
        });
      };

      drawOBList(data.bullishOBs, 'rgba(0, 230, 118, 0.25)', '#00E676');
      drawOBList(data.bearishOBs, 'rgba(255, 82, 82, 0.25)', '#FF5252');
    }
  },

  fvg: {
    id: 'fvg',
    name: 'Fair Value Gap (FVG)',
    shortName: 'FVG',
    category: 'SMC',
    isOverlay: true,
    defaultInputs: { lookback: 80 },
    defaultStyles: { bullColor: 'rgba(0,212,255,0.2)', bearColor: 'rgba(255,171,0,0.2)' },
    calculate: (candles, inputs) => detectFairValueGaps(candles, Number(inputs?.lookback || 80)),
    renderCanvas: (ctx, timeScale, series, data, ind, { width, height }) => {
      if (!data) return;
      const drawFVGList = (fvgList, defaultColor, borderColor) => {
        (fvgList || []).forEach(fvg => {
          try {
            const { startX, endX, isVisible } = clampCoordinates(timeScale, fvg.startTime || fvg.time, fvg.endTime, width);
            const yTop = series.priceToCoordinate(fvg.top);
            const yBottom = series.priceToCoordinate(fvg.bottom);

            if (isVisible && yTop !== null && yBottom !== null) {
              const topY = Math.min(yTop, yBottom);
              const boxHeight = Math.max(Math.abs(yBottom - yTop), 2);
              const boxWidth = endX - startX;

              ctx.fillStyle = fvg.color || defaultColor;
              ctx.fillRect(startX, topY, boxWidth, boxHeight);

              ctx.strokeStyle = fvg.borderColor || borderColor;
              ctx.lineWidth = 1;
              ctx.strokeRect(startX, topY, boxWidth, boxHeight);

              ctx.fillStyle = fvg.borderColor || borderColor;
              ctx.font = '10px monospace';
              ctx.fillText(fvg.type === 'BULLISH_FVG' ? 'FVG +' : 'FVG -', Math.max(startX + 4, 10), topY + 10);
            }
          } catch (e) {}
        });
      };

      drawFVGList(data.bullishFVGs, 'rgba(0, 212, 255, 0.2)', '#00D4FF');
      drawFVGList(data.bearishFVGs, 'rgba(255, 171, 0, 0.2)', '#FFAB00');
    }
  },

  bos_choch: {
    id: 'bos_choch',
    name: 'Market Structure (BOS / CHOCH)',
    shortName: 'BOS / CHOCH',
    category: 'SMC',
    isOverlay: true,
    defaultInputs: { leftBars: 3, rightBars: 3 },
    defaultStyles: { bullColor: '#00E676', bearColor: '#FF5252' },
    calculate: (candles, inputs) => detectBOSandCHOCH(candles, Number(inputs?.leftBars || 3), Number(inputs?.rightBars || 3)),
    renderCanvas: (ctx, timeScale, series, data, ind, { width, height }) => {
      if (!data || !data.structureLevels) return;
      data.structureLevels.forEach(lvl => {
        try {
          const { startX, endX, isVisible } = clampCoordinates(timeScale, lvl.startTime, lvl.endTime, width);
          const y = series.priceToCoordinate(lvl.price);

          if (isVisible && y !== null) {
            ctx.strokeStyle = lvl.color || '#00D4FF';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(startX, y);
            ctx.lineTo(endX, y);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = lvl.color || '#00D4FF';
            ctx.font = 'bold 10px Inter, sans-serif';
            ctx.fillText(lvl.label || 'BOS', Math.max(startX + 6, 10), y - 4);
          }
        } catch (e) {}
      });
    }
  },

  orb: {
    id: 'orb',
    name: 'Opening Range Breakout (ORB)',
    shortName: 'ORB',
    category: 'SMC',
    isOverlay: true,
    defaultInputs: { rangeMinutes: 5 },
    defaultStyles: { color: '#FACC15', lineWidth: 1.5 },
    calculate: (candles, inputs) => calculateORB(candles, Number(inputs?.rangeMinutes || 5)),
    renderCanvas: (ctx, timeScale, series, data, ind, { width, height }) => {
      if (!data || !data.high || !data.low) return;
      try {
        const yHigh = series.priceToCoordinate(data.high);
        const yLow = series.priceToCoordinate(data.low);
        const { startX, endX, isVisible } = clampCoordinates(timeScale, data.startTime, data.endTime, width);

        if (isVisible && yHigh !== null && yLow !== null) {
          ctx.strokeStyle = ind.styles?.color || '#FACC15';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([2, 2]);

          ctx.beginPath();
          ctx.moveTo(startX, yHigh);
          ctx.lineTo(endX, yHigh);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(startX, yLow);
          ctx.lineTo(endX, yLow);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = ind.styles?.color || '#FACC15';
          ctx.font = 'bold 10px monospace';
          ctx.fillText(`ORB (${data.rangeMinutes}m) HIGH: ${data.high}`, Math.max(startX + 4, 10), yHigh - 4);
          ctx.fillText(`ORB (${data.rangeMinutes}m) LOW: ${data.low}`, Math.max(startX + 4, 10), yLow + 12);
        }
      } catch (e) {}
    }
  },

  cpr: {
    id: 'cpr',
    name: 'Central Pivot Range (CPR)',
    shortName: 'CPR',
    category: 'AUTO',
    isOverlay: true,
    defaultInputs: {},
    defaultStyles: { tcColor: '#38BDF8', pColor: '#FACC15', bcColor: '#38BDF8', lineWidth: 2 },
    calculate: (candles) => calculateCPR(candles),
    renderCanvas: (ctx, timeScale, series, data, ind, { width, height }) => {
      if (!data || !data.levels) return;
      const levels = [
        { label: `CPR TC (${data.levels.TC})`, price: data.levels.TC, color: ind.styles?.tcColor || '#38BDF8' },
        { label: `CPR Pivot (${data.levels.P})`, price: data.levels.P, color: ind.styles?.pColor || '#FACC15' },
        { label: `CPR BC (${data.levels.BC})`, price: data.levels.BC, color: ind.styles?.bcColor || '#38BDF8' }
      ];

      levels.forEach(lvl => {
        try {
          const y = series.priceToCoordinate(lvl.price);
          if (y !== null && y >= 0 && y <= height) {
            ctx.strokeStyle = lvl.color;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width - 55, y);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = lvl.color;
            ctx.font = 'bold 10px monospace';
            ctx.fillText(lvl.label, Math.max(width - 200, 10), y - 4);
          }
        } catch (e) {}
      });
    }
  },

  pivots: {
    id: 'pivots',
    name: 'Multi-Mode Pivot Points (Standard/Fib/Camarilla/Woodie/DeMark)',
    shortName: 'Pivots',
    category: 'AUTO',
    isOverlay: true,
    defaultInputs: { mode: 'STANDARD' },
    defaultStyles: { pColor: '#FACC15', rColor: '#FF5252', sColor: '#00E676' },
    calculate: (candles, inputs) => calculatePivotPoints(candles, (inputs?.mode || 'STANDARD').toUpperCase()),
    renderCanvas: (ctx, timeScale, series, data, ind, { width, height }) => {
      if (!data || !data.P) return;
      const levels = [
        { label: `${data.mode} P (${data.P})`, price: data.P, color: '#FACC15' },
        { label: `${data.mode} R1 (${data.R1})`, price: data.R1, color: '#FF5252' },
        { label: `${data.mode} S1 (${data.S1})`, price: data.S1, color: '#00E676' },
        { label: `${data.mode} R2 (${data.R2})`, price: data.R2, color: '#FF1744' },
        { label: `${data.mode} S2 (${data.S2})`, price: data.S2, color: '#00C853' }
      ];

      levels.forEach(lvl => {
        try {
          const y = series.priceToCoordinate(lvl.price);
          if (y !== null && y >= 0 && y <= height) {
            ctx.strokeStyle = lvl.color;
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width - 55, y);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = lvl.color;
            ctx.font = '10px monospace';
            ctx.fillText(lvl.label, Math.max(width - 180, 10), y - 3);
          }
        } catch (e) {}
      });
    }
  },

  auto_trendlines: {
    id: 'auto_trendlines',
    name: 'Auto Trendline',
    shortName: 'Auto TL',
    category: 'AUTO',
    isOverlay: true,
    defaultInputs: { lookback: 80, swingLength: 3 },
    defaultStyles: { resColor: '#FF5252', supColor: '#00E676', lineWidth: 2 },
    calculate: (candles, inputs) => calculateAutoTrendlines(candles, Number(inputs?.lookback || 80), Number(inputs?.swingLength || 3)),
    renderCanvas: (ctx, timeScale, series, data, ind, { width, height }) => {
      if (!Array.isArray(data)) return;
      data.forEach(tl => {
        try {
          const x1 = timeScale.timeToCoordinate(tl.p1.time);
          const y1 = series.priceToCoordinate(tl.p1.price);
          const x2 = timeScale.timeToCoordinate(tl.p2.time);
          const y2 = series.priceToCoordinate(tl.p2.price);

          if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
            ctx.strokeStyle = tl.color || '#00E676';
            ctx.lineWidth = tl.lineWidth || 2;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
          }
        } catch (e) {}
      });
    }
  }
};
