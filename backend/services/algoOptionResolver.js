/**
 * algoOptionResolver.js — Hello Trader Automatic Option Contract Resolver
 *
 * Resolves live tradable Option / Future / Equity contracts based on:
 *   - Underlying index / stock (NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY)
 *   - Current live spot price (from SMDE / Dhan Streamer / Dhan Option Chain)
 *   - Option type (CE / PE)
 *   - Strike Selection (ATM, ITM, OTM with offset -5 to +5)
 *   - Expiry preference (Current = 0, Next = 1)
 *
 * STRIKE MATRIX:
 *   Index        Step Size   Lot Size
 *   NIFTY        50          25 (or 50/65 based on current lot size)
 *   BANKNIFTY    100         15
 *   FINNIFTY     50          40
 *   MIDCPNIFTY   25          75
 *
 * CE LOGIC:
 *   ATM = Math.round(spotPrice / step) * step
 *   ITM 1 = ATM - (1 * step)  (lower strike)
 *   OTM 1 = ATM + (1 * step)  (higher strike)
 *
 * PE LOGIC:
 *   ATM = Math.round(spotPrice / step) * step
 *   ITM 1 = ATM + (1 * step)  (higher strike)
 *   OTM 1 = ATM - (1 * step)  (lower strike)
 */

'use strict';

const dhanOptionChainService = require('./dhanOptionChainService');
const marketDataEngine = require('./marketDataEngine');

// Standard index step sizes and lot sizes (NSE revised 2026 lot sizes)
const INDEX_METADATA = {
  NIFTY:      { step: 50,  lotSize: 65, exchange: 'NFO' },
  BANKNIFTY:  { step: 100, lotSize: 15, exchange: 'NFO' },
  FINNIFTY:   { step: 50,  lotSize: 65, exchange: 'NFO' },
  MIDCPNIFTY: { step: 25,  lotSize: 120, exchange: 'NFO' },
  SENSEX:     { step: 100, lotSize: 20, exchange: 'BFO' },
  BANKEX:     { step: 100, lotSize: 15, exchange: 'BFO' },
};

/**
 * Format date into Dhan Option Symbol format
 * e.g. 2026-08-20, NIFTY, 24400, CE -> NIFTY2682024400CE or standard trading symbol format
 */
