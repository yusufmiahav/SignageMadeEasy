import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// A safety-valve for running this Pi with no heatsink: capping the ARM clock trades
// a bit of general headroom for less heat, which matters most for a bare board sat
// in an enclosure with no active cooling. Applied via /boot/config.txt (or
// /boot/firmware/config.txt on newer Raspberry Pi OS releases) since that's the only
// place arm_freq can be set — it only takes effect on the next boot, which is why
// getStatus() below distinguishes "written to disk" from "actually running."

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = process.env.SIGNAGE_UNDERCLOCK_SCRIPT ?? '/opt/signage/bin/set-underclock.sh';
// Must match set-underclock.sh's own TARGET_FREQ — kept in sync by hand, same
// reasoning as this project's other hub/pi-player type mirrors.
const TARGET_FREQ = 1200;
const CONFIG_CANDIDATES = ['/boot/firmware/config.txt', '/boot/config.txt'];

function configFile(): string | null {
  for (const p of CONFIG_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function isEnabledInConfig(): boolean {
  const file = configFile();
  if (!file) return false;
  try {
    return fs.readFileSync(file, 'utf8').includes('BEGIN SignageMadeEasy underclock');
  } catch {
    return false;
  }
}

/** The arm_freq the firmware actually applied at the last boot — distinct from what's currently written to config.txt, which only takes effect on the *next* boot. */
async function appliedArmFreq(): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync('vcgencmd', ['get_config', 'arm_freq']);
    const match = stdout.match(/arm_freq=(\d+)/);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

export async function getStatus(): Promise<{ enabled: boolean; rebootRequired: boolean }> {
  const enabled = isEnabledInConfig();
  const applied = await appliedArmFreq();
  // Only compares against our own known target, not "any arm_freq at all" — an
  // unrelated override the user set by hand outside this toggle isn't this
  // module's business to flag as needing a reboot.
  const rebootRequired = enabled ? applied !== TARGET_FREQ : applied === TARGET_FREQ;
  return { enabled, rebootRequired };
}

export async function setEnabled(enabled: boolean): Promise<void> {
  await execFileAsync('sudo', [SCRIPT_PATH, enabled ? 'on' : 'off']);
}

/** Real hardware reboot (not the player agent's own /restart, which only restarts the Node process) — only ever triggered from the local device-setup page, never remotely from the hub. */
export async function reboot(): Promise<void> {
  await execFileAsync('sudo', ['reboot']);
}
