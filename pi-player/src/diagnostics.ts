import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';

// Piggybacks on the existing ~5s heartbeat (poller.ts) rather than a separate
// endpoint/poll loop — the hub already has a place to receive this on every tick.
// Every reading fails gracefully to null rather than throwing: a screen with no
// vcgencmd (not actually a Pi, or running under an emulator) should still heartbeat
// normally, just without these fields.

const execFileAsync = promisify(execFile);

export interface Diagnostics {
  tempC: number | null;
  /** Raw hex string from `vcgencmd get_throttled`, e.g. "0x50000" — bits 0-3 are current-state (under-voltage/freq-capped/throttled/soft-temp-limit), bits 16-19 are "has happened since boot" versions of the same. */
  throttled: string | null;
  uptimeSec: number;
  diskFreeMb: number | null;
  diskTotalMb: number | null;
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
  return { tempC, throttled, uptimeSec: Math.round(os.uptime()), diskFreeMb: disk.freeMb, diskTotalMb: disk.totalMb };
}
