/**
 * AngelOneAdapter — Hello Trader Broker Adapter for Angel One (SmartAPI)
 * API Docs: https://smartapi.angelbroking.com/docs
 * Implements IBrokerAdapter
 *
 * Authentication Flow:
 *   1. POST /rest/auth/angelbroking/user/v1/loginByPassword with apiKey, clientcode, password, totp
 *   2. Receive jwtToken (access token) — valid for 1 day
 *   3. Use jwtToken in X-UserType, X-SourceID, X-ClientLocalIP, X-ClientPublicIP, X-MACAddress headers
 */

const axios = require('axios');
const IBrokerAdapter = require('../IBrokerAdapter');

const ANGEL_BASE_URL = 'https://apiconnect.angelbroking.com';

class AngelOneAdapter extends IBrokerAdapter {
  constructor(credentials) {
    super(credentials);
    this.brokerName = 'ANGELONE';
    this.apiKey = credentials.apiKey;
    this.clientCode = credentials.clientId;
    this.password = credentials.password;
    this.totpSecret = credentials.totpSecret; // Base32 TOTP secret for TOTP generation
    this.jwtToken = credentials.accessToken || null;
    this.refreshToken = credentials.refreshToken || null;
    this.feedToken = null;
  }

  _generateTOTP() {
    try {
      if (this.credentials.totp && String(this.credentials.totp).length === 6) {
        return String(this.credentials.totp);
      }
      const { authenticator } = require('otplib');
      return authenticator.generate(this.totpSecret);
    } catch (e) {
      try {
        const totp = require('node-totp-generator');
        return totp(this.totpSecret);
      } catch (err) {
        return this.credentials.totp || '000000';
      }
    }
  }

