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
let lastState: PlayerState | null = null;
let lastError: string | null = null;
let lastSafetyHold = true;
let timer: ReturnType<typeof setInterval> | undefined;

export function getCachedState(): { state: PlayerState | null; error: string | null } {
  return { state: lastState, error: lastError };
}

async function tick(): Promise<void> {
  const config = loadConfig();
  if (!config) return;

  const ip = getLocalIp();
  try {
    const res = await fetch(`${config.hubUrl}/api/player/${config.deviceId}/state`, { signal: AbortSignal.timeout(4000) });
    if (res.status === 404) {
      // Authoritative: the hub no longer knows this device, most likely because it
      // was deleted from the control app. Unlike a network blip or a hub restart —
      // where we deliberately keep playing the last-known content — this can never
      // resolve itself, so unpair and drop back to the first-boot IP/QR screen.
      clearConfig();
      stopPolling();
      return;
    }
    if (!res.ok) throw new Error(`hub responded ${res.status}`);
    lastState = (await res.json()) as PlayerState;
    lastError = null;
    lastSafetyHold = lastState.safetyHold;
    // No point caching media the hub won't want us to keep showing anyway once
    // safety hold is off.
    if (lastSafetyHold) mediaCache.warm(lastState.items);
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    // Safety hold off: a disconnected screen should go blank, not freeze on
    // whatever was last resolved — clear it here rather than on a timer, since this
    // is the first moment a real disconnect (as opposed to hold-on's deliberate
    // keep-playing) is known. Safety hold on: deliberately don't clear lastState —
    // keep playing the last thing we knew.
    if (!lastSafetyHold) lastState = null;
  }

  // Heartbeat is best-effort and independent of whether the state fetch above succeeded.
  // Diagnostics (temp/throttled/uptime/disk) piggyback on this same tick rather than
  // a separate poll loop — see diagnostics.ts.
  const diag = await diagnostics.collect();
  fetch(`${config.hubUrl}/api/devices/${config.deviceId}/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ip, ...diag }),
    signal: AbortSignal.timeout(4000),
  }).catch(() => {});
}

export function startPolling(): void {
  if (timer) return;
  void tick();
  timer = setInterval(() => void tick(), POLL_INTERVAL_MS);
}

export function stopPolling(): void {
  clearInterval(timer);
  timer = undefined;
  lastState = null;
  lastError = null;
  lastSafetyHold = true;
}
