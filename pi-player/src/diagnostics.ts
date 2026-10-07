import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import * as usbOverride from './usbOverride.js';

// Piggybacks on the existing ~5s heartbeat (poller.ts) rather than a separate
// endpoint/poll loop — the hub already has a place to receive this on every tick.
// Every reading fails gracefully to null rather than throwing: a screen with no
// vcgencmd (not actually a Pi, or running under an emulator) should still heartbeat
// normally, just without these fields.

const execFileAsync = promisify(execFile);

// Captured once, the moment this module is first loaded — effectively "when did
// THIS running player process start." Lets the hub tell whether a restart it
// triggered (Update/Re-provision, see selfUpdate.ts) has actually happened yet:
// an update that only touched app code restarts just this process (systemctl
// restart signage-player), so this timestamp jumping forward is a reliable signal
// distinct from os.uptime() above, which only resets on a full reboot.
const PROCESS_STARTED_AT = Date.now();

// A plain version number (e.g. "1.0.1"), copied from the repo's own /VERSION file
// by provision.sh/self-update.sh right after they pull/clone it — see those
// scripts' own comments. Not a git commit hash — this project bumps /VERSION by
// hand with each meaningful change instead, so what shows up in the control app
// is a normal-looking version number rather than git jargon. Overridable for
// testing, same pattern as this project's other env-overridden paths. Read once
// at module load (same reasoning as PROCESS_STARTED_AT above): it can't change
// without a restart anyway, since an update that changes it always restarts this
// process on completion.
const VERSION_FILE = process.env.SIGNAGE_VERSION_PATH ?? '/opt/signage/version';
const VERSION: string | null = (() => {
  try {
    const content = fsSync.readFileSync(VERSION_FILE, 'utf8').trim();
    return content && content !== 'unknown' ? content : null;
  } catch {
    return null;
  }
})();

// Written by provision.sh only when it detected two connected display outputs AND
// set up the second one's own kiosk/render loop (see its own comment) — never on a
// Pi 3B+, which only has one HDMI port to begin with. Read once at module load, same
// "can't change without a restart anyway" reasoning as VERSION above (changing this
// means re-provisioning, which always restarts this process). See
// hub/src/types.ts's Device.dualOutputCapable for how the hub/control app use it.
const DUAL_OUTPUT_MARKER = process.env.SIGNAGE_DUAL_OUTPUT_MARKER ?? '/opt/signage/dual-output-enabled';
const DUAL_OUTPUT_CAPABLE = fsSync.existsSync(DUAL_OUTPUT_MARKER);

export interface Diagnostics {
  tempC: number | null;
  /** Raw hex string from `vcgencmd get_throttled`, e.g. "0x50000" — bits 0-3 are current-state (under-voltage/freq-capped/throttled/soft-temp-limit), bits 16-19 are "has happened since boot" versions of the same. */
  throttled: string | null;
  uptimeSec: number;
  diskFreeMb: number | null;
  diskTotalMb: number | null;
  /** See usbOverride.ts — surfaced to the hub so the control app can show a badge and offer a remote "Clear" when a screen stops obeying it because of a local USB override. */
  usbOverrideActive: boolean;
  /** ms since epoch this player process started — see PROCESS_STARTED_AT above. */
  playerStartedAt: number;
  /** Plain version number this screen last updated/re-provisioned from — see VERSION above. Null for a screen never updated since this shipped. */
  version: string | null;
  /** See DUAL_OUTPUT_CAPABLE above. */
  dualOutputCapable: boolean;
}

async function measureTemp(): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync('vcgencmd', ['measure_temp']);
    const match = stdout.match(/temp=([\d.]+)/);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

async function getThrottled(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('vcgencmd', ['get_throttled']);
    const match = stdout.match(/throttled=(0x[0-9a-fA-F]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function diskUsage(): Promise<{ freeMb: number | null; totalMb: number | null }> {
  try {
    const stats = await fs.statfs('/');
    return {
      freeMb: Math.round((stats.bavail * stats.bsize) / 1024 / 1024),
      totalMb: Math.round((stats.blocks * stats.bsize) / 1024 / 1024),
    };
  } catch {
    return { freeMb: null, totalMb: null };
  }
}

export async function collect(): Promise<Diagnostics> {
  const [tempC, throttled, disk] = await Promise.all([measureTemp(), getThrottled(), diskUsage()]);
  return {
    tempC, throttled, uptimeSec: Math.round(os.uptime()), diskFreeMb: disk.freeMb, diskTotalMb: disk.totalMb,
    usbOverrideActive: usbOverride.isActive(), playerStartedAt: PROCESS_STARTED_AT, version: VERSION,
    dualOutputCapable: DUAL_OUTPUT_CAPABLE,
  };
}
