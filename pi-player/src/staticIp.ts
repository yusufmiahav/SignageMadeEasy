import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { nmcli } from './wifiManager.js';

const execFile = promisify(execFileCb);

// Static-vs-DHCP toggle for whichever connection (ethernet or Wi-Fi) is actually
// carrying this Pi's default route right now — resolved fresh on every call rather
// than assumed, since a signage Pi could be on either. Reuses wifiManager.ts's own
// nmcli/sudo wrapper: this needs nothing beyond the NOPASSWD: /usr/bin/nmcli grant
// provision.sh already installs for the Wi-Fi fallback hotspot.

export interface StaticIpConfig {
  address: string; // CIDR form, e.g. 192.168.1.50/24
  gateway: string;
  dns: string; // comma-separated, e.g. "1.1.1.1,8.8.8.8"
}

export interface IpStatus {
  method: 'auto' | 'manual' | 'unknown';
  address: string | null;
  gateway: string | null;
  dns: string | null;
}

async function activeConnectionName(): Promise<string | null> {
  let iface: string | null = null;
  try {
    const { stdout } = await execFile('ip', ['route', 'show', 'default']);
    iface = stdout.match(/dev\s+(\S+)/)?.[1] ?? null;
  } catch {
    return null;
  }
  if (!iface) return null;
  const name = await nmcli(['-g', 'GENERAL.CONNECTION', 'device', 'show', iface]).catch(() => '');
  return name.trim() || null;
}

export async function getStatus(): Promise<IpStatus> {
  const conn = await activeConnectionName();
  if (!conn) return { method: 'unknown', address: null, gateway: null, dns: null };
  const raw = await nmcli(['-g', 'ipv4.method,ipv4.addresses,ipv4.gateway,ipv4.dns', 'connection', 'show', conn]).catch(() => '');
  const [method, address, gateway, dns] = raw.split('\n');
  return {
    method: method?.trim() === 'manual' ? 'manual' : 'auto',
    address: address?.trim() || null,
    gateway: gateway?.trim() || null,
    dns: dns?.trim() || null,
  };
}

export async function setStatic(config: StaticIpConfig): Promise<void> {
  const conn = await activeConnectionName();
  if (!conn) throw new Error('Could not determine the active network connection');
  await nmcli([
    'connection', 'modify', conn,
    'ipv4.addresses', config.address,
    'ipv4.gateway', config.gateway,
    'ipv4.dns', config.dns,
    'ipv4.method', 'manual',
  ]);
  // Applies immediately — if this request came in over the same connection being
  // reconfigured, expect the response to never arrive (matches applyCredentials'
  // own documented caveat in wifiManager.ts); the setup page has to reload at
  // whatever new address was just assigned, not stay waiting on this one.
  await nmcli(['connection', 'up', conn]);
}

export async function setDhcp(): Promise<void> {
  const conn = await activeConnectionName();
  if (!conn) throw new Error('Could not determine the active network connection');
  await nmcli(['connection', 'modify', conn, 'ipv4.method', 'auto']);
  await nmcli(['connection', 'up', conn]);
}
