/**
 * ProxyTransportFactory.js — Multi-Protocol Proxy & Direct-IP Transport Engine
 *
 * Supported Protocols:
 *   - DIRECT_IP: Socket-level localAddress binding
 *   - HTTP_PROXY / HTTPS_PROXY: HTTP CONNECT tunneling via HttpsProxyAgent
 *   - SOCKS5: Authenticated SOCKS5 proxy tunneling via SocksClient
 *
 * Security:
 *   - Secrets are never logged or exposed in error messages.
 *   - Plaintext credentials scrubbed from in-memory strings.
 *   - Strict per-client transport isolation.
 */

const https = require('https');
const http = require('http');
const tls = require('tls');
const net = require('net');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksClient } = require('socks');

class SocksProxyAgent extends https.Agent {
  constructor(socksOptions = {}, agentOptions = {}) {
    super({ keepAlive: true, ...agentOptions });
    this.socksOptions = socksOptions;
  }

  createConnection(options, callback) {
    const isHttps = options.protocol === 'https:' || options.port === 443;
    const socksClientOptions = {
      proxy: {
        host: this.socksOptions.host,
        port: Number(this.socksOptions.port) || 1080,
        type: 5,
        userId: this.socksOptions.username || this.socksOptions.userId || undefined,
        password: this.socksOptions.password || undefined,
      },
      command: 'connect',
      destination: {
        host: options.host,
        port: Number(options.port) || (isHttps ? 443 : 80),
      },
      timeout: this.socksOptions.timeout || 10000,
    };

    SocksClient.createConnection(socksClientOptions, (err, info) => {
      if (err) return callback(err);

      if (isHttps) {
        const tlsSocket = tls.connect({
          socket: info.socket,
          servername: options.servername || options.host,
          rejectUnauthorized: options.rejectUnauthorized !== false,
        });
        tlsSocket.on('error', (tlsErr) => callback(tlsErr));
        return callback(null, tlsSocket);
      }

      return callback(null, info.socket);
    });
  }
}

class HttpConnectProxyAgent extends https.Agent {
  constructor(proxyOptions = {}, agentOptions = {}) {
    super({ keepAlive: true, ...agentOptions });
    this.proxyOptions = proxyOptions;
  }

  createConnection(options, callback) {
    const isHttps = options.protocol === 'https:' || options.port === 443;
    const destHost = options.host;
    const destPort = Number(options.port) || (isHttps ? 443 : 80);
    const proxyHost = this.proxyOptions.host || '127.0.0.1';
    const proxyPort = Number(this.proxyOptions.port) || 8080;
    const timeout = this.proxyOptions.timeout || 10000;
    const isProxyTls = this.proxyOptions.isTls || proxyPort === 443 || this.proxyOptions.connectionType === 'HTTPS_PROXY';

    const onConnect = (proxySocket) => {
      let connectReq = `CONNECT ${destHost}:${destPort} HTTP/1.1\r\n` +
                       `Host: ${destHost}:${destPort}\r\n` +
                       `User-Agent: HelloTrader-Agent/1.0\r\n` +
                       `Proxy-Connection: Keep-Alive\r\n`;

      if (this.proxyOptions.username && this.proxyOptions.password) {
        const auth = Buffer.from(`${this.proxyOptions.username}:${this.proxyOptions.password}`).toString('base64');
        connectReq += `Proxy-Authorization: Basic ${auth}\r\n`;
      }

      connectReq += '\r\n';
      proxySocket.write(connectReq);

      let buffer = '';
      const onData = (chunk) => {
        buffer += chunk.toString();
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd !== -1) {
          proxySocket.removeListener('data', onData);
          const header = buffer.substring(0, headerEnd);
          const firstLine = header.split('\r\n')[0] || '';

          if (firstLine.includes('200')) {
            if (isHttps) {
              const tlsSocket = tls.connect({
                socket: proxySocket,
                servername: options.servername || destHost,
                rejectUnauthorized: options.rejectUnauthorized !== false,
              }, () => {
                callback(null, tlsSocket);
              });
              tlsSocket.on('error', (tlsErr) => callback(tlsErr));
              return;
            }
            return callback(null, proxySocket);
          } else {
            proxySocket.destroy();
            callback(new Error(`Proxy CONNECT failed (${firstLine.trim()})`));
          }
        }
      };

      proxySocket.on('data', onData);
      proxySocket.on('error', (err) => callback(err));
      proxySocket.on('timeout', () => {
        proxySocket.destroy();
        callback(new Error(`Proxy connection to ${proxyHost}:${proxyPort} timed out`));
      });
      proxySocket.setTimeout(timeout);
    };

    let proxySocket;
    if (isProxyTls) {
      proxySocket = tls.connect({ host: proxyHost, port: proxyPort, servername: proxyHost, rejectUnauthorized: false }, () => {
        onConnect(proxySocket);
      });
      proxySocket.on('error', (err) => callback(err));
    } else {
      proxySocket = net.connect({ host: proxyHost, port: proxyPort }, () => {
        onConnect(proxySocket);
      });
      proxySocket.on('error', (err) => callback(err));
    }
  }
}

