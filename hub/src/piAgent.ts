// Talks directly to a Pi's tiny local agent (see pi-player/src/agent.ts) for the two
// operations that need a hub-initiated push rather than the Pi's own poll loop:
// completing a pairing handshake, and restarting the player on demand. Both assume
// the hub can reach the Pi's IP directly on the LAN — the same assumption the control
// app's "Enter IP" / "Scan QR" pairing flows already make.

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
