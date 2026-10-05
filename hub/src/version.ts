import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// hub/dist/version.js -> hub/dist -> hub -> repo root, where VERSION lives — see
// that file's own comment. Baked into the image as ./version.txt at Docker build
// time (see hub/Dockerfile), or read straight from the repo root in local dev
// (where hub/dist is never more than two directories from VERSION either way).
// Overridable for testing, same pattern as this project's other env-overridden
// paths.
const VERSION_FILE = process.env.SIGNAGE_HUB_VERSION_PATH ?? (() => {
  const baked = path.resolve(__dirname, '../version.txt');
  return fs.existsSync(baked) ? baked : path.resolve(__dirname, '../../VERSION');
})();

// Read once at startup, not per-request — a running process's own version can't
// change without a restart. Null if the file is missing for some reason (should
// only happen on a build that skipped the Dockerfile's COPY step) — the control
// app then just shows each screen's own version with nothing to compare it to.
export const HUB_VERSION: string | null = (() => {
  try {
    const content = fs.readFileSync(VERSION_FILE, 'utf8').trim();
    return content || null;
  } catch {
    return null;
  }
})();
