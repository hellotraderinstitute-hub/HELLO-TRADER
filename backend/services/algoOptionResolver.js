/**
 * algoOptionResolver.js — Hello Trader Automatic Option Contract Resolver
 *
 * Resolves live tradable Option / Future / Equity contracts based on:
 *   - Underlying index / stock (NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, SENSEX)
 *   - Current live spot price (from Webhook Payload / SMDE / Dhan Streamer / Dhan Option Chain)
 *   - Option type (CE / PE)
 *   - Strike Selection (ATM, ITM, OTM with offset -5 to +5)
 *   - Expiry preference (Current = 0, Next = 1)
 *
 * STRIKE MATRIX:
 *   Index        Step Size   Lot Size
 *   NIFTY        50          65
 *   BANKNIFTY    100         15
 *   FINNIFTY     50          65
 *   MIDCPNIFTY   25          120
 *   SENSEX       100         20
 *   BANKEX       100         15
 *
 * EXACT ATM CALCULATION RULE:
 *   ATM = Math.round(spotPrice / step) * step
 *
 * CE LOGIC:
 *   ATM (0) = Math.round(spotPrice / step) * step
 *   ITM 1 (-1) = ATM - (1 * step)  (lower strike)
 *   OTM 1 (+1) = ATM + (1 * step)  (higher strike)
 *
 * PE LOGIC:
 *   ATM (0) = Math.round(spotPrice / step) * step
 *   ITM 1 (-1) = ATM + (1 * step)  (higher strike)
 *   OTM 1 (+1) = ATM - (1 * step)  (lower strike)
 */

'use strict';

const dhanOptionChainService = require('./dhanOptionChainService');
const marketDataEngine = require('./marketDataEngine');
const AngelScripMaster = require('./angelScripMaster');

// Standard index step sizes and lot sizes (NSE revised lot sizes)
const INDEX_METADATA = {
  NIFTY:      { step: 50,  lotSize: 65, exchange: 'NFO' },
  BANKNIFTY:  { step: 100, lotSize: 15, exchange: 'NFO' },
  FINNIFTY:   { step: 50,  lotSize: 65, exchange: 'NFO' },
  MIDCPNIFTY: { step: 25,  lotSize: 120, exchange: 'NFO' },
  SENSEX:     { step: 100, lotSize: 20, exchange: 'BFO' },
  BANKEX:     { step: 100, lotSize: 15, exchange: 'BFO' },
};

/**
 * Format date into Standard Option Symbol format
 * e.g. 2026-08-27, NIFTY, 24200, CE -> NIFTY27AUG2624200CE
 */
