import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { XDG_RUNTIME_DIR } from './waylandDisplay.js';
import type { Orientation } from './orientationConfig.js';

// Rotates sway's output for a screen mounted sideways/upside-down — Pi-local only
// (see orientationConfig.ts and network-setup.html's "Display orientation" section);
// the hub/control app has no say in this at all. Since sway's `output <name>
// transform` rotates the whole compositor output, Chromium (a Wayland client)
// automatically sees the resulting swapped logical resolution and adapts on its
// own — no changes needed anywhere in player.js or player.css, and this covers the
// pairing/QR screen and every content type since they're all the same Wayland
// client. Does NOT rotate the Plymouth boot splash (drawn by the kernel before sway
// starts) — see pi-player/README.md's "Screen orientation" section for that known gap.

const SWAYMSG_BIN = process.env.SIGNAGE_SWAYMSG_BIN ?? 'swaymsg';
const execFileAsync = promisify(execFile);

// This process isn't a child of sway (signage-player.service and
// signage-kiosk.service are separate systemd units), so it has no SWAYSOCK env var
// to inherit the way a process sway itself launched would — has to find sway's IPC
// socket file directly, same reasoning as waylandDisplay.ts's own wayland-N socket
// discovery. Sway creates it at `<XDG_RUNTIME_DIR>/sway-ipc.<uid>.<pid>.sock`; picks
// the most recently modified match to guard against a stale socket left behind by a
// crashed prior sway instance, same as that file's own stale-socket reasoning.
function findSwaySocket(): string | null {
  let entries: string[];
  try {
    entries = fs.readdirSync(XDG_RUNTIME_DIR);
  } catch {
    return null;
  }
  const matches = entries.filter((f) => /^sway-ipc\..*\.sock$/.test(f));
  if (matches.length === 0) return null;
  const withMtime = matches.map((f) => {
    const p = path.join(XDG_RUNTIME_DIR, f);
    try {
      return { p, mtime: fs.statSync(p).mtimeMs };
    } catch {
      return { p, mtime: 0 };
    }
  });
  withMtime.sort((a, b) => b.mtime - a.mtime);
  return withMtime[0].p;
}

let lastApplied: Orientation | null = null;

// sway's own transform vocabulary is 'normal'/'90'/'180'/'270' (plus flipped
// variants this project doesn't use) — '0' here just means "no rotation" in the
// UI's own terms, mapped to sway's 'normal' at the boundary.
function toSwayTransform(orientation: Orientation): string {
  return orientation === '0' ? 'normal' : orientation;
}

/**
 * Retries on every call until it actually succeeds (unlike the old hub-driven
 * version, nothing calls this on a timer anymore — see index.ts's one-shot startup
 * call and app.ts's /orientation route calling it again on every change), so this
 * intentionally does NOT cache "already tried and sway wasn't up yet" as if it were
 * applied — only a genuinely successful swaymsg call updates lastApplied.
 */
export async function applyOrientation(orientation: Orientation): Promise<boolean> {
  if (orientation === lastApplied) return true;
  const socket = findSwaySocket();
  // sway not up yet (still booting), or not running at all — caller decides whether
  // to retry; never fatal, since a screen briefly staying in its previous
  // orientation is far better than crashing the player agent over a cosmetic setting.
  if (!socket) return false;
  try {
    await execFileAsync(SWAYMSG_BIN, ['-s', socket, 'output', '*', 'transform', toSwayTransform(orientation)]);
    lastApplied = orientation;
    return true;
  } catch {
    // Non-fatal, same reasoning as the missing-socket case above.
    return false;
  }
}

/**
 * Only used at process startup (see index.ts) — signage-player.service and
 * signage-kiosk.service (which starts sway) are separate systemd units with no
 * ordering guarantee this project relies on, so sway's IPC socket may not exist yet
 * the instant this process starts. Retries every 2s for up to 2 minutes (comfortably
 * longer than sway has ever taken to come up in testing) rather than the old
 * design's "a poll loop happens to retry this every 5s anyway" — nothing polls this
 * module on a timer anymore now that it's Pi-local instead of hub-driven.
 */
export async function applyOrientationAtBoot(orientation: Orientation): Promise<void> {
  const maxAttempts = 60;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (await applyOrientation(orientation)) return;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  console.error('[displayOrientation] gave up waiting for sway to come up — orientation not applied at boot');
}
