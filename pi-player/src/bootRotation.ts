// Rotates the Plymouth boot splash / raw kernel console to match a portrait-mounted
// screen — the counterpart to displayOrientation.ts's live `swaymsg output
// transform`, which only takes effect once sway itself starts. See
// pi-player/README.md's "Screen orientation" section for the full picture of why
// this needs a second, kernel-level mechanism and the real-hardware caution around
// it. Raspberry Pi only — see set-boot-rotation.sh's own comment for why this uses
// the modern KMS `video=` kernel parameter rather than the legacy, riskier
// config.txt `display_rotate=` setting.
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Orientation } from './orientationConfig.js';

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = process.env.SIGNAGE_BOOT_ROTATION_SCRIPT ?? '/opt/signage/bin/set-boot-rotation.sh';
const CMDLINE_CANDIDATES = ['/boot/firmware/cmdline.txt', '/boot/cmdline.txt'];
const DRM_CLASS_PATH = process.env.SIGNAGE_DRM_CLASS_PATH ?? '/sys/class/drm';

function cmdlineFile(): string | null {
  for (const p of CMDLINE_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// Finds the one connected DRM output's connector name (e.g. "HDMI-A-1") by reading
// /sys/class/drm/*/status — the sysfs interface vc4-kms-v3d (the default KMS
// driver on current Raspberry Pi OS) exposes for every enumerated connector. Picks
// the first entry reporting "connected" rather than hardcoding a port name, since a
// kiosk might be wired to either HDMI port (or, on some panels, DSI) and guessing
// wrong would just make the rotation param a silent no-op instead of applying to
// the real output.
function detectConnector(): string | null {
  let entries: string[];
  try {
    entries = fs.readdirSync(DRM_CLASS_PATH);
  } catch {
    return null;
  }
  for (const entry of entries) {
    // Real entries look like "card1-HDMI-A-1" — strip the "cardN-" prefix to get
    // the bare connector name the `video=` kernel parameter expects.
    const match = entry.match(/^card\d+-(.+)$/);
    if (!match) continue;
    try {
      const status = fs.readFileSync(`${DRM_CLASS_PATH}/${entry}/status`, 'utf8').trim();
      if (status === 'connected') return match[1];
    } catch {
      // Not every entry under /sys/class/drm is a connector with a status file
      // (e.g. a render node) — skip it and keep looking.
    }
  }
  return null;
}

function configuredDegrees(): Orientation {
  const file = cmdlineFile();
  if (!file) return '0';
  try {
    const content = fs.readFileSync(file, 'utf8');
    const match = content.match(/video=[^ ]*,rotate=(90|180|270)\b/);
    return (match?.[1] as Orientation | undefined) ?? '0';
  } catch {
    return '0';
  }
}

export interface BootRotationStatus {
  /** Whether a connected DRM output was found to apply this to at all. False means this Pi's boot splash can't be rotated right now (nothing plugged in yet, or a driver/setup this project hasn't seen) — the setup page should say so rather than implying a setting that can't do anything. */
  supported: boolean;
  /** What's currently written into cmdline.txt, i.e. what the *next* boot's splash will use. */
  configured: Orientation;
}

export function getStatus(): BootRotationStatus {
  return { supported: detectConnector() != null, configured: configuredDegrees() };
}

/**
 * Only ever writes to disk — never reboots on its own (see app.ts's /orientation
 * route, which reports rebootRequired and lets the person choose when, same
 * pattern as underclock.ts's own reboot-required toggle). A no-op when nothing's
 * connected to detect a connector from (see getStatus().supported) — there is
 * nothing here safe to guess at, so this just leaves cmdline.txt untouched.
 */
export async function setOrientation(orientation: Orientation): Promise<void> {
  const connector = detectConnector();
  if (!connector) return;
  await execFileAsync('sudo', [SCRIPT_PATH, connector, orientation]);
}
