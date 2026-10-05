import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// hub/dist/version.js -> hub/dist -> hub -> repo root (used for the git fallback
// below). The hub and pi-player live in the same repo/checkout, so "what commit is
// the hub itself running" is a meaningful stand-in for "latest" — see
// routes/version.ts and store.ts's Device.version comment for how this is
// compared against what each screen last reported.
const REPO_ROOT = path.resolve(__dirname, '../..');
// Baked in at Docker build time (see hub/Dockerfile's hub-build stage) — the
// deployed image has no .git directory at runtime, so this is the only way a
// production container knows its own commit. Overridable for testing, same
// pattern as this project's other env-overridden paths.
const VERSION_FILE = process.env.SIGNAGE_HUB_VERSION_PATH ?? path.resolve(__dirname, '../version.txt');

function readVersionFile(): string | null {
  try {
    const content = fs.readFileSync(VERSION_FILE, 'utf8').trim();
    return content && content !== 'unknown' ? content : null;
  } catch {
    return null;
  }
}

// Only reached outside Docker (local dev, or this project's own test sandbox),
// where version.txt doesn't exist but a real .git directory does.
function readGitHead(): string | null {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

// Read once at startup, not per-request — a running process's own commit can't
// change without a restart.
export const HUB_VERSION: string | null = readVersionFile() ?? readGitHead();
