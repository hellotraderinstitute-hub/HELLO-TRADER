/**
 * GoPocketAdapter.js — Client-Side GoPocket / SkyPro Adapter (Phase 2)
 *
 * Implements IBrokerAdapter for GoPocket Open API.
 * Phase 2 supports MOCK transport and payload normalization with zero live orders.
 */

const axios = require('axios');
const crypto = require('crypto');
const IBrokerAdapter = require('./IBrokerAdapter');

const GOPOCKET_API_BASE = 'https://api.gopocket.in';
const GOPOCKET_AUTH_BASE = 'https://web.gopocket.in';

class GoPocketAdapter extends IBrokerAdapter {
  constructor(credentials = {}, options = {}) {
    super(credentials, options);
    this.brokerName = 'GOPOCKET';
    this.clientId = credentials.clientId || '';
    this.appCode = credentials.apiKey || credentials.appCode || '';
    this.apiSecret = credentials.apiSecret || '';
    this.authCode = credentials.authCode || null;
    this.accessToken = credentials.accessToken || credentials.userSession || null;
    this.ipaddr = options.publicIp || '127.0.0.1';
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
   * GoPocket SSO SHA-256 Checksum Auth Flow:
   * Checksum = SHA-256(userId + authCode + apiSecret)
   */
  async connect() {
    if (this.isMock) {
      this.connected = true;
      this.accessToken = 'mock_gopocket_session_token_12345';
      return {
        success: true,
        message: 'GoPocket mock connected successfully.',
        session: { clientId: this.clientId, userSession: this.accessToken }
      };
    }

    if (this.accessToken) {
      this.connected = true;
      return { success: true, message: 'GoPocket session active.', session: { clientId: this.clientId } };
    }

    if (!this.appCode || !this.apiSecret || !this.authCode) {
      return { success: false, message: 'GoPocket appCode, apiSecret, and authCode are required.' };
    }

    try {
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
        this.connected = true;
        return { success: true, message: 'GoPocket authenticated successfully.', session: { userSession: this.accessToken } };
      }
      return { success: false, message: res.data?.message || 'GoPocket SSO authentication failed.' };
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      return { success: false, message: `GoPocket auth error: ${msg}` };
    }
  }

  async disconnect() {
    this.connected = false;
    this.accessToken = null;
    return { success: true, message: 'GoPocket disconnected.' };
  }

  async healthCheck() {
    if (this.isMock) return { success: true, latencyMs: 14, message: 'GoPocket mock healthy.' };
    return { success: this.connected, message: 'GoPocket status checked.' };
  }

  /**
   * Place Order on GoPocket (JSON Array payload format)
   */
  async placeOrder(order) {
    if (!this.isMock && !this.clientId) {
      return { success: false, orderId: null, status: 'REJECTED', message: 'GoPocket clientId missing.' };
    }

    const payload = [{
      exchange: order.exchange || 'NFO',
      tradingSymbol: order.symbol,
      qty: String(order.quantity || 1),
      price: order.price ? String(order.price) : '0',
      product: order.productType === 'MIS' ? 'MIS' : order.productType === 'CNC' ? 'CNC' : 'NRML',
      transType: (order.side || 'BUY').toUpperCase() === 'BUY' ? 'B' : 'S',
      priceType: order.orderType === 'MARKET' ? 'MKT' : 'L',
      orderType: 'Regular',
      ret: 'DAY',
      source: 'API',
      ipaddr: this.ipaddr,
      triggerPrice: order.triggerPrice ? String(order.triggerPrice) : '',
      target: order.target ? String(order.target) : '',
      stopLoss: order.sl ? String(order.sl) : '',
      Remarks: 'HelloTrader_ClientAgent'
    }];

    if (this.isMock) {
      const mockOrderId = `gopocket_ord_${Date.now()}`;
      return {
        success: true,
        orderId: mockOrderId,
        status: 'SUBMITTED',
        filledQty: 0,
        avgPrice: Number(payload[0].price) || 0,
        message: 'GoPocket mock order accepted.',
        rawResponse: { orderId: mockOrderId, status: 'success', payload }
      };
    }

    try {
      const res = await axios.post(`${GOPOCKET_API_BASE}/od-rest/orders/execute`, payload, {
        headers: this._headers(),
        timeout: 10000
      });
      const isSuccess = res.data?.status === 'success' || res.data?.status === true || res.data?.[0]?.status === 'success';
      const orderId = res.data?.orderId || res.data?.data?.orderId || res.data?.[0]?.orderId || null;
      return {
        success: isSuccess,
        orderId,
        status: isSuccess ? 'SUBMITTED' : 'REJECTED',
        message: res.data?.message || 'GoPocket order processed.',
        rawResponse: res.data,
      };
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      return { success: false, orderId: null, status: 'REJECTED', message: `GoPocket rejected: ${msg}`, rawResponse: err.response?.data || {} };
    }
  }

  async modifyOrder(orderId, modifications) {
    if (this.isMock) return { success: true, message: 'GoPocket mock modified.' };
    return { success: false, message: 'Live modify deferred.' };
  }

  async cancelOrder(orderId) {
    if (this.isMock) return { success: true, message: 'GoPocket mock cancelled.' };
    return { success: false, message: 'Live cancel deferred.' };
  }

  async getOrderStatus(orderId) {
    if (this.isMock) return { success: true, status: 'FILLED', filledQty: 65, avgPrice: 24500 };
    return { success: false, status: 'UNKNOWN' };
  }

  async getPositions() {
    if (this.isMock) return { success: true, positions: [] };
    return { success: false, positions: [] };
  }

  async getFunds() {
    if (this.isMock) return { success: true, availableCash: 100000, collateral: 0, utilized: 0 };
    return { success: false, availableCash: 0, collateral: 0, utilized: 0 };
  }
}

module.exports = GoPocketAdapter;
