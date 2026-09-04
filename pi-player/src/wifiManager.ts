import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';

const execFile = promisify(execFileCb);

// Field-provisioning fallback: if this Pi loses its Wi-Fi connection entirely (not
// just "can't reach the hub" — an ethernet cable or a working Wi-Fi association both
// count as having network, regardless of hub reachability, since this can't fix
// anything beyond the Pi's own network config), it broadcasts its own Wi-Fi network
// so a technician can join it from a phone with no SSH/laptop needed, and set the
// real Wi-Fi credentials from a page served right off this same Pi. See app.ts's
// /network-setup routes and the "network setup needed" screen in player.js.
//
// Fixed, not configurable: the SSID/password are shown directly on the kiosk's own
// physical screen when active (see the networkSetup field on /state), so there's
// nothing to look up in documentation — the screen is the documentation.
const HOTSPOT_PASSWORD = 'signage1234';
const HOTSPOT_CONNECTION_NAME = 'signage-setup-ap';
const CHECK_INTERVAL_MS = 20_000;
// ~60s of no network before broadcasting — avoids flipping into AP mode over a
// brief association blip or the normal delay while Wi-Fi reconnects after boot.
const DISCONNECT_THRESHOLD = 3;

let hotspotActive = false;
let hotspotSsid: string | null = null;
let consecutiveDisconnects = 0;

/** Exported so staticIp.ts can reuse the exact same sudo/timeout wrapper instead of duplicating it — both modules only ever need this one grant (see provision.sh's NOPASSWD: /usr/bin/nmcli). */
export async function nmcli(args: string[]): Promise<string> {
  const { stdout } = await execFile('sudo', ['nmcli', ...args], { timeout: 25_000 });
  return stdout;
}

interface DeviceStatus {
  device: string;
  type: string;
  state: string;
}

async function deviceStatuses(): Promise<DeviceStatus[]> {
  const stdout = await nmcli(['-t', '-f', 'DEVICE,TYPE,STATE', 'device', 'status']);
  return stdout
    .split('\n')
    .map((line) => line.split(':'))
    .filter((parts): parts is [string, string, string] => parts.length === 3)
    .map(([device, type, state]) => ({ device, type, state }));
}

async function hasWiredOrWifiConnection(): Promise<boolean> {
  const statuses = await deviceStatuses();
  return statuses.some((s) => (s.type === 'ethernet' || s.type === 'wifi') && s.state === 'connected');
}

async function wifiDeviceName(): Promise<string | null> {
  const statuses = await deviceStatuses();
  return statuses.find((s) => s.type === 'wifi')?.device ?? null;
}

async function startHotspot(): Promise<void> {
  const iface = await wifiDeviceName();
  if (!iface) return; // no Wi-Fi radio present at all — nothing this fallback can do
  const ssid = `SignageSetup-${os.hostname()}`;
  await nmcli(['device', 'wifi', 'hotspot', 'ifname', iface, 'con-name', HOTSPOT_CONNECTION_NAME, 'ssid', ssid, 'password', HOTSPOT_PASSWORD]);
  hotspotActive = true;
  hotspotSsid = ssid;
}

export interface WifiStatus {
  hotspotActive: boolean;
  hotspotSsid: string | null;
  hotspotPassword: string;
}

export function getStatus(): WifiStatus {
  return { hotspotActive, hotspotSsid, hotspotPassword: HOTSPOT_PASSWORD };
}

export async function scanNetworks(): Promise<string[]> {
  const stdout = await nmcli(['-t', '-f', 'SSID', 'device', 'wifi', 'list', '--rescan', 'yes']);
  const ssids = stdout
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(ssids)];
}

export async function applyCredentials(ssid: string, password: string): Promise<{ ok: boolean; error?: string }> {
  try {
    // Confirmed on real hardware: `nmcli device wifi connect` fails outright with a
    // spurious "802-11-wireless-security.key-mgmt: property is missing" error
    // whenever a connection profile named after this SSID already exists — even a
    // previously-working one (e.g. left behind by an earlier successful connect, or
    // NetworkManager's own auto-reconnect), not just a genuinely malformed one.
    // Deleting it first forces nmcli to build a fresh profile from scratch every
    // time, which reliably works; harmless (and a no-op) on a first-ever connect.
    await nmcli(['connection', 'delete', ssid]).catch(() => {});
    await nmcli(['device', 'wifi', 'connect', ssid, 'password', password]);
    hotspotActive = false;
    hotspotSsid = null;
    consecutiveDisconnects = 0;
    return { ok: true };
  } catch (err) {
    // The failed connect attempt likely tore down the AP profile trying to associate
    // with the new network — re-arm the hotspot immediately so the setup page stays
    // reachable for another attempt, rather than leaving the Pi stranded with
    // neither a real connection nor its fallback AP.
    await startHotspot().catch(() => {});
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function tick(): Promise<void> {
  const connected = await hasWiredOrWifiConnection().catch(() => true); // fail safe: never broadcast over a shell/parsing error
  if (connected) {
    consecutiveDisconnects = 0;
    if (hotspotActive) {
      await nmcli(['connection', 'down', HOTSPOT_CONNECTION_NAME]).catch(() => {});
      hotspotActive = false;
      hotspotSsid = null;
    }
    return;
  }
  if (hotspotActive) return; // already broadcasting — nothing to do until the setup page submits credentials
  consecutiveDisconnects++;
  if (consecutiveDisconnects >= DISCONNECT_THRESHOLD) {
    await startHotspot().catch((err) => console.error('[wifiManager] failed to start fallback hotspot', err));
  }
}

export function startWatching(): void {
  void tick();
  setInterval(() => void tick(), CHECK_INTERVAL_MS);
}
