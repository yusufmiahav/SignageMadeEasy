import { clearConfig, loadConfig } from './config.js';
import { getLocalIp } from './localIp.js';
import * as mediaCache from './mediaCache.js';
import * as diagnostics from './diagnostics.js';
import type { PlayerState } from './types.js';

const POLL_INTERVAL_MS = 5000;

// Last-known-good state, kept even if the hub goes briefly unreachable — this is
// what makes playback keep looping through a network blip or hub restart without
// any manual intervention on the Pi. Gated by lastSafetyHold (Settings → Reliability
// → "Safety hold" on the control app): true (the default, matching this project's
// original always-on behavior) keeps it; false clears it on the next failed poll so
// a disconnected screen goes blank instead of freezing on stale content.
//
// Keyed by output (1 or 2) — a dual-output Pi/PC runs two of these independently in
// the same process, each polling its own deviceId against the hub (see config.ts's
// own per-output split). Output 1 behaves exactly as before dual-output existed.
interface OutputPollState {
  lastState: PlayerState | null;
  lastError: string | null;
  lastSafetyHold: boolean;
  timer: ReturnType<typeof setInterval> | undefined;
}

function freshPollState(): OutputPollState {
  return { lastState: null, lastError: null, lastSafetyHold: true, timer: undefined };
}

const outputs: Record<1 | 2, OutputPollState> = { 1: freshPollState(), 2: freshPollState() };

export function getCachedState(output: 1 | 2 = 1): { state: PlayerState | null; error: string | null } {
  const o = outputs[output];
  return { state: o.lastState, error: o.lastError };
}

async function tick(output: 1 | 2): Promise<void> {
  const o = outputs[output];
  const config = loadConfig(output);
  if (!config) return;

  const ip = getLocalIp();
  try {
    const res = await fetch(`${config.hubUrl}/api/player/${config.deviceId}/state`, { signal: AbortSignal.timeout(4000) });
    if (res.status === 404) {
      // Authoritative: the hub no longer knows this device, most likely because it
      // was deleted from the control app. Unlike a network blip or a hub restart —
      // where we deliberately keep playing the last-known content — this can never
      // resolve itself, so unpair and drop back to the first-boot IP/QR screen.
      clearConfig(output);
      stopPolling(output);
      return;
    }
    if (!res.ok) throw new Error(`hub responded ${res.status}`);
    o.lastState = (await res.json()) as PlayerState;
    o.lastError = null;
    o.lastSafetyHold = o.lastState.safetyHold;
    // No point caching media the hub won't want us to keep showing anyway once
    // safety hold is off. Shared across both outputs' calls (see mediaCache.ts) —
    // deliberately: when both outputs show the same group, this avoids downloading
    // the same file twice, and costs nothing extra when they don't (cache entries
    // are keyed by content item id either way).
    if (o.lastSafetyHold) mediaCache.warm(o.lastState.items);
  } catch (err) {
    o.lastError = err instanceof Error ? err.message : String(err);
    // Safety hold off: a disconnected screen should go blank, not freeze on
    // whatever was last resolved — clear it here rather than on a timer, since this
    // is the first moment a real disconnect (as opposed to hold-on's deliberate
    // keep-playing) is known. Safety hold on: deliberately don't clear lastState —
    // keep playing the last thing we knew.
    if (!o.lastSafetyHold) o.lastState = null;
  }

  // Heartbeat is best-effort and independent of whether the state fetch above succeeded.
  // Diagnostics (temp/throttled/uptime/disk/dualOutputCapable) piggyback on this same
  // tick rather than a separate poll loop — see diagnostics.ts. Whole-machine stats
  // (temperature, disk, etc.) are naturally identical in both outputs' heartbeats,
  // which is accurate: it IS the same physical machine either way.
  const diag = await diagnostics.collect();
  fetch(`${config.hubUrl}/api/devices/${config.deviceId}/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ip, ...diag }),
    signal: AbortSignal.timeout(4000),
  }).catch(() => {});
}

export function startPolling(output: 1 | 2 = 1): void {
  const o = outputs[output];
  if (o.timer) return;
  void tick(output);
  o.timer = setInterval(() => void tick(output), POLL_INTERVAL_MS);
}

export function stopPolling(output: 1 | 2 = 1): void {
  const o = outputs[output];
  clearInterval(o.timer);
  o.timer = undefined;
  o.lastState = null;
  o.lastError = null;
  o.lastSafetyHold = true;
}
