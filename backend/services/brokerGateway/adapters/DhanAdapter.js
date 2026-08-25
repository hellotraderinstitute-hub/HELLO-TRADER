/**
 * DhanAdapter — Hello Trader Broker Adapter for Dhan HQ
 * API Docs: https://dhanhq.co/docs/v2/
 * Implements IBrokerAdapter
 */

const axios = require('axios');
const IBrokerAdapter = require('../IBrokerAdapter');

const DHAN_BASE_URL = 'https://api.dhan.co/v2';

class DhanAdapter extends IBrokerAdapter {
  constructor(credentials) {
    super(credentials);
    this.brokerName = 'DHAN';
    // Dhan uses client_id + access_token (no OAuth flow needed, token is permanent)
    this.clientId = credentials.clientId;
    this.accessToken = credentials.accessToken; // Pre-generated from Dhan portal
  }

  _headers() {
    return {
      'Content-Type': 'application/json',
      'access-token': this.accessToken,
      'client-id': this.clientId,
    };
  }

  async authenticate() {
    // Dhan doesn't need a login step — access token is pre-issued
    // testConnection validates credentials
    return { success: true, message: 'Dhan uses pre-issued access tokens — no auth step needed.' };
  }

  async testConnection() {
    try {
      const res = await axios.get(`${DHAN_BASE_URL}/fundlimit`, { headers: this._headers(), timeout: 8000 });
      return {
        success: true,
        message: 'Dhan connection successful',
        profile: {
          clientId: this.clientId,
          availableBalance: res.data?.availabelBalance ?? res.data?.availableBalance ?? 0,
        }
      };
    } catch (err) {
      const msg = err.response?.data?.errorMessage || err.message;
      return { success: false, message: `Dhan connection failed: ${msg}`, profile: null };
    }
  }

  async placeOrder(order) {
    try {
      // Map to Dhan API format
      const dhanExchange = { NSE: 'NSE_EQ', BSE: 'BSE_EQ', NFO: 'NSE_FNO', MCX: 'MCX_COMM' }[order.exchange] || 'NSE_EQ';
      const dhanProduct = { MIS: 'INTRADAY', NRML: 'MARGIN', CNC: 'CNC' }[order.productType] || 'INTRADAY';
      const dhanOrderType = {
        MARKET: 'MARKET', LIMIT: 'LIMIT',
        SL: 'STOP_LOSS', 'SL-M': 'STOP_LOSS_MARKET'
      }[order.orderType] || 'MARKET';

      const body = {
        dhanClientId: this.clientId,
        transactionType: order.side === 'BUY' ? 'BUY' : 'SELL',
        exchangeSegment: dhanExchange,
        productType: dhanProduct,
        orderType: dhanOrderType,
        validity: 'DAY',
        tradingSymbol: order.symbol,
        securityId: order.securityId || '',
        quantity: order.quantity,
        price: order.price || 0,
        triggerPrice: order.triggerPrice || 0,
        disclosedQuantity: 0,
        afterMarketOrder: false,
      };

      const res = await axios.post(`${DHAN_BASE_URL}/orders`, body, {
        headers: this._headers(), timeout: 10000
      });

      return {
        success: true,
        orderId: res.data?.orderId || res.data?.data?.orderId || null,
        message: 'Order placed successfully on Dhan',
        rawResponse: res.data,
      };
    } catch (err) {
      const msg = err.response?.data?.errorMessage || err.response?.data?.message || err.message;
      return { success: false, orderId: null, message: `Dhan order failed: ${msg}`, rawResponse: err.response?.data || {} };
    }
  }

  async modifyOrder(orderId, modifications) {
    try {
      const body = {
        dhanClientId: this.clientId,
        orderId,
        orderType: modifications.orderType || 'LIMIT',
        legName: 'NA',
        quantity: modifications.quantity,
        price: modifications.price || 0,
        triggerPrice: modifications.triggerPrice || 0,
        disclosedQuantity: 0,
        validity: 'DAY',
      };
      const res = await axios.put(`${DHAN_BASE_URL}/orders/${orderId}`, body, {
        headers: this._headers(), timeout: 10000
      });
      return { success: true, message: 'Order modified on Dhan', rawResponse: res.data };
    } catch (err) {
      const msg = err.response?.data?.errorMessage || err.message;
      return { success: false, message: `Dhan modify failed: ${msg}`, rawResponse: err.response?.data || {} };
    }
  }

  async cancelOrder(orderId) {
    try {
      const res = await axios.delete(`${DHAN_BASE_URL}/orders/${orderId}`, {
        headers: this._headers(), timeout: 10000
      });
      return { success: true, message: 'Order cancelled on Dhan', rawResponse: res.data };
    } catch (err) {
      const msg = err.response?.data?.errorMessage || err.message;
      return { success: false, message: `Dhan cancel failed: ${msg}`, rawResponse: err.response?.data || {} };
    }
  }

  async getOrderStatus(orderId) {
    try {
      const res = await axios.get(`${DHAN_BASE_URL}/orders/${orderId}`, {
        headers: this._headers(), timeout: 8000
      });
      const d = res.data;
      return {
        status: d.orderStatus || 'UNKNOWN',
        filledQty: d.filledQty || 0,
        avgPrice: d.averageTradedPrice || 0,
        rawResponse: d,
      };
    } catch (err) {
      return { status: 'ERROR', filledQty: 0, avgPrice: 0, rawResponse: {} };
    }
  }

