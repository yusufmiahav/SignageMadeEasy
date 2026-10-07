// Talks directly to a Pi's tiny local agent (see pi-player/src/agent.ts) for the
// operations that need a hub-initiated push rather than the Pi's own poll loop:
// completing a pairing handshake, rebooting the screen on demand, and unpairing
// immediately on delete (the Pi's poller also self-detects this within one poll
// cycle via a 404 from /api/player/:id/state, so this push is purely for snappier
// feedback — deleting an unreachable/offline Pi still unpairs it, just not instantly).
// All three assume the hub can reach the Pi's IP directly on the LAN — the same
// assumption the control app's "Enter IP" / "Scan QR" pairing flows already make.

const AGENT_PORT = 8088;
const TIMEOUT_MS = 4000;

// Dual-output Pi 4/5s and PCs (see pi-player/src/agent.ts's own output-routing
// comment) run ONE agent process on this same well-known port for both outputs —
// never a second port to open/firewall — distinguished purely by this query
// string, read by agent.ts and threaded into config.ts/poller.ts/identifyFlash.ts/
// preview.ts's own per-output state. Omitted entirely for output 1 (not just set
// to "1") so a single-output Pi's logs/requests look exactly as they always have.
function outputQuery(output: 1 | 2): string {
  return output === 2 ? '?output=2' : '';
}

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

export async function identify(ip: string, timeoutMs?: number, output: 1 | 2 = 1): Promise<PiIdentity> {
  const res = await agentFetch(ip, `/identify${outputQuery(output)}`, undefined, timeoutMs);
  if (!res.ok) throw new Error(`Pi agent at ${ip} responded ${res.status}`);
  return (await res.json()) as PiIdentity;
}

export async function configure(ip: string, deviceId: string, hubUrl: string, output: 1 | 2 = 1): Promise<void> {
  const res = await agentFetch(ip, `/configure${outputQuery(output)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, hubUrl }),
  });
  if (!res.ok) throw new Error(`Pi agent at ${ip} rejected configure: ${res.status}`);
}

// Reboots the whole physical unit — there's no such thing as "restart just one
// output" on real hardware, so this is deliberately NOT output-scoped: triggering
// it from either output's row in the control app does the exact same thing (and
// doing so from both in quick succession is harmless, not a double-reboot).
export async function restart(ip: string): Promise<void> {
  const res = await agentFetch(ip, '/restart', { method: 'POST' });
  if (!res.ok) throw new Error(`Pi agent at ${ip} rejected restart: ${res.status}`);
}

export async function unpair(ip: string, output: 1 | 2 = 1): Promise<void> {
  const res = await agentFetch(ip, `/unpair${outputQuery(output)}`, { method: 'POST' });
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
// Output-scoped: blinks just that one physical screen, so a dual-output unit's two
// rows in the control app can each be matched to the right port on the wall.
export async function identifyFlash(ip: string, output: 1 | 2 = 1): Promise<void> {
  const res = await agentFetch(ip, `/identify-flash${outputQuery(output)}`, { method: 'POST' });
  if (!res.ok) throw new Error(`Pi agent at ${ip} rejected identify-flash: ${res.status}`);
}

// Settings screen's "Preview" button — a live JPEG screenshot of exactly what's
// currently rendering on this screen, relayed through the Pi's agent rather than the
// hub reaching Chromium's DevTools port on the Pi directly (see
// pi-player/src/preview.ts) — keeps all hub->Pi traffic on this one well-known
// port/protocol instead of two. Longer timeout than the other calls here: capturing
// and JPEG-encoding a full-screen frame on a Pi 3B+ is real work, not just an
// instant local read. Output-scoped like identifyFlash above — each output runs its
// own Chromium with its own DevTools port (see preview.ts), so this has to say which.
export async function preview(ip: string, output: 1 | 2 = 1): Promise<Buffer> {
  const res = await agentFetch(ip, `/preview${outputQuery(output)}`, undefined, 8000);
  if (!res.ok) throw new Error(`Pi agent at ${ip} rejected preview: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Settings screen's "Update"/"Re-provision" buttons — see pi-player/src/selfUpdate.ts.
// Both return as soon as the Pi's agent has kicked the relevant script off, not once
// it's finished (that can take anywhere from ~10s to a couple of minutes plus a
// reboot) — so, unlike restart/identifyFlash above, an error the agent actually
// responded with is worth surfacing verbatim rather than collapsing to a generic
// message: the most likely such failure (a Pi that hasn't been re-provisioned since
// this feature shipped) comes back with a specific, actionable reason. A request
// that never got a response at all (offline, unreachable, timed out) is a different
// case — surfacing fetch's own error text there ("This operation was aborted", a bare
// "fetch failed") reads as an internal error, not something a person can act on, so
// that case still collapses to the same generic message every other agent-relayed
// call in this file uses.
async function agentErrorMessage(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `Pi agent responded ${res.status}`;
}

async function postToAgent(ip: string, path: string): Promise<Response> {
  try {
    return await agentFetch(ip, path, { method: 'POST' });
  } catch {
    throw new Error('could not reach device');
  }
}

export async function update(ip: string): Promise<void> {
  const res = await postToAgent(ip, '/update');
  if (!res.ok) throw new Error(await agentErrorMessage(res));
}

export async function reprovision(ip: string): Promise<void> {
  const res = await postToAgent(ip, '/reprovision');
  if (!res.ok) throw new Error(await agentErrorMessage(res));
}

// Home screen's "Clear USB override" button — the same DELETE /usb-override route
// the Pi's own local setup page calls (see pi-player/src/app.ts), just relayed
// through the hub for when the hub is reachable but walking up to the physical
// screen isn't convenient. See pi-player/src/usbOverride.ts for the feature itself.
export async function clearUsbOverride(ip: string): Promise<void> {
  const res = await agentFetch(ip, '/usb-override', { method: 'DELETE' });
  if (!res.ok) throw new Error(`Pi agent at ${ip} rejected clear-usb-override: ${res.status}`);
}