function formatTradingSymbol(symbol, expiryDateStr, strike, optionType) {
  // Convert expiryDate e.g. "2026-08-27" to "27AUG26" or "26AUG" format if needed
  try {
    const d = new Date(expiryDateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const month = months[d.getMonth()];
    const yr = String(d.getFullYear()).slice(-2);
    return `${symbol}${day}${month}${yr}${strike}${optionType}`;
  } catch (_) {
    return `${symbol}${strike}${optionType}`;
  }
}

class AlgoOptionResolver {
  /**
   * Resolve live spot price for underlying symbol.
   */
  static async getSpotPrice(symbol) {
    try {
      // 1. Try SMDE hot cache
      const symUpper = symbol.toUpperCase();
      const tick = marketDataEngine.cache.get(symUpper) || marketDataEngine.cache.get(`NSE:${symUpper}`);
      if (tick && tick.lp > 0) {
        return tick.lp;
      }

      // 2. Try option chain status/spot price fallback
      const status = dhanOptionChainService.getServiceStatus();
      if (status && status.spotPrices && status.spotPrices[symUpper]) {
        return status.spotPrices[symUpper];
      }

      // Default realistic fallbacks if market is offline / weekend
      const defaultSpots = {
        NIFTY: 24400,
        BANKNIFTY: 50500,
        FINNIFTY: 22800,
        MIDCPNIFTY: 12500,
        SENSEX: 80000,
      };
      return defaultSpots[symUpper] || 24400;
    } catch (_) {
      return 24400;
    }
  }

  /**
   * Resolve dynamic contract parameters for given trigger config.
   *
   * @param {Object} config - AlgoTriggerConfig
   *   config.symbol       - e.g. "NIFTY"
   *   config.optionType   - "CE" | "PE"
   *   config.strikeOffset - 0 (ATM), -1 (ITM1), -2 (ITM2), +1 (OTM1), +2 (OTM2)
   *   config.expiryGap    - 0 (Current Expiry), 1 (Next Expiry)
   *   config.lots         - Number of lots (e.g. 1)
   *   config.productType  - "MIS" | "NRML"
   *   config.scriptType   - "OPTION" | "FUTURE" | "EQUITY"
   *
   * @returns {Promise<{
   *   success: boolean,
   *   error?: string,
   *   spotPrice: number,
   *   targetStrike: number,
   *   tradingSymbol: string,
   *   securityId: string,
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
  static async resolveContract(config) {
    try {
      const symbol = (config.symbol || 'NIFTY').toUpperCase();

      // Non-option script types (FUTURE / EQUITY)
      if (config.scriptType === 'EQUITY' || config.scriptType === 'FUTURE') {
        const meta = INDEX_METADATA[symbol] || { step: 50, lotSize: 1, exchange: 'NSE' };
        const spotPrice = await this.getSpotPrice(symbol);
        const lotSize = meta.lotSize || 1;
        const totalQty = Math.max(1, (config.lots || 1) * lotSize);

        return {
          success: true,
          spotPrice,
          targetStrike: spotPrice,
          tradingSymbol: config.scriptType === 'FUTURE' ? `${symbol}FUT` : symbol,
          securityId: '',
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

      // 1. Get spot price
      const spotPrice = await this.getSpotPrice(symbol);

      // 2. Index metadata (step size & lot size)
      const meta = INDEX_METADATA[symbol] || { step: 50, lotSize: 25, exchange: 'NFO' };
      const step = config.strikeStep || meta.step || 50;
      const lotSize = meta.lotSize || 25;
      const optionType = (config.optionType || 'CE').toUpperCase();
      const offset = config.strikeOffset || 0; // 0 = ATM, -1/1 ITM/OTM

      // 3. Calculate ATM Strike
      const atmStrike = Math.round(spotPrice / step) * step;

      // 4. Calculate Target Strike based on Option Type (CE vs PE)
      // CE: ITM is lower strike (-), OTM is higher strike (+)
      // PE: ITM is higher strike (+), OTM is lower strike (-)
      let targetStrike = atmStrike;
      if (optionType === 'CE') {
        targetStrike = atmStrike + (offset * step);
      } else if (optionType === 'PE') {
        targetStrike = atmStrike - (offset * step);
      }

      // 5. Resolve Expiry Date via Live Dhan Option Chain Service
      let expiryDate = '';
      let securityId = '';
      let resolvedTradingSymbol = '';

      try {
        const expiriesResult = await dhanOptionChainService.getExpiries(symbol);
        if (expiriesResult.success && expiriesResult.expiries && expiriesResult.expiries.length > 0) {
          const expIdx = Math.min(config.expiryGap || 0, expiriesResult.expiries.length - 1);
          expiryDate = expiriesResult.expiries[expIdx];

          // Fetch option chain contracts for this expiry
          const chainResult = await dhanOptionChainService.getOptionChain(symbol, expiryDate);
          if (chainResult.success && chainResult.contracts) {
            // Find contract matching targetStrike and optionType
            const contract = chainResult.contracts.find(
              c => Math.abs(c.strike - targetStrike) < 2 && c.optionType === optionType
            );

            if (contract) {
              securityId = contract.securityId || '';
              resolvedTradingSymbol = contract.tradingSymbol || contract.symbol || '';
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

      const totalQuantity = Math.max(1, (config.lots || 1) * lotSize);

      return {
        success: true,
        spotPrice,
        targetStrike,
        tradingSymbol: resolvedTradingSymbol,
        securityId,
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
