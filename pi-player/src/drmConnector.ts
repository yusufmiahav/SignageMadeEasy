import fs from 'node:fs';

// Shared by bootRotation.ts and displayResolution.ts — both write to the same
// kernel `video=<connector>:...` cmdline.txt parameter (one for a connected
// output), just different parts of it (resolution vs rotation), so both need to
// agree on which connector that is.

const DRM_CLASS_PATH = process.env.SIGNAGE_DRM_CLASS_PATH ?? '/sys/class/drm';

/**
 * Finds the one connected DRM output's connector name (e.g. "HDMI-A-1") by reading
 * /sys/class/drm/*\/status — the sysfs interface vc4-kms-v3d (the default KMS
 * driver on current Raspberry Pi OS) exposes for every enumerated connector. Picks
 * the first entry reporting "connected" rather than hardcoding a port name, since a
 * kiosk might be wired to either HDMI port (or, on some panels, DSI) and guessing
 * wrong would just make the cmdline.txt param a silent no-op instead of applying to
 * the real output.
 */
export function detectConnector(): string | null {
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
