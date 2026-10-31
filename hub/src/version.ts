import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// A Docker-built hub reads ./version.txt, baked in at build time as the UTC date
// of that build (see hub/Dockerfile's RUN step) — it was a COPY of the repo's own
// hand-edited /VERSION file until that turned out to never actually get bumped,
// so every screen compared as "up to date" forever regardless of reality. Running
// outside Docker (local dev — hub/dist is never more than two directories from
// the repo root either way) falls back to that static /VERSION file instead,
// since there's no build step to stamp a date at; fine for dev, where nobody's
// comparing a local instance against a real Pi fleet. Overridable for testing,
// same pattern as this project's other env-overridden paths.
const VERSION_FILE = process.env.SIGNAGE_HUB_VERSION_PATH ?? (() => {
  const baked = path.resolve(__dirname, '../version.txt');
  return fs.existsSync(baked) ? baked : path.resolve(__dirname, '../../VERSION');
})();

// Read once at startup, not per-request — a running process's own version can't
// change without a restart. Null if the file is missing for some reason (should
// only happen on a build that skipped the Dockerfile's version.txt step) — the
// control app then just shows each screen's own version with nothing to compare
// it to.
export const HUB_VERSION: string | null = (() => {
  try {
    const content = fs.readFileSync(VERSION_FILE, 'utf8').trim();
    return content || null;
  } catch {
    return null;
  }
})();
