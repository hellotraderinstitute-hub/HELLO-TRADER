/**
 * AngelOneAdapter.js — Client-Side Angel One SmartAPI Adapter (Phase 2)
 *
 * Implements IBrokerAdapter for Angel One SmartAPI.
 * Phase 2 supports MOCK transport and payload normalization with zero live orders.
 */

const axios = require('axios');
const IBrokerAdapter = require('./IBrokerAdapter');

const ANGEL_BASE_URL = 'https://apiconnect.angelbroking.com';

class AngelOneAdapter extends IBrokerAdapter {
  constructor(credentials = {}, options = {}) {
    super(credentials, options);
    this.brokerName = 'ANGELONE';
    this.apiKey = credentials.apiKey || '';
    this.clientCode = credentials.clientId || '';
    this.password = credentials.password || credentials.pin || '';
    this.totpSecret = credentials.totpSecret || '';
    this.jwtToken = credentials.accessToken || null;
    this.feedToken = null;
    this.publicIp = options.publicIp || '127.0.0.1';
  }

  _generateTOTP() {
    if (!this.totpSecret) return '000000';
    try {
      const crypto = require('crypto');
      const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
      let cleanSecret = String(this.totpSecret).replace(/[\s=]/g, '').toUpperCase();
      let bits = '';
      for (let i = 0; i < cleanSecret.length; i++) {
        const val = base32chars.indexOf(cleanSecret.charAt(i));
        if (val === -1) continue;
        bits += val.toString(2).padStart(5, '0');
      }
      const bytes = [];
      for (let i = 0; i + 8 <= bits.length; i += 8) {
        bytes.push(parseInt(bits.substr(i, 8), 2));
      }
      const key = Buffer.from(bytes);
      const epoch = Math.floor(Date.now() / 1000);
      const timeStep = Math.floor(epoch / 30);
      const timeBuf = Buffer.alloc(8);
      timeBuf.writeBigUInt64BE(BigInt(timeStep));

      const hmac = crypto.createHmac('sha1', key);
      hmac.update(timeBuf);
      const digest = hmac.digest();

      const offset = digest[digest.length - 1] & 0xf;
      const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1000000;
      return code.toString().padStart(6, '0');
    } catch (err) {
      return '000000';
    }
  }

  _headers(withAuth = true) {
    const h = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-UserType': 'USER',
      'X-SourceID': 'WEB',
      'X-ClientLocalIP': '192.168.1.1',
      'X-ClientPublicIP': this.publicIp,
      'X-MACAddress': '00-00-00-00-00-01',
      'X-PrivateKey': this.apiKey,
    };
    if (withAuth && this.jwtToken) {
      h['Authorization'] = `Bearer ${this.jwtToken}`;
    }
    return h;
  }

  async connect() {
    if (!this.clientCode || !this.apiKey) {
      return { success: false, message: 'Angel One apiKey and clientId are required.' };
    }

    if (this.isMock) {
      this.connected = true;
      this.jwtToken = 'mock_angel_jwt_token_12345';
      return {
        success: true,
        message: 'Angel One mock connected successfully.',
        session: { clientCode: this.clientCode, token: this.jwtToken }
      };
    }

    try {
      const totp = this._generateTOTP();
      const res = await this.getHttpClient().post(
        `${ANGEL_BASE_URL}/rest/auth/angelbroking/user/v1/loginByPassword`,
        { clientcode: this.clientCode, password: this.password, totp },
        { headers: this._headers(false), timeout: 12000 }
      );
      if (res.data?.status === true) {
        this.jwtToken = res.data.data?.jwtToken;
        this.feedToken = res.data.data?.feedToken;
        this.connected = true;
        return {
          success: true,
          message: 'Angel One authenticated successfully.',
          session: { clientCode: this.clientCode, jwtToken: this.jwtToken }
        };
      }
      return { success: false, message: res.data?.message || 'Angel One login failed.' };
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      return { success: false, message: `Angel One auth error: ${msg}` };
    }
  }

  async disconnect() {
    this.connected = false;
    this.jwtToken = null;
    return { success: true, message: 'Angel One disconnected.' };
  }

  async healthCheck() {
    if (this.isMock) {
      return { success: true, latencyMs: 15, message: 'Angel One mock healthy.' };
    }
    const start = Date.now();
    try {
      const res = await this.getHttpClient().get(`${ANGEL_BASE_URL}/rest/secure/angelbroking/user/v1/getProfile`, {
        headers: this._headers(),
        timeout: 5000
      });
      return {
        success: res.data?.status === true,
        latencyMs: Date.now() - start,
        message: 'Angel One API responsive.',
      };
    } catch (err) {
      return { success: false, latencyMs: Date.now() - start, message: err.message };
    }
  }

  async placeOrder(order) {
    if (!this.isMock && (!this.clientCode || !this.apiKey)) {
      return { success: false, orderId: null, status: 'REJECTED', message: 'Angel One credentials missing.' };
    }

    const angelPayload = {
      variety: 'NORMAL',
      tradingsymbol: order.symbol,
      symboltoken: String(order.securityId || order.symbolToken || ''),
      transactiontype: (order.side || 'BUY').toUpperCase(),
      exchange: order.exchange || 'NFO',
      ordertype: order.orderType || 'MARKET',
      producttype: order.productType === 'MIS' ? 'INTRADAY' : order.productType === 'CNC' ? 'DELIVERY' : 'CARRYFORWARD',
      duration: 'DAY',
      price: String(order.price || '0'),
      squareoff: '0',
      stoploss: '0',
      quantity: String(order.quantity || 1),
      triggerprice: String(order.triggerPrice || '0'),
    };

    if (this.isMock) {
      const mockOrderId = `angel_ord_${Date.now()}`;
      return {
        success: true,
        orderId: mockOrderId,
        status: 'SUBMITTED',
        filledQty: 0,
        avgPrice: Number(angelPayload.price) || 0,
        message: 'Angel One mock order accepted.',
        rawResponse: { orderid: mockOrderId, status: true, payload: angelPayload }
      };
    }

    try {
      const res = await this.getHttpClient().post(
        `${ANGEL_BASE_URL}/rest/secure/angelbroking/order/v1/placeOrder`,
        angelPayload,
        { headers: this._headers(), timeout: 10000 }
      );
      return {
        success: res.data?.status === true,
        orderId: res.data?.data?.orderid || null,
        status: res.data?.status === true ? 'SUBMITTED' : 'REJECTED',
        message: res.data?.message || 'Angel One order response received.',
        rawResponse: res.data,
      };
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      return { success: false, orderId: null, status: 'REJECTED', message: `Angel One rejected: ${msg}`, rawResponse: err.response?.data || {} };
    }
  }

  async modifyOrder(orderId, modifications) {
    if (this.isMock) return { success: true, message: 'Angel One mock modified.' };
    return { success: false, message: 'Live modify deferred.' };
  }

  async cancelOrder(orderId) {
    if (this.isMock) return { success: true, message: 'Angel One mock cancelled.' };
    return { success: false, message: 'Live cancel deferred.' };
  }

  async getOrderStatus(orderId) {
    if (this.isMock) return { success: true, status: 'COMPLETE', filledQty: 65, avgPrice: 24500 };
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

module.exports = AngelOneAdapter;
