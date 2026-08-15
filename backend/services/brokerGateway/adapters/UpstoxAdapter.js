/**
 * UpstoxAdapter — Hello Trader Broker Adapter for Upstox
 * API Docs: https://upstox.com/developer/api-documentation/
 * OAuth2 based authentication
 * Implements IBrokerAdapter
 */

const axios = require('axios');
const IBrokerAdapter = require('../IBrokerAdapter');

const UPSTOX_BASE_URL = 'https://api.upstox.com/v2';
const AUTH_URL = 'https://api.upstox.com/v2/login/authorization/token';

class UpstoxAdapter extends IBrokerAdapter {
  constructor(credentials) {
    super(credentials);
    this.brokerName = 'UPSTOX';
    this.apiKey = credentials.apiKey;
    this.apiSecret = credentials.apiSecret;
    this.accessToken = credentials.accessToken; // OAuth2 Bearer token
    this.redirectUri = credentials.redirectUri || 'https://localhost/callback';
  }

  _headers() {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${this.accessToken}`,
    };
  }

  async authenticate() {
    // Upstox uses OAuth2 — access token is pre-obtained via redirect flow
    // If token expired, user must re-authorize
    if (this.accessToken) return { success: true, message: 'Upstox access token pre-loaded' };
    return { success: false, message: 'Upstox requires OAuth2 authorization. Please reconnect.' };
  }

  async testConnection() {
    try {
      const res = await axios.get(`${UPSTOX_BASE_URL}/user/profile`, {
        headers: this._headers(), timeout: 8000
      });
      if (res.data?.status === 'success') {
        return {
          success: true,
          message: 'Upstox connection successful',
          profile: {
            name: res.data.data?.user_name,
            userId: res.data.data?.user_id,
            email: res.data.data?.email,
          }
        };
      }
      return { success: false, message: 'Upstox profile fetch failed', profile: null };
    } catch (err) {
      return { success: false, message: `Upstox test failed: ${err.response?.data?.errors?.[0]?.message || err.message}`, profile: null };
    }
  }

  async placeOrder(order) {
    try {
      const body = {
        quantity: order.quantity,
        product: order.productType === 'MIS' ? 'I' : order.productType === 'CNC' ? 'D' : 'M',
        validity: 'DAY',
        price: order.price || 0,
        tag: 'HelloTrader',
        instrument_token: order.instrumentToken || `${order.exchange}_EQ|${order.symbol}`,
        order_type: order.orderType || 'MARKET',
        transaction_type: order.side,
        disclosed_quantity: 0,
        trigger_price: order.triggerPrice || 0,
        is_amo: false,
      };
      const res = await axios.post(`${UPSTOX_BASE_URL}/order/place`, body, {
        headers: this._headers(), timeout: 10000
      });
      return {
        success: res.data?.status === 'success',
        orderId: res.data?.data?.order_id || null,
        message: res.data?.message || 'Upstox order placed',
        rawResponse: res.data,
      };
    } catch (err) {
      const msg = err.response?.data?.errors?.[0]?.message || err.message;
      return { success: false, orderId: null, message: `Upstox order failed: ${msg}`, rawResponse: err.response?.data || {} };
    }
  }

  async modifyOrder(orderId, modifications) {
    try {
      const body = {
        quantity: modifications.quantity,
        validity: 'DAY',
        price: modifications.price || 0,
        order_id: orderId,
        order_type: modifications.orderType || 'LIMIT',
        trigger_price: modifications.triggerPrice || 0,
        disclosed_quantity: 0,
      };
      const res = await axios.put(`${UPSTOX_BASE_URL}/order/modify`, body, {
        headers: this._headers(), timeout: 10000
      });
      return { success: res.data?.status === 'success', message: res.data?.message, rawResponse: res.data };
    } catch (err) {
      return { success: false, message: err.response?.data?.errors?.[0]?.message || err.message, rawResponse: {} };
    }
  }

  async cancelOrder(orderId) {
    try {
      const res = await axios.delete(`${UPSTOX_BASE_URL}/order/cancel?order_id=${orderId}`, {
        headers: this._headers(), timeout: 10000
      });
      return { success: res.data?.status === 'success', message: res.data?.message, rawResponse: res.data };
    } catch (err) {
      return { success: false, message: err.response?.data?.errors?.[0]?.message || err.message, rawResponse: {} };
    }
  }

  async getOrderStatus(orderId) {
    try {
      const res = await axios.get(`${UPSTOX_BASE_URL}/order/details?order_id=${orderId}`, {
        headers: this._headers(), timeout: 8000
      });
      const d = res.data?.data;
      return {
        status: d?.status || 'UNKNOWN',
        filledQty: d?.filled_quantity || 0,
        avgPrice: d?.average_price || 0,
        rawResponse: d,
      };
    } catch (err) {
      return { status: 'ERROR', filledQty: 0, avgPrice: 0, rawResponse: {} };
    }
  }

  async getPositions() {
    try {
      const res = await axios.get(`${UPSTOX_BASE_URL}/portfolio/short-term-positions`, {
        headers: this._headers(), timeout: 8000
      });
      return (res.data?.data || []).map(p => ({
        symbol: p.tradingsymbol,
        side: (p.quantity || 0) > 0 ? 'BUY' : 'SELL',
        qty: Math.abs(p.quantity || 0),
        avgPrice: p.average_price || 0,
        ltp: p.last_price || 0,
        pnl: p.unrealised_profit || 0,
        raw: p,
      }));
    } catch (err) { return []; }
  }

  async getHoldings() {
    try {
      const res = await axios.get(`${UPSTOX_BASE_URL}/portfolio/long-term-holdings`, {
        headers: this._headers(), timeout: 8000
      });
      return (res.data?.data || []).map(h => ({
        symbol: h.tradingsymbol,
        qty: h.quantity || 0,
        avgPrice: h.average_price || 0,
        currentValue: (h.last_price || 0) * (h.quantity || 0),
        pnl: h.pnl || 0,
        raw: h,
      }));
    } catch (err) { return []; }
  }

  async getLTP(symbol, exchange) {
    try {
      const instrumentKey = `${exchange}_EQ|${symbol}`;
      const res = await axios.get(`${UPSTOX_BASE_URL}/market-quote/ltp?instrument_key=${encodeURIComponent(instrumentKey)}`, {
        headers: this._headers(), timeout: 8000
      });
      const data = res.data?.data?.[instrumentKey];
      return { ltp: data?.last_price || 0, symbol };
    } catch (err) { return { ltp: 0, symbol }; }
  }

  async getFunds() {
    try {
      const res = await axios.get(`${UPSTOX_BASE_URL}/user/fund-margin`, {
        headers: this._headers(), timeout: 8000
      });
      const equity = res.data?.data?.equity;
      return {
        available: equity?.available_margin || 0,
        used: equity?.used_margin || 0,
        total: equity?.net || 0,
      };
    } catch (err) { return { available: 0, used: 0, total: 0 }; }
  }
}

module.exports = UpstoxAdapter;
