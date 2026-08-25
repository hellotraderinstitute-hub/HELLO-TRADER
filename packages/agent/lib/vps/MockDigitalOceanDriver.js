/**
 * MockDigitalOceanDriver.js — In-Memory DigitalOcean v2 Cloud Simulator
 *
 * Deterministically simulates Droplets, Floating / Reserved IPs, Region Constraints,
 * Cloud-Init payloads, and Action state machines for testing without live API calls.
 */

const crypto = require('crypto');

class MockDigitalOceanDriver {
  constructor() {
    this.droplets = new Map(); // dropletId -> dropletObject
    this.reservedIps = new Map(); // ipString -> reservedIpObject
    this.actions = new Map(); // actionId -> actionObject
    this.ipCounter = 101;
  }

  reset() {
    this.droplets.clear();
    this.reservedIps.clear();
    this.actions.clear();
    this.ipCounter = 101;
  }

  /**
   * POST /v2/droplets
   */
  async createDroplet(payload = {}) {
    const id = `do_${Math.floor(100000000 + Math.random() * 900000000)}`;
    const ephemeralIp = `139.59.80.${this.ipCounter++}`;

    const droplet = {
      id,
      name: payload.name || `ht-vps-${id}`,
      memory: payload.size === 's-2vcpu-4gb' ? 4096 : 2048,
      vcpus: payload.size === 's-2vcpu-4gb' ? 2 : 1,
      disk: 25,
      region: { slug: payload.region || 'blr1', name: 'Bangalore 1' },
      image: { slug: payload.image || 'ubuntu-24-04-x64', distribution: 'Ubuntu' },
      size_slug: payload.size || 's-1vcpu-2gb',
      status: 'active',
      networks: {
        v4: [
          { ip_address: ephemeralIp, netmask: '255.255.240.0', type: 'public' }
        ]
      },
      user_data: payload.user_data || null,
      tags: payload.tags || ['hello-trader-vps'],
      created_at: new Date().toISOString(),
    };

    this.droplets.set(id, droplet);
    return { droplet };
  }

  /**
   * POST /v2/reserved_ips
   */
  async createReservedIp(payload = {}) {
    const reservedIp = `103.212.121.${this.ipCounter++}`;
    const reservedIpObj = {
      ip: reservedIp,
      region: { slug: payload.region || 'blr1', name: 'Bangalore 1' },
      droplet: null,
      reserved_ip_id: `rip_${crypto.randomBytes(8).toString('hex')}`,
      created_at: new Date().toISOString(),
    };

    this.reservedIps.set(reservedIp, reservedIpObj);
    return { reserved_ip: reservedIpObj };
  }

  /**
   * POST /v2/reserved_ips/{ip}/actions (type: "assign")
   */
  async assignReservedIp(ip, dropletId) {
    const rip = this.reservedIps.get(ip);
    if (!rip) {
      throw new Error(`404: Reserved IP ${ip} not found.`);
    }

    const droplet = this.droplets.get(dropletId);
    if (!droplet) {
      throw new Error(`404: Droplet ${dropletId} not found.`);
    }

    rip.droplet = { id: droplet.id, name: droplet.name };

    // Update droplet networks to include the Reserved Public IP
    droplet.networks.v4 = droplet.networks.v4.filter(n => n.type !== 'reserved');
    droplet.networks.v4.unshift({
      ip_address: ip,
      netmask: '255.255.255.0',
      type: 'reserved',
    });

    const actionId = `act_${Math.floor(100000 + Math.random() * 900000)}`;
    const action = {
      id: actionId,
      status: 'completed',
      type: 'assign_ip',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      resource_id: dropletId,
      resource_type: 'droplet',
    };

    this.actions.set(actionId, action);
    return { action };
  }

  /**
   * GET /v2/droplets/{id}
   */
  async getDroplet(id) {
    const droplet = this.droplets.get(id);
    if (!droplet) {
      throw new Error(`404: Droplet ${id} not found.`);
    }
    return { droplet };
  }

  /**
   * POST /v2/droplets/{id}/actions (reboot)
   */
  async rebootDroplet(id) {
    const droplet = this.droplets.get(id);
    if (!droplet) {
      throw new Error(`404: Droplet ${id} not found.`);
    }

    const actionId = `act_reboot_${Math.floor(100000 + Math.random() * 900000)}`;
    return {
      action: {
        id: actionId,
        status: 'completed',
        type: 'reboot',
        resource_id: id,
      }
    };
  }

  /**
   * DELETE /v2/droplets/{id}
   */
  async deleteDroplet(id) {
    const droplet = this.droplets.get(id);
    if (!droplet) {
      throw new Error(`404: Droplet ${id} not found.`);
    }
    this.droplets.delete(id);
    return { success: true };
  }

  /**
   * DELETE /v2/reserved_ips/{ip}
   */
  async deleteReservedIp(ip) {
    const rip = this.reservedIps.get(ip);
    if (!rip) {
      throw new Error(`404: Reserved IP ${ip} not found.`);
    }
    this.reservedIps.delete(ip);
    return { success: true };
  }
}

module.exports = {
  MockDigitalOceanDriver,
};