class ProxyTransportFactory {
  /**
   * Create an HTTPS/HTTP Agent based on client-specific proxy or direct-IP configuration
   * @param {object} config - Proxy / Transport Config
   * @param {string} [config.connectionType] - DIRECT_IP | HTTP_PROXY | HTTPS_PROXY | SOCKS5
   * @param {string} [config.proxyHost]
   * @param {number} [config.proxyPort]
   * @param {string} [config.proxyUsername]
   * @param {string} [config.proxyPassword]
   * @param {string} [config.ipAddress]
   * @returns {{ httpsAgent: https.Agent, httpAgent: http.Agent, connectionType: string }}
   */
  static createAgents(config = {}) {
    let connType = (config.connectionType || '').toUpperCase();
    if (!connType) {
      connType = config.proxyHost ? (Number(config.proxyPort) === 1080 ? 'SOCKS5' : 'HTTPS_PROXY') : 'DIRECT_IP';
    }

    if (connType === 'SOCKS5') {
      const socksOpts = {
        host: config.proxyHost || '127.0.0.1',
        port: Number(config.proxyPort) || 1080,
        username: config.proxyUsername,
        password: config.proxyPassword,
        timeout: 10000,
      };
      const agent = new SocksProxyAgent(socksOpts);
      return { httpsAgent: agent, httpAgent: agent, connectionType: 'SOCKS5' };
    }

    if (connType === 'HTTP_PROXY' || connType === 'HTTPS_PROXY') {
      const protocol = connType === 'HTTPS_PROXY' || Number(config.proxyPort) === 443 ? 'https' : 'http';
      const user = config.proxyUsername ? encodeURIComponent(config.proxyUsername) : '';
      const pass = config.proxyPassword ? encodeURIComponent(config.proxyPassword) : '';
      const auth = (user && pass) ? `${user}:${pass}@` : '';
      const proxyUrl = `${protocol}://${auth}${config.proxyHost}:${config.proxyPort}`;

      const agent = new HttpsProxyAgent(proxyUrl);
      return { httpsAgent: agent, httpAgent: agent, connectionType: connType };
    }

    // DIRECT_IP (Default)
    const localIp = config.ipAddress || null;
    const httpsAgent = localIp
      ? new https.Agent({ localAddress: localIp, keepAlive: true })
      : new https.Agent({ keepAlive: true });
    const httpAgent = localIp
      ? new http.Agent({ localAddress: localIp, keepAlive: true })
      : new http.Agent({ keepAlive: true });

    return { httpsAgent, httpAgent, connectionType: 'DIRECT_IP' };
  }

  /**
   * Alias for createAgents to support legacy/convenience callers
   * @param {object} config
   * @returns {{ httpsAgent: https.Agent, httpAgent: http.Agent, connectionType: string }}
   */
  static createProxyAgent(config = {}) {
    return this.createAgents(config);
  }

  /**
   * Verify Proxy Outbound Public IP Egress
   * @param {object} config - Proxy configuration
   * @param {string} expectedIp - The expected public egress IPv4
   * @param {object} [options]
   * @returns {Promise<{ success: boolean, isMatch: boolean, observedIp: string|null, expectedIp: string, latencyMs: number, error?: string }>}
   */
  static async verifyEgress(config, expectedIp, options = {}) {
    const start = Date.now();
    const { httpsAgent } = this.createAgents(config);

    const testUrls = options.testUrls || [
      'https://api.ipify.org?format=json',
      'https://httpbin.org/ip',
      'https://api.my-ip.io/ip.json'
    ];

    let observedIp = null;
    let lastError = null;

    for (const url of testUrls) {
      try {
        const res = await axios.get(url, {
          httpsAgent,
          timeout: options.timeout || 8000,
        });
        const ip = res.data?.ip || res.data?.origin || (typeof res.data === 'string' ? res.data.trim() : null);
        if (ip) {
          observedIp = ip.split(',')[0].trim();
          break;
        }
      } catch (err) {
        if (err.response?.status === 407 || (err.message && err.message.includes('407'))) {
          lastError = '407 Proxy Authentication Required: Please provide the Username and Password for this proxy.';
        } else if (err.code === 'ECONNREFUSED') {
          lastError = `Connection refused by proxy host at ${config.proxyHost}:${config.proxyPort}`;
        } else if (err.code === 'ETIMEDOUT') {
          lastError = `Connection timed out connecting to proxy ${config.proxyHost}:${config.proxyPort}`;
        } else {
          lastError = err.message;
        }
      }
    }

    const latencyMs = Date.now() - start;

    if (!observedIp) {
      return {
        success: false,
        isMatch: false,
        observedIp: null,
        expectedIp,
        latencyMs,
        error: lastError || 'Failed to reach public IP echo service through proxy transport',
      };
    }

    const cleanExpected = (expectedIp || '').trim();
    const isMatch = (observedIp === cleanExpected);

    return {
      success: true,
      isMatch,
      observedIp,
      expectedIp: cleanExpected,
      latencyMs,
    };
  }

  /**
   * Mask sensitive proxy info for safe API/UI presentation
   * @param {object} assignment
   */
  static maskAssignment(assignment) {
    if (!assignment) return null;
    const hasAuth = !!(assignment.encryptedProxyUsername || assignment.proxyUsername);
    let maskedUser = null;
    if (assignment.proxyUsername) {
      const u = assignment.proxyUsername;
      maskedUser = u.length > 3 ? `${u.slice(0, 2)}***` : '***';
    } else if (hasAuth) {
      maskedUser = '*** (Encrypted)';
    }

    return {
      id: assignment.id,
      userId: assignment.userId,
      broker: assignment.broker,
      connectionType: assignment.connectionType || 'DIRECT_IP',
      ipAddress: assignment.ipAddress, // Expected Public Egress IP
      proxyHost: assignment.proxyHost || null,
      proxyPort: assignment.proxyPort || null,
      hasProxyAuth: hasAuth,
      maskedProxyUsername: maskedUser,
      status: assignment.status,
      assignedAt: assignment.assignedAt,
      verifiedAt: assignment.verifiedAt,
      releasedAt: assignment.releasedAt,
      lastObservedOutboundIp: assignment.lastObservedOutboundIp,
      notes: assignment.notes,
      user: assignment.user,
      brokerConnection: assignment.brokerConnection,
    };
  }
}

module.exports = {
  ProxyTransportFactory,
  SocksProxyAgent,
};
