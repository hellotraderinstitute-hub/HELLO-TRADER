/**
 * GoPocketAdapter — Hello Trader Broker Adapter for GoPocket (https://www.gopocket.in)
 * API Docs: https://api.gopocket.in/
 * Developer Portal: https://web.gopocket.in/developers
 *
 * Implements IBrokerAdapter for GoPocket Open API.
 *
 * Endpoints:
 *   - Base API URL: https://api.gopocket.in/
 *   - SSO Vendor Auth: POST https://web.gopocket.in/am/sso/vendor/getUserDetails
 *   - Place Order: POST https://api.gopocket.in/od-rest/orders/execute
 *   - Positions: GET https://api.gopocket.in/od-rest/positions
 *   - Profile / User Details: GET https://api.gopocket.in/od-rest/user/profile
 */

const axios = require('axios');
const crypto = require('crypto');
const IBrokerAdapter = require('../IBrokerAdapter');

const GOPOCKET_API_BASE = 'https://api.gopocket.in';
const GOPOCKET_AUTH_BASE = 'https://web.gopocket.in';

class GoPocketAdapter extends IBrokerAdapter {
  constructor(credentials) {
    super(credentials);
    this.brokerName = 'GOPOCKET';
    this.clientId = credentials.clientId;
    this.appCode = credentials.apiKey || credentials.appCode;
    this.apiSecret = credentials.apiSecret;
    this.authCode = credentials.authCode || null;
    this.accessToken = credentials.accessToken || credentials.userSession || null;
  }

