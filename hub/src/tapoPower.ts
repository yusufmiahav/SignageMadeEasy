import * as piAgent from './piAgent.js';
import * as store from './store.js';

// Settings screen's manual "Power cycle" action for a screen with a Tapo plug
// configured (Device.tapoPlugIp) — a hard power cut, unlike the existing "Restart"
// button (which only reboots the Pi itself; a genuinely frozen display, or one stuck
// on a black screen HDMI never re-negotiated after a reboot, often needs the actual
// power interrupted, not just the Pi behind it). Off, a real pause for the plug's own
// relay and the screen's own power supply to fully discharge, then on — doing this
// hub-side (not pushing a single "cycle" request to the Pi to handle) keeps the
// Pi-side agent down to one simple on/off primitive (tapoSetPower) rather than
// needing its own timer logic duplicated for what's a rare, manual, already-slow
// action anyway.
const CYCLE_OFF_DURATION_MS = 3000;

export async function powerCycle(device: { id: string; ip: string; tapoPlugIp: string | null }): Promise<void> {
  if (!device.tapoPlugIp) throw new Error('No Tapo plug configured for this screen');
  const { email, password } = store.getTapoAccount();
  if (!email || !password) throw new Error('No Tapo account configured in Settings');
  await piAgent.tapoSetPower(device.ip, device.tapoPlugIp, email, password, false);
  await new Promise((resolve) => setTimeout(resolve, CYCLE_OFF_DURATION_MS));
  await piAgent.tapoSetPower(device.ip, device.tapoPlugIp, email, password, true);
}
