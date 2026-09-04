// Talks directly to a Pi's tiny local agent (see pi-player/src/agent.ts) for the
// operations that need a hub-initiated push rather than the Pi's own poll loop:
// completing a pairing handshake, restarting the player on demand, and unpairing
// immediately on delete (the Pi's poller also self-detects this within one poll
// cycle via a 404 from /api/player/:id/state, so this push is purely for snappier
// feedback — deleting an unreachable/offline Pi still unpairs it, just not instantly).
// All three assume the hub can reach the Pi's IP directly on the LAN — the same
// assumption the control app's "Enter IP" / "Scan QR" pairing flows already make.

const AGENT_PORT = 8088;
const TIMEOUT_MS = 4000;

async function agentFetch(ip: string, path: string, init?: RequestInit, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`http://${ip}:${AGENT_PORT}${path}`, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface PiIdentity {
  hostname: string;
  paired: boolean;
  mac: string | null;
}

export async function identify(ip: string, timeoutMs?: number): Promise<PiIdentity> {
  const res = await agentFetch(ip, '/identify', undefined, timeoutMs);
  if (!res.ok) throw new Error(`Pi agent at ${ip} responded ${res.status}`);
  return (await res.json()) as PiIdentity;
}

export async function configure(ip: string, deviceId: string, hubUrl: string): Promise<void> {
  const res = await agentFetch(ip, '/configure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, hubUrl }),
  });
  if (!res.ok) throw new Error(`Pi agent at ${ip} rejected configure: ${res.status}`);
}

export async function restart(ip: string): Promise<void> {
  const res = await agentFetch(ip, '/restart', { method: 'POST' });
  if (!res.ok) throw new Error(`Pi agent at ${ip} rejected restart: ${res.status}`);
}

export async function unpair(ip: string): Promise<void> {
  const res = await agentFetch(ip, '/unpair', { method: 'POST' });
  if (!res.ok) throw new Error(`Pi agent at ${ip} rejected unpair: ${res.status}`);
}

// NDI source discovery (Pi 4/5 or an x86 device only — see pi-player/src/ndiPlayer.ts's
// findSources). Discovery itself takes a few seconds on the device, so this gets a
// longer timeout than the other agent calls above.
export async function listNdiSources(ip: string): Promise<string[]> {
  const res = await agentFetch(ip, '/native-ndi/sources', undefined, 8000);
  if (!res.ok) throw new Error(`Pi agent at ${ip} rejected ndi-sources: ${res.status}`);
  const body = (await res.json()) as { sources: string[] };
  return body.sources;
}

// Settings screen's "Identify" button (bulb icon) — see pi-player/src/identifyFlash.ts.
export async function identifyFlash(ip: string): Promise<void> {
  const res = await agentFetch(ip, '/identify-flash', { method: 'POST' });
  if (!res.ok) throw new Error(`Pi agent at ${ip} rejected identify-flash: ${res.status}`);
}
