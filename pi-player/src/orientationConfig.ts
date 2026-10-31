import fs from 'node:fs';
import path from 'node:path';

// A physical-mounting property of this specific Pi/panel, not something the hub
// should own: unlike everything else in config.ts, this must survive unpair/re-pair
// (the screen doesn't get un-mounted just because it's un-paired) and must be
// readable before pairing even happens — see index.ts applying it unconditionally at
// startup, so the first-boot IP/QR screen itself renders in the right orientation.
// Kept in its own file/module rather than folded into config.ts for exactly that
// "survives unpair" distinction.

export type Orientation = '0' | '90' | '180' | '270';
const ORIENTATIONS: readonly Orientation[] = ['0', '90', '180', '270'];

const ORIENTATION_PATH = process.env.SIGNAGE_ORIENTATION_PATH ?? '/opt/signage/orientation.json';

let cached: Orientation | null = null;

export function loadOrientation(): Orientation {
  if (cached) return cached;
  try {
    const raw = JSON.parse(fs.readFileSync(ORIENTATION_PATH, 'utf8')) as { value?: string };
    cached = ORIENTATIONS.includes(raw.value as Orientation) ? (raw.value as Orientation) : '0';
  } catch {
    cached = '0';
  }
  return cached;
}

export function saveOrientation(value: Orientation): void {
  fs.mkdirSync(path.dirname(ORIENTATION_PATH), { recursive: true });
  fs.writeFileSync(ORIENTATION_PATH, JSON.stringify({ value }, null, 2));
  cached = value;
}

export function isOrientation(value: unknown): value is Orientation {
  return ORIENTATIONS.includes(value as Orientation);
}
