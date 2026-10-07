import fs from 'node:fs';
import path from 'node:path';
import type { LibraryItemType, PlayerItem } from './types.js';

// A multi-item, network-independent "force this onto the screen" override —
// activated by plugging in a USB stick with a top-level "signage" folder of
// images/videos (see bin/usb-override-mount.sh and udev/ for the actual USB
// detection/mounting/copying — this module only manages what's already been
// copied onto this Pi's own disk by the time activate() runs).
//
// Unlike localContent.ts's single-file hub-unreachable fallback, this wins even
// while the hub is reachable and has its own valid state (see player.js's pollOnce,
// which checks this ahead of the hub-driven branches) — a deliberate manual
// override, not a disaster fallback — and stays active until explicitly cleared,
// not merely until the USB stick is unplugged: the files are already copied
// locally by the time this activates, so pulling the stick back out changes
// nothing. Clearing happens either from this Pi's own local setup page (DELETE
// /usb-override in app.ts) or relayed from the hub once it's reachable (see
// hub/src/piAgent.ts's clearUsbOverride) — both call the exact same route.

const DIR = process.env.SIGNAGE_USB_OVERRIDE_DIR ?? '/opt/signage/usb-override';
const ACTIVE_FLAG = path.join(DIR, '.active');

const EXT_TYPE: Record<string, LibraryItemType> = {
  '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.gif': 'image', '.webp': 'image', '.bmp': 'image',
  '.mp4': 'video', '.mov': 'video', '.mkv': 'video', '.webm': 'video', '.avi': 'video', '.m4v': 'video',
};

function typeFromExt(filename: string): 'image' | 'video' | null {
  const type = EXT_TYPE[path.extname(filename).toLowerCase()];
  return type === 'image' || type === 'video' ? type : null;
}

interface OverrideFile {
  name: string;
  type: 'image' | 'video';
}

function listFiles(): OverrideFile[] {
  let names: string[];
  try {
    names = fs.readdirSync(DIR);
  } catch {
    return [];
  }
  return names
    .filter((n) => !n.startsWith('.'))
    .map((name) => ({ name, type: typeFromExt(name) }))
    .filter((f): f is OverrideFile => f.type != null)
    // Alphabetical by filename is the only "ordering UI" a USB stick has — prefix
    // files with "1-", "2-", etc. (e.g. "1-intro.jpg", "2-promo.mp4") to control
    // playback order.
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** True once bin/usb-override-mount.sh has copied files in and called activate() below. */
export function isActive(): boolean {
  return fs.existsSync(ACTIVE_FLAG);
}

/** What the player page should show while active — null if inactive, or if the copied directory ended up with nothing playable in it (e.g. cleared concurrently). */
export function get(): { items: PlayerItem[] } | null {
  if (!isActive()) return null;
  const files = listFiles();
  if (files.length === 0) return null;
  return {
    items: files.map((f) => ({
      id: `usb-${f.name}`,
      type: f.type,
      url: `/usb-override/file/${encodeURIComponent(f.name)}`,
      // Matches the hub's own default image duration (hub/src/store.ts's
      // getPlayerState) — videos play through their natural length instead.
      duration: f.type === 'video' ? null : 8,
    })),
  };
}

/** Resolves a requested filename to its on-disk path — undefined for anything outside DIR (the name arrives as a route param, not filesystem-trusted input) or that doesn't exist. */
export function filePath(name: string): string | undefined {
  const resolved = path.join(DIR, name);
  if (resolved !== DIR && !resolved.startsWith(DIR + path.sep)) return undefined;
  return fs.existsSync(resolved) ? resolved : undefined;
}

/** Called by bin/usb-override-mount.sh once it's finished copying files in — just flips the active flag; the files are already in place by the time this runs. */
export function activate(): void {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(ACTIVE_FLAG, String(Date.now()));
}

/** Clears the override and deletes the copied files. */
export function clear(): void {
  try {
    fs.rmSync(DIR, { recursive: true, force: true });
  } catch {
    // already gone
  }
}
