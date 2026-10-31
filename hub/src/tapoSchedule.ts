import * as tapo from './tapo.js';
import * as store from './store.js';

const POLL_INTERVAL_MS = 60 * 1000;

// What this module last told a device's plug to be — not necessarily its true
// current state (the plug/Pi could be unreachable, or someone used the manual
// "Power cycle" button since), just enough to avoid re-sending the same on/off call
// every single minute. Starts empty on every hub restart: the first tick after a
// restart always sends a fresh call for every scheduled device, which is harmless
// (idempotent — an already-on plug just gets told "on" again) and self-corrects
// anything that drifted while the hub was down.
const lastApplied = new Map<string, boolean>();

let started = false;

async function sweepOnce(): Promise<void> {
  const { email, password } = store.getTapoAccount();
  // Nothing configured yet — every device's shouldPlugBeOnNow check below would be
  // pointless work with nowhere to send the result, so skip the whole sweep.
  if (!email || !password) return;

  for (const device of store.listDevices()) {
    if (!device.tapoPlugIp) continue;
    const desired = store.shouldPlugBeOnNow(device.powerSchedules);
    // null: no power schedule configured for this screen — never touched
    // automatically, only ever via the manual "Power cycle" button.
    if (desired === null) continue;
    if (lastApplied.get(device.id) === desired) continue;
    try {
      await tapo.setPower(device.tapoPlugIp, email, password, desired);
      lastApplied.set(device.id, desired);
    } catch (err) {
      // Non-fatal, same "stale/offline beats crashing the whole sweep" reasoning as
      // every other background poll in this hub (tflArrivals, tflStatus) — logged so
      // it's visible, but NOT recorded into lastApplied, so the very next tick (a
      // minute later) retries rather than silently giving up on a plug that happened
      // to be unreachable (powered off at the wall, Wi-Fi hiccup, mid-DHCP-renewal)
      // at the exact minute its schedule crossed a boundary.
      console.error(`[tapoSchedule] couldn't set plug for device ${device.id}:`, err instanceof Error ? err.message : err);
    }
  }
}

export function startPolling(): void {
  if (started) return;
  started = true;
  void sweepOnce();
  setInterval(() => void sweepOnce(), POLL_INTERVAL_MS);
}
