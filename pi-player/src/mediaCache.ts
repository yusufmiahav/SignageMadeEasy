import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type { PlayerItem } from './types.js';

// Caches playlist media on local disk so playback reads from the SD card instead of
// re-streaming over the LAN on every rotation — the point is smoother video in
// particular, since local reads aren't subject to WiFi jitter mid-playback the way a
// live fetch from the hub is. Keyed by item id: a library item's id/URL never changes
// once uploaded (editing metadata like duration doesn't touch the file; replacing the
// upload gets a new id), so a cached file stays valid forever. Deliberately unbounded
// — signage libraries are small enough that tracking staleness/eviction across the
// hub's default/event/forced rotation isn't worth the complexity yet.

const CACHE_DIR = process.env.SIGNAGE_CACHE_DIR ?? '/opt/signage/cache';

const cachedPaths = new Map<string, string>(); // item id -> absolute file path
const inFlight = new Map<string, Promise<void>>(); // item id -> in-progress download

function extFromUrl(url: string): string {
  const ext = path.extname(url.split('?')[0]);
  return ext || '.bin';
}

/** Rebuilds the in-memory id->path index from whatever already-cached files survived a restart. */
export function init(): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  for (const name of fs.readdirSync(CACHE_DIR)) {
    if (name.endsWith('.tmp')) {
      fs.rmSync(path.join(CACHE_DIR, name), { force: true }); // leftover from an interrupted download
      continue;
    }
    const dot = name.lastIndexOf('.');
    const id = dot === -1 ? name : name.slice(0, dot);
    cachedPaths.set(id, path.join(CACHE_DIR, name));
  }
}

/** The URL the player page should use: local if cached, the hub's own URL otherwise (never blocks on a download). */
export function resolveUrl(item: PlayerItem): string {
  return cachedPaths.has(item.id) ? `/media/${item.id}` : item.url;
}

export function filePathFor(id: string): string | undefined {
  return cachedPaths.get(id);
}

/** Fire-and-forget: starts downloading any not-yet-cached item in the background. */
export function warm(items: PlayerItem[]): void {
  for (const item of items) {
    if (item.type === 'announcement' || !item.url) continue;
    if (cachedPaths.has(item.id) || inFlight.has(item.id)) continue;
    inFlight.set(item.id, download(item).finally(() => inFlight.delete(item.id)));
  }
}

async function download(item: PlayerItem): Promise<void> {
  const finalPath = path.join(CACHE_DIR, `${item.id}${extFromUrl(item.url)}`);
  const tmpPath = `${finalPath}.tmp`;
  try {
    const res = await fetch(item.url);
    if (!res.ok || !res.body) throw new Error(`media fetch ${item.url} failed: ${res.status}`);
    await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(tmpPath));
    await fsp.rename(tmpPath, finalPath);
    cachedPaths.set(item.id, finalPath);
  } catch {
    await fsp.rm(tmpPath, { force: true });
    // Left uncached — the next warm() call (each poll tick) retries automatically.
  }
}