  _headers() {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${this.accessToken}`,
      'userSession': this.accessToken || '',
      'appcode': this.appCode || '',
    };
  }

  /**
   * Authenticate with GoPocket using SHA-256 Checksum SSO flow:
   * Checksum = SHA-256(userId + authCode + apiSecret)
   */
  async authenticate() {
    try {
      if (this.accessToken) {
        return { success: true, message: 'GoPocket access token loaded', accessToken: this.accessToken };
      }

      if (!this.appCode || !this.apiSecret) {
        return { success: false, message: 'GoPocket appCode and apiSecret are required' };
      }

      if (!this.authCode) {
        return { success: false, message: 'GoPocket authCode required from SSO login flow.' };
      }

      const checksumRaw = `${this.clientId}${this.authCode}${this.apiSecret}`;
      const checksum = crypto.createHash('sha256').update(checksumRaw).digest('hex');

      const res = await axios.post(`${GOPOCKET_AUTH_BASE}/am/sso/vendor/getUserDetails`, {
        appcode: this.appCode,
        userId: this.clientId,
        authCode: this.authCode,
        checksum,
      }, { timeout: 10000 });

      if (res.data?.status === true || res.data?.userSession) {
        this.accessToken = res.data?.userSession || res.data?.data?.userSession;
        return { success: true, message: 'GoPocket authenticated successfully', accessToken: this.accessToken };
      }

      return { success: false, message: res.data?.message || 'GoPocket SSO authentication failed' };
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      return { success: false, message: `GoPocket auth error: ${msg}` };
    }
  }

  async testConnection() {
    try {
      if (!this.accessToken) {
        const auth = await this.authenticate();
        if (!auth.success) return { success: false, message: auth.message, profile: null };
      }
      const res = await axios.get(`${GOPOCKET_API_BASE}/od-rest/user/profile`, {
        headers: this._headers(), timeout: 8000
      });
      const isSuccess = res.data?.status === 'success' || res.data?.status === true;
      return {
        success: isSuccess,
        message: isSuccess ? 'GoPocket connection verified' : (res.data?.message || 'Profile fetch failed'),
        profile: {
          clientId: this.clientId,
          name: res.data?.data?.clientName || res.data?.data?.name || this.clientId,
          email: res.data?.data?.email || null,
        }
      };
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      return { success: false, message: `GoPocket test failed: ${msg}`, profile: null };
    }
  }

  /**
   * Place order on GoPocket API
   * Endpoint: POST https://api.gopocket.in/od-rest/orders/execute
   * Format: Array of Order objects [{ exchange, tradingSymbol, qty, price, product, transType, priceType, orderType, ret }]
   */
  async placeOrder(order) {
    try {
      if (!this.accessToken) {
        const auth = await this.authenticate();
        if (!auth.success) return { success: false, orderId: null, message: auth.message, rawResponse: {} };
      }

      const payload = [{
        exchange: order.exchange || 'NFO',
        tradingSymbol: order.symbol,
        qty: String(order.quantity),
        price: order.price ? String(order.price) : '0',
        product: order.productType === 'MIS' ? 'MIS' : order.productType === 'CNC' ? 'CNC' : 'NRML',
        transType: order.side === 'BUY' ? 'B' : 'S',
        priceType: order.orderType === 'MARKET' ? 'MKT' : 'L',
        orderType: 'Regular',
        ret: 'DAY',
        source: 'API',
        triggerPrice: order.triggerPrice ? String(order.triggerPrice) : '',
        disclosedQty: '',
        mktProtection: '',
        target: order.target ? String(order.target) : '',
        stopLoss: order.sl ? String(order.sl) : '',
        trailingPrice: '',
        Remarks: 'HelloTrader_Algo'
      }];

      const res = await axios.post(`${GOPOCKET_API_BASE}/od-rest/orders/execute`, payload, {
        headers: this._headers(), timeout: 10000
      });

      const isSuccess = res.data?.status === 'success' || res.data?.status === true || res.data?.[0]?.status === 'success';
      const orderId = res.data?.orderId || res.data?.data?.orderId || res.data?.[0]?.orderId || null;

      return {
        success: isSuccess,
        orderId,
        message: res.data?.message || (isSuccess ? 'GoPocket order placed successfully' : 'GoPocket order rejected'),
        rawResponse: res.data,
      };
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      return { success: false, orderId: null, message: `GoPocket order failed: ${msg}`, rawResponse: err.response?.data || {} };
    }
  }

  async modifyOrder(orderId, modifications) {
    try {
      if (!this.accessToken) await this.authenticate();
      const payload = {
        orderId,
        qty: String(modifications.quantity || 0),
        price: String(modifications.price || 0),
        priceType: modifications.orderType === 'MARKET' ? 'MKT' : 'L',
      };
      const res = await axios.post(`${GOPOCKET_API_BASE}/od-rest/orders/modify`, payload, {
        headers: this._headers(), timeout: 10000
      });
      return { success: res.data?.status === true, message: res.data?.message, rawResponse: res.data };
    } catch (err) {
      return { success: false, message: err.message, rawResponse: {} };
    }
  }

  async cancelOrder(orderId) {
    try {
      if (!this.accessToken) await this.authenticate();
      const res = await axios.post(`${GOPOCKET_API_BASE}/od-rest/orders/cancel`, { orderId }, {
        headers: this._headers(), timeout: 10000
      });
      return { success: res.data?.status === true, message: res.data?.message, rawResponse: res.data };
    } catch (err) {
      return { success: false, message: err.message, rawResponse: {} };
    }
  }

  async getPositions() {
    try {
      if (!this.accessToken) await this.authenticate();
      const res = await axios.get(`${GOPOCKET_API_BASE}/od-rest/positions`, {
        headers: this._headers(), timeout: 10000
      });
      const list = res.data?.data || res.data || [];
      const positions = Array.isArray(list) ? list.map(p => ({
        symbol: p.tradingSymbol || p.symbol,
        exchange: p.exchange || 'NFO',
        productType: p.product || 'MIS',
        side: Number(p.netQty || p.quantity || 0) > 0 ? 'BUY' : 'SELL',
        quantity: Math.abs(Number(p.netQty || p.quantity || 0)),
        buyPrice: parseFloat(p.buyPrice || p.avgPrice || 0),
        currentPrice: parseFloat(p.ltp || 0),
        pnl: parseFloat(p.pnl || 0),
        status: Number(p.netQty || 0) !== 0 ? 'OPEN' : 'CLOSED',
      })) : [];
      return { success: true, positions };
    } catch (err) {
      return { success: false, positions: [], message: err.message };
    }
  }

  async getOrders() {
    try {
      if (!this.accessToken) await this.authenticate();
      const res = await axios.get(`${GOPOCKET_API_BASE}/od-rest/orders/book`, {
        headers: this._headers(), timeout: 10000
      });
      const list = res.data?.data || res.data || [];
      const orders = Array.isArray(list) ? list.map(o => ({
        orderId: o.orderId || String(o.id),
        symbol: o.tradingSymbol || o.symbol,
        exchange: o.exchange || 'NFO',
        side: o.transType === 'B' ? 'BUY' : 'SELL',
        totalQty: Number(o.qty || 0),
        filledQty: Number(o.filledQty || o.qty || 0),
        avgPrice: parseFloat(o.avgPrice || o.price || 0),
        status: o.status === 'COMPLETE' ? 'FILLED' : o.status,
        productType: o.product === 'MIS' ? 'MIS' : 'NRML',
        orderType: o.priceType === 'MKT' ? 'MARKET' : 'LIMIT',
      })) : [];
      return orders;
    } catch (err) {
      return [];
    }
  }
}

module.exports = GoPocketAdapter;
