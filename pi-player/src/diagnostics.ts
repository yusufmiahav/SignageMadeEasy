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

// Written by provision.sh/self-update.sh right after they pull/clone the repo —
// see those scripts' own comments. Overridable for testing, same pattern as this
// project's other env-overridden paths. Read once at module load (same reasoning
// as PROCESS_STARTED_AT above): it can't change without a restart anyway, since
// an update that changes it always restarts this process on completion.
const VERSION_FILE = process.env.SIGNAGE_VERSION_PATH ?? '/opt/signage/version';
const GIT_VERSION: string | null = (() => {
  try {
    const content = fsSync.readFileSync(VERSION_FILE, 'utf8').trim();
    return content && content !== 'unknown' ? content : null;
  } catch {
    return null;
  }
})();

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
  /** Short git commit hash this screen last updated/re-provisioned from — see GIT_VERSION above. Null for a screen never updated since this shipped, or not provisioned from a real git checkout. */
  version: string | null;
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
    usbOverrideActive: usbOverride.isActive(), playerStartedAt: PROCESS_STARTED_AT, version: GIT_VERSION,
  };
}