function formatTradingSymbol(symbol, expiryDateStr, strike, optionType) {
  try {
    const d = new Date(expiryDateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const month = months[d.getMonth()];
    const yr = String(d.getFullYear()).slice(-2);
    return `${symbol.toUpperCase()}${day}${month}${yr}${strike}${optionType.toUpperCase()}`;
  } catch (_) {
    return `${symbol.toUpperCase()}${strike}${optionType.toUpperCase()}`;
  }
}

class AlgoOptionResolver {
  /**
   * Resolve live spot price for underlying symbol with freshness & source tracking.
   *
   * Priority Order:
   * 1. Explicit payload spot / price from incoming signal (Tier 1: Fresh Webhook Data)
   * 2. SMDE hot cache live tick
   * 3. Dhan Option Chain status spot price
   * 4. SMDE latest candlestick close
   * 5. Fallback index spot
   *
   * @param {string} symbol - e.g. "NIFTY"
   * @param {Object} [signalContext] - Incoming webhook payload / context
   * @returns {Promise<{ spotPrice: number, spotSource: string, spotTimestamp: number, spotAgeMs: number }>}
   */
  static async getSpotPrice(symbol, signalContext = {}) {
    const symUpper = (symbol || 'NIFTY').toUpperCase();
    const now = Date.now();

    // 1. TIER 1: Check if spot is provided directly in incoming signal context / payload
    const candidatePayloadSpot = signalContext.payloadSpot ?? signalContext.price ?? signalContext.spot ?? signalContext.ltp ?? signalContext.close ?? signalContext.spotPrice;
    if (candidatePayloadSpot !== undefined && candidatePayloadSpot !== null && !isNaN(Number(candidatePayloadSpot)) && Number(candidatePayloadSpot) > 0) {
      const spot = Number(Number(candidatePayloadSpot).toFixed(2));
      const spotTimestamp = signalContext.time ? (Number(signalContext.time) > 1e11 ? Number(signalContext.time) : Number(signalContext.time) * 1000) : now;
      return {
        spotPrice: spot,
        spotSource: 'SIGNAL_PAYLOAD_PRICE',
        spotTimestamp,
        spotAgeMs: Math.max(0, now - spotTimestamp)
      };
    }

    try {
      // 2. TIER 2: SMDE hot cache
      const tick = marketDataEngine.cache.get(symUpper) || marketDataEngine.cache.get(`NSE:${symUpper}`) || marketDataEngine.cache.get(`${symUpper} 50`);
      if (tick && tick.lp > 0) {
        const tickTs = tick.timestamp ? (tick.timestamp > 1e11 ? tick.timestamp : tick.timestamp * 1000) : now;
        return {
          spotPrice: Number(tick.lp.toFixed(2)),
          spotSource: 'SMDE_HOT_CACHE_TICK',
          spotTimestamp: tickTs,
          spotAgeMs: Math.max(0, now - tickTs)
        };
      }

      // 3. TIER 3: Dhan Option Chain spot prices
      const status = dhanOptionChainService.getServiceStatus();
      if (status && status.spotPrices && status.spotPrices[symUpper] && status.spotPrices[symUpper] > 0) {
        return {
          spotPrice: Number(status.spotPrices[symUpper].toFixed(2)),
          spotSource: 'DHAN_OPTION_CHAIN_SPOT',
          spotTimestamp: now,
          spotAgeMs: 0
        };
      }

      // 4. TIER 4: SMDE latest 1m / 5m kline close
      const klines = marketDataEngine.getKlines(symUpper, '1m', 1);
      if (klines && klines.length > 0 && klines[0].close > 0) {
        const klineTs = klines[0].time * 1000;
        return {
          spotPrice: Number(klines[0].close.toFixed(2)),
          spotSource: 'SMDE_KLINE_CLOSE',
          spotTimestamp: klineTs,
          spotAgeMs: Math.max(0, now - klineTs)
        };
      }

      // 5. TIER 5: Fallback realistic spots if market feed is offline
      const defaultSpots = {
        NIFTY: 24200,
        BANKNIFTY: 50500,
        FINNIFTY: 22800,
        MIDCPNIFTY: 12500,
        SENSEX: 80000,
      };
      return {
        spotPrice: defaultSpots[symUpper] || 24200,
        spotSource: 'OFFLINE_STATIC_FALLBACK',
        spotTimestamp: now,
        spotAgeMs: 0
      };
    } catch (_) {
      return {
        spotPrice: 24200,
        spotSource: 'EMERGENCY_FALLBACK',
        spotTimestamp: now,
        spotAgeMs: 0
      };
    }
  }

  /**
   * Parse explicit option trading symbol to extract underlying, expiry, strike and optionType.
   * e.g. NIFTY18AUG2624550CE -> { underlying: "NIFTY", expiryDate: "2026-08-18", strike: 24550, optionType: "CE" }
   */
  static parseOptionSymbol(symbol) {
    if (!symbol) return null;
    const cleanSym = String(symbol).toUpperCase().trim();

    const months = {
      JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
      JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
    };

    const baseMatch = cleanSym.match(/^([A-Z]+)(\d{2})([A-Z]{3})(\d+)(CE|PE)$/i);
    if (!baseMatch) return null;

    const underlying = baseMatch[1];
    const prefixDigits = baseMatch[2];
    const monthStr = baseMatch[3];
    const afterMonthDigits = baseMatch[4];
    const optionType = baseMatch[5];

    const month = months[monthStr];
    if (!month) return null;

    if (afterMonthDigits.length >= 7) {
      const yearShort = afterMonthDigits.slice(0, 2);
      const strike = parseFloat(afterMonthDigits.slice(2));
      return {
        underlying,
        expiryDate: `20${yearShort}-${month}-${prefixDigits}`,
        strike,
        optionType
      };
    }

    const strike = parseFloat(afterMonthDigits);
    const currentYear = new Date().getFullYear();
    const yr = parseInt(prefixDigits, 10) >= 24 && parseInt(prefixDigits, 10) <= 35
      ? `20${prefixDigits}`
      : String(currentYear);
    const day = parseInt(prefixDigits, 10) >= 1 && parseInt(prefixDigits, 10) <= 31
      ? prefixDigits
      : '28';

    return {
      underlying,
      expiryDate: `${yr}-${month}-${day}`,
      strike,
      optionType
    };
  }

  /**
   * Resolve dynamic contract parameters for given trigger config and incoming signal context.
   *
   * @param {Object} config - AlgoTriggerConfig
   * @param {Object} [signalContext] - Incoming Webhook / Signal Context
   * @returns {Promise<{
   *   success: boolean,
   *   error?: string,
   *   spotPrice: number,
   *   spotSource: string,
   *   spotAgeMs: number,
   *   atmStrike: number,
   *   targetStrike: number,
   *   tradingSymbol: string,
   *   securityId: string,
   *   symbolToken: string,
   *   exchange: string,
   *   expiry: string,
   *   strike: number,
   *   optionType: string,
   *   lotSize: number,
   *   quantity: number,
   *   productType: string,
   *   orderSide: string
   * }>}
   */
  static async resolveContract(config, signalContext = {}) {
    try {
      const symbol = (config.symbol || 'NIFTY').toUpperCase();

      // 1. Get Spot Price & Telemetry
      const spotInfo = await this.getSpotPrice(symbol, signalContext);
      const spotPrice = spotInfo.spotPrice;

      // 2. Non-option script types (FUTURE / EQUITY)
      if (config.scriptType === 'EQUITY' || config.scriptType === 'FUTURE') {
        const meta = INDEX_METADATA[symbol] || { step: 50, lotSize: 1, exchange: 'NSE' };
        const lotSize = meta.lotSize || 1;
        const totalQty = Math.max(1, (config.lots || 1) * lotSize);

        return {
          success: true,
          spotPrice,
          spotSource: spotInfo.spotSource,
          spotAgeMs: spotInfo.spotAgeMs,
          atmStrike: spotPrice,
          targetStrike: spotPrice,
          tradingSymbol: config.scriptType === 'FUTURE' ? `${symbol}FUT` : symbol,
          securityId: '',
          symbolToken: symbol,
          exchange: config.scriptType === 'FUTURE' ? 'NFO' : 'NSE',
          expiry: 'CURRENT',
          strike: spotPrice,
          optionType: 'NA',
          lotSize,
          quantity: totalQty,
          productType: config.productType || 'MIS',
          orderSide: config.orderSide || 'BUY',
        };
      }

      // 3. Index metadata (step size & lot size)
      const meta = INDEX_METADATA[symbol] || { step: 50, lotSize: 65, exchange: 'NFO' };
      const step = config.strikeStep || meta.step || 50;
      const lotSize = meta.lotSize || 65;
      const optionType = (config.optionType || 'CE').toUpperCase();

      // CRITICAL TRUTHINESS PROTECTION: Ensure 0 is NOT coerced to 1 or default
      const offset = (config.strikeOffset !== undefined && config.strikeOffset !== null)
        ? Number(config.strikeOffset)
        : 0;

      // 4. Exact ATM Strike Calculation
      const atmStrike = Math.round(spotPrice / step) * step;

      // 5. Target Strike based on Option Type (CE vs PE)
      // CE: ITM is lower strike (-), OTM is higher strike (+)
      // PE: ITM is higher strike (+), OTM is lower strike (-)
      let targetStrike = atmStrike;
      if (optionType === 'CE') {
        targetStrike = atmStrike + (offset * step);
      } else if (optionType === 'PE') {
        targetStrike = atmStrike - (offset * step);
      }

      // 6. Resolve Expiry Date
      let expiryDate = '';
      let securityId = '';
      let resolvedTradingSymbol = '';

      try {
        const expiriesResult = await dhanOptionChainService.getExpiries(symbol);
        if (expiriesResult.success && expiriesResult.expiries && expiriesResult.expiries.length > 0) {
          const expIdx = Math.min(Number(config.expiryGap ?? 0), expiriesResult.expiries.length - 1);
          expiryDate = expiriesResult.expiries[expIdx];

          // Fetch option chain contracts for this expiry
          const chainResult = await dhanOptionChainService.getOptionChain(symbol, expiryDate);
          if (chainResult.success && chainResult.contracts) {
            const contract = chainResult.contracts.find(
              c => Math.abs(c.strike - targetStrike) < 2
            );
            if (contract) {
              securityId = optionType === 'CE' ? contract.ceSecurityId : contract.peSecurityId;
              resolvedTradingSymbol = formatTradingSymbol(symbol, expiryDate, targetStrike, optionType);
            }
          }
        }
      } catch (err) {
        console.warn(`[AlgoOptionResolver] Option chain lookup warning: ${err.message}`);
      }

      // Fallback symbol generation if live lookup didn't return tradingSymbol
      if (!resolvedTradingSymbol) {
        expiryDate = expiryDate || new Date().toISOString().split('T')[0];
        resolvedTradingSymbol = formatTradingSymbol(symbol, expiryDate, targetStrike, optionType);
      }

      // 7. Resolve Angel One / Broker Symbol Token
      const symbolToken = AngelScripMaster.resolveToken(symbol, expiryDate, targetStrike, optionType);
      securityId = securityId || symbolToken;

      const totalQuantity = Math.max(1, (Number(config.lots ?? 1)) * lotSize);

      // 8. Output ATM_RESOLUTION_TRACE Diagnostic Log
      console.log('[ATM_RESOLUTION_TRACE]', JSON.stringify({
        signalReceivedAt: signalContext.signalReceivedAt || new Date().toISOString(),
        underlying: symbol,
        payloadSpot: signalContext.payloadSpot ?? null,
        liveSpot: spotPrice,
        spotSource: spotInfo.spotSource,
        spotTimestamp: spotInfo.spotTimestamp,
        spotAgeMs: spotInfo.spotAgeMs,
        strikeInterval: step,
        atmOffset: offset,
        calculatedStrike: atmStrike,
        finalSelectedStrike: targetStrike,
        optionType,
        expiry: expiryDate,
        resolvedTradingSymbol,
        resolvedSymbolToken: symbolToken,
        exchange: meta.exchange || 'NFO',
        lotSize,
        quantity: totalQuantity
      }, null, 2));

      return {
        success: true,
        spotPrice,
        spotSource: spotInfo.spotSource,
        spotAgeMs: spotInfo.spotAgeMs,
        atmStrike,
        targetStrike,
        tradingSymbol: resolvedTradingSymbol,
        securityId: String(securityId),
        symbolToken: String(symbolToken),
        exchange: meta.exchange || 'NFO',
        expiry: expiryDate,
        strike: targetStrike,
        optionType,
        lotSize,
        quantity: totalQuantity,
        productType: config.productType || 'MIS',
        orderSide: config.orderSide || 'BUY',
      };

    } catch (err) {
      console.error('[AlgoOptionResolver] resolveContract error:', err.message);
      return {
        success: false,
        error: `OPTION_CONTRACT_NOT_AVAILABLE: ${err.message}`,
        spotPrice: 0,
        tradingSymbol: '',
        quantity: 0,
      };
    }
  }
}

module.exports = AlgoOptionResolver;