  async getPositions() {
    try {
      const res = await axios.get(`${DHAN_BASE_URL}/positions`, {
        headers: this._headers(), timeout: 8000
      });
      return (res.data || []).map(p => ({
        symbol: p.tradingSymbol,
        side: p.positionType === 'LONG' ? 'BUY' : 'SELL',
        qty: Math.abs(p.netQty || 0),
        avgPrice: p.averagePrice || 0,
        ltp: p.lastTradedPrice || 0,
        pnl: p.unrealizedProfit || 0,
        raw: p,
      }));
    } catch (err) {
      return [];
    }
  }

  async getHoldings() {
    try {
      const res = await axios.get(`${DHAN_BASE_URL}/holdings`, {
        headers: this._headers(), timeout: 8000
      });
      return (res.data || []).map(h => ({
        symbol: h.tradingSymbol,
        qty: h.totalQty || 0,
        avgPrice: h.avgCostPrice || 0,
        currentValue: h.lastTradedPrice * (h.totalQty || 0),
        pnl: h.unrealizedProfit || 0,
        raw: h,
      }));
    } catch (err) {
      return [];
    }
  }

  async getLTP(symbol, exchange) {
    try {
      const dhanExchange = { NSE: 'NSE_EQ', BSE: 'BSE_EQ', NFO: 'NSE_FNO' }[exchange] || 'NSE_EQ';
      const body = { NSE: symbol ? [{ symbol, exchange: dhanExchange }] : [] };
      // Use market feed LTP endpoint
      const res = await axios.post('https://api.dhan.co/v2/marketfeed/ltp', {
        [dhanExchange]: [symbol]
      }, { headers: this._headers(), timeout: 8000 });
      const ltpData = res.data?.data?.[dhanExchange]?.[symbol];
      return { ltp: ltpData?.LTP || 0, symbol };
    } catch (err) {
      return { ltp: 0, symbol };
    }
  }

  async getFunds() {
    try {
      const res = await axios.get(`${DHAN_BASE_URL}/fundlimit`, {
        headers: this._headers(), timeout: 8000
      });
      const d = res.data;
      return {
        available: d.availableBalance || d.availabelBalance || 0,
        used: d.utilizedAmount || 0,
        total: d.openingBalance || 0,
      };
    } catch (err) {
      return { available: 0, used: 0, total: 0 };
    }
  }

  /**
   * Get today's full order book from Dhan.
   * Used by MasterOrderPoller for Copy Trading source-of-truth detection.
   * Normalizes Dhan order format to standard IBrokerAdapter format.
   */
  async getOrders() {
    try {
      const res = await axios.get(`${DHAN_BASE_URL}/orders`, {
        headers: this._headers(), timeout: 10000
      });

      const orders = Array.isArray(res.data) ? res.data : (res.data?.data || []);

      return orders.map(o => {
        // Normalize Dhan orderStatus to standard status
        const statusMap = {
          'TRADED':            'FILLED',
          'PART_TRADED':       'PARTIALLY_FILLED',
          'TRANSIT':           'PENDING',
          'PENDING':           'PENDING',
          'REJECTED':          'REJECTED',
          'CANCELLED':         'CANCELLED',
          'EXPIRED':           'CANCELLED',
        };

        // Normalize Dhan exchange to standard exchange
        const exchangeMap = {
          'NSE':     'NSE',
          'BSE':     'BSE',
          'NSE_FNO': 'NFO',
          'MCX':     'MCX',
          'NSE_CURRENCY': 'CDS',
        };

        // Normalize Dhan product type
        const productMap = {
          'INTRADAY': 'MIS',
          'MARGIN':   'NRML',
          'CNC':      'CNC',
        };

        // Normalize Dhan order type
        const orderTypeMap = {
          'MARKET':            'MARKET',
          'LIMIT':             'LIMIT',
          'STOP_LOSS':         'SL',
          'STOP_LOSS_MARKET':  'SL-M',
        };

        return {
          orderId:     o.orderId || o.order_id || '',
          symbol:      o.tradingSymbol || o.trading_symbol || '',
          exchange:    exchangeMap[o.exchangeSegment] || o.exchangeSegment || 'NSE',
          side:        o.transactionType === 'BUY' ? 'BUY' : 'SELL',
          totalQty:    parseInt(o.quantity || 0),
          filledQty:   parseInt(o.filledQty || o.filled_qty || 0),
          avgPrice:    parseFloat(o.averageTradedPrice || o.price || 0),
          status:      statusMap[o.orderStatus] || 'PENDING',
          productType: productMap[o.productType] || 'MIS',
          orderType:   orderTypeMap[o.orderType] || 'MARKET',
          placedAt:    o.createTime || o.exchangeTime || new Date().toISOString(),
          securityId:  o.securityId || '',
          raw:         o,
        };
      });
    } catch (err) {
      console.error('[DhanAdapter] getOrders() error:', err.message);
      return [];
    }
  }
}

module.exports = DhanAdapter;

