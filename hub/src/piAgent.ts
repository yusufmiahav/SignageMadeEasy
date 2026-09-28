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

// Settings screen's "Preview" button — a live JPEG screenshot of exactly what's
// currently rendering on this screen, relayed through the Pi's agent rather than the
// hub reaching Chromium's DevTools port on the Pi directly (see
// pi-player/src/preview.ts) — keeps all hub->Pi traffic on this one well-known
// port/protocol instead of two. Longer timeout than the other calls here: capturing
// and JPEG-encoding a full-screen frame on a Pi 3B+ is real work, not just an
// instant local read.
export async function preview(ip: string): Promise<Buffer> {
  const res = await agentFetch(ip, '/preview', undefined, 8000);
  if (!res.ok) throw new Error(`Pi agent at ${ip} rejected preview: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Settings screen's "Update"/"Re-provision" buttons — see pi-player/src/selfUpdate.ts.
// Both return as soon as the Pi's agent has kicked the relevant script off, not once
// it's finished (that can take anywhere from ~10s to a couple of minutes plus a
// reboot) — so, unlike restart/identifyFlash above, the error thrown here is worth
// surfacing verbatim rather than collapsing to a generic message: the most likely
// failure (a Pi that hasn't been re-provisioned since this feature shipped) comes
// back with a specific, actionable reason from the agent itself.
async function agentErrorMessage(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `Pi agent responded ${res.status}`;
}

export async function update(ip: string): Promise<void> {
  const res = await agentFetch(ip, '/update', { method: 'POST' });
  if (!res.ok) throw new Error(await agentErrorMessage(res));
}

export async function reprovision(ip: string): Promise<void> {
  const res = await agentFetch(ip, '/reprovision', { method: 'POST' });
  if (!res.ok) throw new Error(await agentErrorMessage(res));
}
