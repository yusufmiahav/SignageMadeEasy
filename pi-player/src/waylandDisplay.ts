import fs from 'node:fs';

// The player agent's systemd unit starts before the kiosk/cage unit (see
// systemd/signage-kiosk.service), so it can't just inherit a WAYLAND_DISPLAY env var
// set at cage's own startup the way a child process of cage itself would — this has
// to go find the compositor's socket on disk instead. Used by ndiPlayer.ts to give
// gst-launch-1.0's waylandsink somewhere to attach.

const XDG_RUNTIME_DIR = process.env.XDG_RUNTIME_DIR ?? '/run/user/1000';

/** Highest-numbered wayland-N socket currently present — guards against a stale socket left behind by a crashed prior compositor rather than the live one cage is currently serving. */
export function findWaylandDisplay(): string | null {
  let entries: string[];
  try {
    entries = fs.readdirSync(XDG_RUNTIME_DIR);
  } catch {
    return null;
  }
  const sockets = entries.filter((f) => /^wayland-\d+$/.test(f)).sort();
  return sockets.length > 0 ? sockets[sockets.length - 1] : null;
}

export async function waitForWaylandDisplay(timeoutMs: number): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = findWaylandDisplay();
    if (found) return found;
    if (Date.now() >= deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

export { XDG_RUNTIME_DIR };
