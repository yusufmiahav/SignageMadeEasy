import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { XDG_RUNTIME_DIR } from './waylandDisplay.js';

// Rotates sway's output for a screen mounted sideways (see hub/src/types.ts's
// Device.orientation) — 'portrait' means the physical panel needs the rendered
// image turned 90° clockwise to read upright, confirmed against a real portrait
// kiosk panel that has no rotation logic of its own (a standard landscape LCD
// controller mounted sideways, expecting an already-rotated signal). Since sway's
// `output <name> transform` rotates the whole compositor output, Chromium (a
// Wayland client) automatically sees the resulting swapped logical resolution and
// adapts on its own — no changes needed anywhere in player.js or player.css, and
// this covers the pairing/QR screen and every content type since they're all the
// same Wayland client. Does NOT rotate the Plymouth boot splash (drawn by the
// kernel before sway even starts) — see pi-player/README.md's "Screen orientation"
// section for that known gap.
//
// UNVERIFIED ON REAL HARDWARE as of writing — no portrait-mounted panel was
// available to test this against. The mechanism (sway output transform) is
// standard/documented, but the exact swaymsg invocation and socket-discovery
// approach below need a real confirm-or-fix pass, same as every other
// real-hardware-risk change in this project.

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

let lastApplied: 'landscape' | 'portrait' | null = null;

/** Idempotent — a no-op once the requested orientation is already applied, so poller.ts can call this unconditionally on every tick without spamming swaymsg. */
export async function applyOrientation(orientation: 'landscape' | 'portrait'): Promise<void> {
  if (orientation === lastApplied) return;
  const socket = findSwaySocket();
  // sway not up yet (still booting), or not running at all — next poll tick retries;
  // never fatal, since a screen briefly staying in its previous orientation is far
  // better than crashing the player agent over a cosmetic setting.
  if (!socket) return;
  const transform = orientation === 'portrait' ? '90' : 'normal';
  try {
    await execFileAsync(SWAYMSG_BIN, ['-s', socket, 'output', '*', 'transform', transform]);
    lastApplied = orientation;
  } catch {
    // Non-fatal, same reasoning as the missing-socket case above.
  }
}
