import fs from 'node:fs';
import path from 'node:path';

// A single-item, always-looping fallback for whenever the hub can't be reached at
// all — see network-setup.html's "Local content" section. Deliberately just one
// file, upload-replaces-upload: this is a field emergency stand-in, not a second
// content library to keep in sync with the hub's own playlists/scheduling.

const DIR = process.env.SIGNAGE_LOCAL_CONTENT_DIR ?? '/opt/signage/local-content';
const META_PATH = path.join(DIR, 'meta.json');

export type LocalContentType = 'image' | 'video' | 'pdf';

interface LocalContentMeta {
  type: LocalContentType;
  filename: string;
  updatedAt: number;
}

function typeFromMime(mime: string): LocalContentType | null {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf') return 'pdf';
  return null;
}

function readMeta(): LocalContentMeta | null {
  try {
    return JSON.parse(fs.readFileSync(META_PATH, 'utf8')) as LocalContentMeta;
  } catch {
    return null;
  }
}

/** What the player page should show — cache-busted by updatedAt so a re-upload replaces what's on screen instead of the browser serving a stale cached file at the same URL. */
export function get(): { id: string; type: LocalContentType; url: string } | null {
  const meta = readMeta();
  if (!meta) return null;
  return { id: `local-${meta.updatedAt}`, type: meta.type, url: `/local-content/file?v=${meta.updatedAt}` };
}

export function filePath(): string | undefined {
  const meta = readMeta();
  return meta ? path.join(DIR, meta.filename) : undefined;
}

/** Same filesystem as the final destination (never the OS's own /tmp, which is often a separate tmpfs mount on a Pi) so the rename in save() below can't fail with a cross-device error. */
export function tmpDir(): string {
  const dir = path.join(DIR, '.tmp');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function save(file: { path: string; originalname: string; mimetype: string }): void {
  const type = typeFromMime(file.mimetype);
  if (!type) throw new Error(`Unsupported file type: ${file.mimetype}`);
  fs.mkdirSync(DIR, { recursive: true });
  clear();
  const filename = `content${path.extname(file.originalname) || ''}`;
  fs.renameSync(file.path, path.join(DIR, filename));
  fs.writeFileSync(META_PATH, JSON.stringify({ type, filename, updatedAt: Date.now() } satisfies LocalContentMeta));
}

export function clear(): void {
  try {
    for (const name of fs.readdirSync(DIR)) {
      if (name === '.tmp') continue;
      fs.rmSync(path.join(DIR, name), { force: true, recursive: true });
    }
  } catch {
    // directory doesn't exist yet — nothing to clear
  }
}
