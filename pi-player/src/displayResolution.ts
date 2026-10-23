// Forces a specific HDMI output resolution, rather than trusting the connected
// display's own EDID negotiation — added after real-world reports of screens on
// consumer TVs rendering into a small, wrong-aspect-ratio box in the middle of an
// otherwise-black panel. Every TV involved supported 1080p, but vc4-kms-v3d's own
// "use whatever mode the display reports as default/preferred" EDID negotiation
// (the same "d" mode set-boot-rotation.sh already relies on for rotation) isn't
// reliable on every consumer TV — some report a DMT/PC-style mode, or one with
// different active-area metadata than the panel's own native 16:9 1920x1080,
// which the TV then displays without the scaling it would apply to a normal CEA/TV
// signal. The rest of this project already assumes a 1920x1080 output everywhere
// (every content item is sized/labeled for it) — forcing that exact mode removes
// the ambiguity instead of hoping each TV's EDID negotiates to the right thing.
//
// Same "write now, only takes effect on reboot" shape as bootRotation.ts, and the
// same real-hardware caveat: verified via a simulated cmdline.txt/DRM sysfs tree
// in this project's own test sandbox (which has no real DRM/TV to actually render
// against), not against a real screen — see pi-player/README.md's note on this.
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { detectConnector } from './drmConnector.js';

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = process.env.SIGNAGE_DISPLAY_RESOLUTION_SCRIPT ?? '/opt/signage/bin/set-display-resolution.sh';
// Overridable for testing — see bootRotation.ts's identical override (both read
// the same real file on an actual Pi, just different parts of it).
const CMDLINE_CANDIDATES = process.env.SIGNAGE_CMDLINE_PATH
  ? [process.env.SIGNAGE_CMDLINE_PATH]
  : ['/boot/firmware/cmdline.txt', '/boot/cmdline.txt'];

export type DisplayResolution = 'auto' | '1920x1080';

function cmdlineFile(): string | null {
  for (const p of CMDLINE_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function configuredResolution(): DisplayResolution {
  const file = cmdlineFile();
  if (!file) return 'auto';
  try {
    const content = fs.readFileSync(file, 'utf8');
    const match = content.match(/video=[^:,\s]+:([^,\s]+)/);
    return match?.[1] === '1920x1080@60' ? '1920x1080' : 'auto';
  } catch {
    return 'auto';
  }
}

export interface DisplayResolutionStatus {
  /** Whether a connected DRM output was found to apply this to at all — mirrors bootRotation.ts's own supported flag and the same reasoning. */
  supported: boolean;
  /** What's currently written into cmdline.txt, i.e. what the *next* boot will use. */
  configured: DisplayResolution;
}

export function getStatus(): DisplayResolutionStatus {
  return { supported: detectConnector() != null, configured: configuredResolution() };
}

/**
 * Only ever writes to disk — never reboots on its own, same reasoning and
 * reboot-required-reported-separately shape as bootRotation.ts's setOrientation.
 * A no-op when nothing's connected to detect a connector from. Preserves
 * whatever rotation bootRotation.ts may have separately configured for this same
 * connector — see set-display-resolution.sh.
 */
export async function setResolution(resolution: DisplayResolution): Promise<void> {
  const connector = detectConnector();
  if (!connector) return;
  await execFileAsync('sudo', [SCRIPT_PATH, connector, resolution]);
}
