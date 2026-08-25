/**
 * DhanAdapter.js — Client-Side DhanHQ v2 Adapter (Phase 2)
 *
 * Implements IBrokerAdapter for DhanHQ API v2.
 * Phase 2 supports MOCK transport and payload normalization with zero live orders.
 */

const axios = require('axios');
const IBrokerAdapter = require('./IBrokerAdapter');

const DHAN_BASE_URL = 'https://api.dhan.co/v2';

class DhanAdapter extends IBrokerAdapter {
  constructor(credentials = {}, options = {}) {
    super(credentials, options);
    this.brokerName = 'DHAN';
    this.clientId = String(credentials.clientId || '');
    this.accessToken = credentials.accessToken || '';
    this.staticIp = options.staticIp || null;
  }

  _headers() {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'access-token': this.accessToken,
      'client-id': this.clientId,
    };
  }

  /**
   * Connect / Validate Dhan JWT Token
   */
  async connect() {
    if (!this.clientId || !this.accessToken) {
      return { success: false, message: 'Dhan clientId and accessToken are required.' };
    }

    if (this.isMock) {
      this.connected = true;
      return {
        success: true,
        message: 'Dhan mock connected successfully.',
        session: { clientId: this.clientId, tokenType: 'MOCK_JWT' }
      };
    }

    try {
      const res = await this.getHttpClient().get(`${DHAN_BASE_URL}/fundlimit`, {
        headers: this._headers(),
        timeout: 8000
      });
      if (res.status === 200) {
        this.connected = true;
        return {
          success: true,
          message: 'Dhan authentication verified.',
          session: { clientId: this.clientId, availableBalance: res.data?.availabelBalance || 0 }
        };
      }
      return { success: false, message: `Dhan auth failed with status ${res.status}` };
    } catch (err) {
      const msg = err.response?.data?.errorMessage || err.message;
      return { success: false, message: `Dhan connection error: ${msg}` };
    }
  }

  async disconnect() {
    this.connected = false;
    return { success: true, message: 'Dhan disconnected.' };
  }

  async healthCheck() {
    if (this.isMock) {
      return { success: true, latencyMs: 12, message: 'Dhan mock healthy.' };
    }
    const start = Date.now();
    try {
      const res = await this.getHttpClient().get(`${DHAN_BASE_URL}/fundlimit`, {
        headers: this._headers(),
        timeout: 5000
      });
      return {
        success: res.status === 200,
        latencyMs: Date.now() - start,
        message: 'Dhan API responsive.',
      };
    } catch (err) {
      return { success: false, latencyMs: Date.now() - start, message: err.message };
    }
  }

  /**
   * Construct and place a normalized Dhan order
   */
  async placeOrder(order) {
    if (!this.isMock && (!this.clientId || !this.accessToken)) {
      return { success: false, orderId: null, status: 'REJECTED', message: 'Dhan credentials missing.' };
    }

    // Normalized Dhan Request Payload
    const dhanPayload = {
      dhanClientId: this.clientId,
      transactionType: (order.side || 'BUY').toUpperCase(),
      exchangeSegment: order.exchange === 'NSE_EQ' || order.exchange === 'NSE' ? 'NSE_EQ' : (order.exchange || 'NSE_FNO'),
      productType: order.productType === 'MIS' ? 'INTRADAY' : order.productType === 'CNC' ? 'CNC' : 'MARGIN',
      orderType: order.orderType || 'MARKET',
      validity: 'DAY',
      tradingSymbol: order.symbol,
      securityId: String(order.securityId || ''),
      quantity: Number(order.quantity || 1),
      price: Number(order.price || 0),
      triggerPrice: Number(order.triggerPrice || 0),
      disclosedQuantity: 0,
      afterMarketOrder: !!order.afterMarketOrder,
      amoTime: order.afterMarketOrder ? 'OPEN' : undefined,
    };

    if (this.isMock) {
      const mockOrderId = `dhan_ord_${Date.now()}`;
      return {
        success: true,
        orderId: mockOrderId,
        status: 'PENDING',
        filledQty: 0,
        avgPrice: dhanPayload.price || 0,
        message: 'Dhan mock order accepted.',
        rawResponse: { orderId: mockOrderId, orderStatus: 'PENDING', payload: dhanPayload }
      };
    }

    try {
      const res = await this.getHttpClient().post(`${DHAN_BASE_URL}/orders`, dhanPayload, {
        headers: this._headers(),
        timeout: 10000
      });
      return {
        success: res.status === 200 || res.status === 201,
        orderId: res.data?.orderId || null,
        status: res.data?.orderStatus || 'SUBMITTED',
        message: res.data?.orderStatus || 'Dhan order dispatched.',
        rawResponse: res.data,
      };
    } catch (err) {
      const errorMsg = err.response?.data?.errorMessage || err.message;
      return {
        success: false,
        orderId: null,
        status: 'REJECTED',
        message: `Dhan rejected: ${errorMsg}`,
        rawResponse: err.response?.data || {}
      };
    }
  }

  async modifyOrder(orderId, modifications) {
    if (this.isMock) {
      return { success: true, message: 'Dhan mock order modified.', rawResponse: { orderId } };
    }
    try {
      const res = await this.getHttpClient().put(`${DHAN_BASE_URL}/orders/${orderId}`, modifications, {
        headers: this._headers(),
        timeout: 8000
      });
      return { success: true, message: 'Dhan order modified.', rawResponse: res.data };
    } catch (err) {
      return { success: false, message: err.message, rawResponse: err.response?.data || {} };
    }
  }

  async cancelOrder(orderId) {
    if (this.isMock) {
      return { success: true, message: 'Dhan mock order cancelled.', rawResponse: { orderId } };
    }
    try {
      const res = await this.getHttpClient().delete(`${DHAN_BASE_URL}/orders/${orderId}`, {
        headers: this._headers(),
        timeout: 8000
      });
      return { success: true, message: 'Dhan order cancelled.', rawResponse: res.data };
    } catch (err) {
      return { success: false, message: err.message, rawResponse: err.response?.data || {} };
    }
  }

  async getOrderStatus(orderId) {
    if (this.isMock) {
      return { success: true, status: 'FILLED', filledQty: 65, avgPrice: 24500, message: 'Mock filled.' };
    }
    try {
      const res = await axios.get(`${DHAN_BASE_URL}/orders/${orderId}`, {
        headers: this._headers(),
        timeout: 8000
      });
      return {
        success: true,
        status: res.data?.orderStatus || 'UNKNOWN',
        filledQty: Number(res.data?.filledQty || 0),
        avgPrice: Number(res.data?.averageTradedPrice || 0),
      };
    } catch (err) {
      return { success: false, status: 'ERROR', filledQty: 0, avgPrice: 0, message: err.message };
    }
  }

  async getPositions() {
    if (this.isMock) {
      return { success: true, positions: [] };
    }
    try {
      const res = await axios.get(`${DHAN_BASE_URL}/positions`, {
        headers: this._headers(),
        timeout: 8000
      });
      const rawList = res.data || [];
      const positions = rawList.map(p => ({
        symbol: p.tradingSymbol,
        exchange: p.exchangeSegment,
        productType: p.productType,
        side: p.positionType,
        quantity: Math.abs(p.netQty),
        buyPrice: p.buyAvg,
        currentPrice: p.costPrice,
        pnl: p.realizedProfit + p.unrealizedProfit,
      }));
      return { success: true, positions };
    } catch (err) {
      return { success: false, positions: [], message: err.message };
    }
  }

  async getFunds() {
    if (this.isMock) {
      return { success: true, availableCash: 100000, collateral: 0, utilized: 0 };
    }
    try {
      const res = await axios.get(`${DHAN_BASE_URL}/fundlimit`, {
        headers: this._headers(),
        timeout: 8000
      });
      return {
        success: true,
        availableCash: res.data?.availabelBalance || 0,
        collateral: res.data?.collateralAmount || 0,
        utilized: res.data?.utilizedAmount || 0,
      };
    } catch (err) {
      return { success: false, availableCash: 0, collateral: 0, utilized: 0, message: err.message };
    }
  }
}

module.exports = DhanAdapter;