  _headers(withAuth = true) {
    const h = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-UserType': 'USER',
      'X-SourceID': 'WEB',
      'X-ClientLocalIP': '192.168.1.1',
      'X-ClientPublicIP': '106.193.137.95',
      'X-MACAddress': '00-00-00-00-00-01',
      'X-PrivateKey': this.apiKey,
    };
    if (withAuth && this.jwtToken) {
      h['Authorization'] = `Bearer ${this.jwtToken}`;
    }
    return h;
  }

  async authenticate() {
    try {
      const totp = this._generateTOTP();
      const res = await axios.post(
        `${ANGEL_BASE_URL}/rest/auth/angelbroking/user/v1/loginByPassword`,
        { clientcode: this.clientCode, password: this.password, totp },
        { headers: this._headers(false), timeout: 15000 }
      );
      if (res.data?.status === true) {
        this.jwtToken = res.data.data?.jwtToken;
        this.refreshToken = res.data.data?.refreshToken;
        this.feedToken = res.data.data?.feedToken;
        return { success: true, message: 'Angel One authenticated successfully', jwtToken: this.jwtToken };
      }
      return { success: false, message: res.data?.message || 'Angel One authentication failed' };
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      return { success: false, message: `Angel One auth error: ${msg}` };
    }
  }

  async testConnection() {
    try {
      if (!this.jwtToken) {
        const auth = await this.authenticate();
        if (!auth.success) return { success: false, message: auth.message, profile: null };
      }
      const res = await axios.get(
        `${ANGEL_BASE_URL}/rest/secure/angelbroking/user/v1/getProfile`,
        { headers: this._headers(), timeout: 8000 }
      );
      if (res.data?.status === true) {
        return {
          success: true,
          message: 'Angel One connection successful',
          profile: {
            name: res.data.data?.name,
            clientCode: res.data.data?.clientcode,
            email: res.data.data?.email,
          }
        };
      }
      return { success: false, message: res.data?.message || 'Profile fetch failed', profile: null };
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      return { success: false, message: `Angel One test failed: ${msg}`, profile: null };
    }
  }

  async placeOrder(order) {
    try {
      if (!this.jwtToken) {
        const auth = await this.authenticate();
        if (!auth.success) return { success: false, orderId: null, message: auth.message, rawResponse: {} };
      }

      const variety = order.orderType === 'MARKET' ? 'NORMAL' : 'NORMAL';
      const body = {
        variety,
        tradingsymbol: order.symbol,
        symboltoken: order.symbolToken || '',
        transactiontype: order.side === 'BUY' ? 'BUY' : 'SELL',
        exchange: order.exchange || 'NSE',
        ordertype: order.orderType || 'MARKET',
        producttype: order.productType === 'MIS' ? 'INTRADAY' : order.productType === 'CNC' ? 'DELIVERY' : 'CARRYFORWARD',
        duration: 'DAY',
        price: order.price ? String(order.price) : '0',
        squareoff: order.target ? String(order.target) : '0',
        stoploss: order.sl ? String(order.sl) : '0',
        quantity: String(order.quantity),
        triggerprice: order.triggerPrice ? String(order.triggerPrice) : '0',
      };

      const res = await axios.post(
        `${ANGEL_BASE_URL}/rest/secure/angelbroking/order/v1/placeOrder`,
        body, { headers: this._headers(), timeout: 10000 }
      );

      return {
        success: res.data?.status === true,
        orderId: res.data?.data?.orderid || null,
        message: res.data?.message || 'Order placed on Angel One',
        rawResponse: res.data,
      };
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      return { success: false, orderId: null, message: `Angel One order failed: ${msg}`, rawResponse: err.response?.data || {} };
    }
  }

  async modifyOrder(orderId, modifications) {
    try {
      if (!this.jwtToken) await this.authenticate();
      const body = {
        variety: 'NORMAL',
        orderid: orderId,
        ordertype: modifications.orderType || 'LIMIT',
        producttype: modifications.productType || 'INTRADAY',
        duration: 'DAY',
        price: String(modifications.price || 0),
        quantity: String(modifications.quantity || 0),
        triggerprice: String(modifications.triggerPrice || 0),
      };
      const res = await axios.post(
        `${ANGEL_BASE_URL}/rest/secure/angelbroking/order/v1/modifyOrder`,
        body, { headers: this._headers(), timeout: 10000 }
      );
      return { success: res.data?.status === true, message: res.data?.message, rawResponse: res.data };
    } catch (err) {
      return { success: false, message: err.response?.data?.message || err.message, rawResponse: {} };
    }
  }

  async cancelOrder(orderId) {
    try {
      if (!this.jwtToken) await this.authenticate();
      const res = await axios.post(
        `${ANGEL_BASE_URL}/rest/secure/angelbroking/order/v1/cancelOrder`,
        { variety: 'NORMAL', orderid: orderId },
        { headers: this._headers(), timeout: 10000 }
      );
      return { success: res.data?.status === true, message: res.data?.message, rawResponse: res.data };
    } catch (err) {
      return { success: false, message: err.response?.data?.message || err.message, rawResponse: {} };
    }
  }

  async getOrderStatus(orderId) {
    try {
      if (!this.jwtToken) await this.authenticate();
      const res = await axios.get(
        `${ANGEL_BASE_URL}/rest/secure/angelbroking/order/v1/details/${orderId}`,
        { headers: this._headers(), timeout: 8000 }
      );
      const d = res.data?.data;
      return {
        status: d?.orderstatus || 'UNKNOWN',
        filledQty: parseInt(d?.filledshares || 0),
        avgPrice: parseFloat(d?.averageprice || 0),
        rawResponse: d,
      };
    } catch (err) {
      return { status: 'ERROR', filledQty: 0, avgPrice: 0, rawResponse: {} };
    }
  }

  async getPositions() {
    try {
      if (!this.jwtToken) await this.authenticate();
      const res = await axios.get(
        `${ANGEL_BASE_URL}/rest/secure/angelbroking/order/v1/getPosition`,
        { headers: this._headers(), timeout: 8000 }
      );
      return (res.data?.data || []).map(p => ({
        symbol: p.tradingsymbol,
        side: parseInt(p.netqty) > 0 ? 'BUY' : 'SELL',
        qty: Math.abs(parseInt(p.netqty)),
        avgPrice: parseFloat(p.averageprice),
        ltp: parseFloat(p.ltp),
        pnl: parseFloat(p.unrealised),
        raw: p,
      }));
    } catch (err) { return []; }
  }

  async getHoldings() {
    try {
      if (!this.jwtToken) await this.authenticate();
      const res = await axios.get(
        `${ANGEL_BASE_URL}/rest/secure/angelbroking/portfolio/v1/getHolding`,
        { headers: this._headers(), timeout: 8000 }
      );
      return (res.data?.data || []).map(h => ({
        symbol: h.tradingsymbol,
        qty: parseInt(h.quantity),
        avgPrice: parseFloat(h.averageprice),
        currentValue: parseFloat(h.ltp) * parseInt(h.quantity),
        pnl: parseFloat(h.profitandloss),
        raw: h,
      }));
    } catch (err) { return []; }
  }

  async getLTP(symbol, exchange) {
    try {
      if (!this.jwtToken) await this.authenticate();
      // Use market data API
      const res = await axios.post(
        `${ANGEL_BASE_URL}/rest/secure/angelbroking/market/v1/quote/`,
        { mode: 'LTP', exchangeTokens: { [exchange]: [symbol] } },
        { headers: this._headers(), timeout: 8000 }
      );
      const ltp = res.data?.data?.fetched?.[0]?.ltp || 0;
      return { ltp, symbol };
    } catch (err) { return { ltp: 0, symbol }; }
  }

  async getFunds() {
    try {
      if (!this.jwtToken) await this.authenticate();
      const res = await axios.get(
        `${ANGEL_BASE_URL}/rest/secure/angelbroking/user/v1/getRMS`,
        { headers: this._headers(), timeout: 8000 }
      );
      const d = res.data?.data;
      return {
        available: parseFloat(d?.availablecash || 0),
        used: parseFloat(d?.utiliseddebits || 0),
        total: parseFloat(d?.net || 0),
      };
    } catch (err) { return { available: 0, used: 0, total: 0 }; }
  }
}

module.exports = AngelOneAdapter;
