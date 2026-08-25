/**
 * DigitalOceanProvider.js — DigitalOcean v2 Provider Implementation
 *
 * Implements IVpsProvider for Droplets and Floating/Reserved IPv4 addresses in India (blr1/bom1).
 * Supports deterministic mock driver (isMock: true) for zero-risk testing.
 */

const axios = require('axios');
const { IVpsProvider } = require('./IVpsProvider');
const { MockDigitalOceanDriver } = require('./MockDigitalOceanDriver');

class DigitalOceanProvider extends IVpsProvider {
  constructor(options = {}) {
    super();
    this.apiToken = options.apiToken || process.env.DIGITALOCEAN_API_TOKEN || 'mock_token';
    this.baseUrl = options.baseUrl || 'https://api.digitalocean.com/v2';
    this.isMock = options.isMock !== undefined ? options.isMock : true; // Default MOCK

    this.mockDriver = new MockDigitalOceanDriver();
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });
  }

  /**
   * Create Droplet Instance
   */
  async createServer(options = {}) {
    const payload = {
      name: options.name || `ht-vps-${Date.now()}`,
      region: options.region || 'blr1',
      size: options.size || 's-1vcpu-2gb',
      image: options.image || 'ubuntu-24-04-x64',
      user_data: options.userData || options.user_data || null,
      tags: options.tags || ['hello-trader-vps'],
    };

    if (this.isMock) {
      const res = await this.mockDriver.createDroplet(payload);
      const d = res.droplet;
      return {
        instanceId: String(d.id),
        name: d.name,
        status: d.status,
        region: d.region.slug,
        memoryMb: d.memory,
        vcpus: d.vcpus,
        privateIp: d.networks.v4.find(n => n.type === 'private')?.ip_address || null,
        publicIp: d.networks.v4.find(n => n.type === 'public')?.ip_address || null,
      };
    }

    const res = await this.client.post('/droplets', payload);
    const d = res.data.droplet;
    return {
      instanceId: String(d.id),
      name: d.name,
      status: d.status,
      region: d.region.slug,
      memoryMb: d.memory,
      vcpus: d.vcpus,
      privateIp: d.networks?.v4?.find(n => n.type === 'private')?.ip_address || null,
      publicIp: d.networks?.v4?.find(n => n.type === 'public')?.ip_address || null,
    };
  }

  /**
   * Allocate Dedicated Reserved IPv4
   */
  async allocateReservedIp(region = 'blr1') {
    if (this.isMock) {
      const res = await this.mockDriver.createReservedIp({ region });
      return {
        reservedIpId: res.reserved_ip.reserved_ip_id,
        ip: res.reserved_ip.ip,
        region: res.reserved_ip.region.slug,
      };
    }

    const res = await this.client.post('/reserved_ips', { region });
    const rip = res.data.reserved_ip;
    return {
      reservedIpId: rip.reserved_ip_id || rip.ip,
      ip: rip.ip,
      region: rip.region.slug,
    };
  }

  /**
   * Assign Reserved IPv4 to Droplet
   */
  async assignReservedIp(ip, instanceId) {
    if (this.isMock) {
      const res = await this.mockDriver.assignReservedIp(ip, instanceId);
      return {
        success: true,
        actionId: String(res.action.id),
        status: res.action.status,
      };
    }

    const res = await this.client.post(`/reserved_ips/${ip}/actions`, {
      type: 'assign',
      droplet_id: Number(instanceId),
    });
    return {
      success: true,
      actionId: String(res.data.action.id),
      status: res.data.action.status,
    };
  }

  /**
   * Get Server Status
   */
  async getServerStatus(instanceId) {
    if (this.isMock) {
      const res = await this.mockDriver.getDroplet(instanceId);
      const d = res.droplet;
      return {
        instanceId: String(d.id),
        name: d.name,
        status: d.status,
        memoryMb: d.memory,
        vcpus: d.vcpus,
        publicIp: d.networks.v4.find(n => n.type === 'reserved' || n.type === 'public')?.ip_address || null,
      };
    }

    const res = await this.client.get(`/droplets/${instanceId}`);
    const d = res.data.droplet;
    return {
      instanceId: String(d.id),
      name: d.name,
      status: d.status,
      memoryMb: d.memory,
      vcpus: d.vcpus,
      publicIp: d.networks?.v4?.find(n => n.type === 'reserved' || n.type === 'public')?.ip_address || null,
    };
  }

  /**
   * Reboot Server (Preserves Reserved IP)
   */
  async rebootServer(instanceId) {
    if (this.isMock) {
      const res = await this.mockDriver.rebootDroplet(instanceId);
      return { success: true, actionId: res.action.id };
    }

    const res = await this.client.post(`/droplets/${instanceId}/actions`, {
      type: 'reboot',
    });
    return { success: true, actionId: String(res.data.action.id) };
  }

  /**
   * Delete Server Instance
   */
  async deleteServer(instanceId) {
    if (this.isMock) {
      return this.mockDriver.deleteDroplet(instanceId);
    }

    await this.client.delete(`/droplets/${instanceId}`);
    return { success: true };
  }

  /**
   * Release Reserved IP (Gated by Retention Policy)
   */
  async releaseReservedIp(ip) {
    if (this.isMock) {
      return this.mockDriver.deleteReservedIp(ip);
    }

    await this.client.delete(`/reserved_ips/${ip}`);
    return { success: true };
  }
}

module.exports = {
  DigitalOceanProvider,
};
