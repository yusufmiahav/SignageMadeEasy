import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type { PlayerItem } from './types.js';

// Caches playlist media on local disk so playback reads from the SD card instead of
// re-streaming over the LAN on every rotation — the point is smoother video in
// particular, since local reads aren't subject to WiFi jitter mid-playback the way a
// live fetch from the hub is.
//
// Keyed by item id, but a cache entry also remembers *which URL* it was fetched from
// (persisted in a small manifest alongside the cached files, so this survives a
// restart) — an item's id no longer guarantees a stable URL forever: the hub can
// serve a different URL for the same id later, either because a screen's video
// quality setting changed (Device.videoQuality — 'auto' plays a capped copy once
// one exists, 'full' the original) or because a video's background capping job
// (hub/src/videoTranscode.ts) finished after this Pi had already cached the
// original. Either way, a URL change for a known id is treated as a cache miss so
// it gets re-downloaded, rather than silently serving whatever was cached first.
// Deliberately unbounded otherwise — signage libraries are small enough that
// tracking staleness/eviction across the hub's default/event/forced rotation isn't
// worth the complexity yet.

const CACHE_DIR = process.env.SIGNAGE_CACHE_DIR ?? '/opt/signage/cache';
const MANIFEST_PATH = path.join(CACHE_DIR, '.manifest.json');

const cachedPaths = new Map<string, string>(); // item id -> absolute file path
const cachedUrls = new Map<string, string>(); // item id -> the URL that file was fetched from
const inFlight = new Map<string, Promise<void>>(); // item id -> in-progress download

function extFromUrl(url: string): string {
  const ext = path.extname(url.split('?')[0]);
  return ext || '.bin';
}

function saveManifest(): void {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(Object.fromEntries(cachedUrls)));
}

/** Rebuilds the in-memory id->path index (and id->source-url manifest) from whatever already-cached files survived a restart. */
export function init(): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  let manifest: Record<string, string> = {};
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as Record<string, string>;
  } catch {
    // No manifest yet (fresh cache dir, or an upgrade from before this existed) —
    // treat every already-cached file as being of unknown origin; warm() will
    // re-fetch it once and record it going forward rather than trusting it blindly.
  }
  for (const name of fs.readdirSync(CACHE_DIR)) {
    if (name.startsWith('.')) continue; // the manifest itself
    if (name.endsWith('.tmp')) {
      fs.rmSync(path.join(CACHE_DIR, name), { force: true }); // leftover from an interrupted download
      continue;
    }
    const dot = name.lastIndexOf('.');
    const id = dot === -1 ? name : name.slice(0, dot);
    cachedPaths.set(id, path.join(CACHE_DIR, name));
    if (manifest[id]) cachedUrls.set(id, manifest[id]);
  }
}

/** True once a file matching this item's *current* URL is cached — not just any file for this id. */
function isCurrent(item: PlayerItem): boolean {
  return cachedPaths.has(item.id) && cachedUrls.get(item.id) === item.url;
}

/** The URL the player page should use: local if cached at the current URL, the hub's own URL otherwise (never blocks on a download). */
export function resolveUrl(item: PlayerItem): string {
  return isCurrent(item) ? `/media/${item.id}` : item.url;
}

export function filePathFor(id: string): string | undefined {
  return cachedPaths.get(id);
}

/** Fire-and-forget: starts downloading any item not yet cached at its current URL in the background. */
export function warm(items: PlayerItem[]): void {
  for (const item of items) {
    if (item.type === 'announcement' || !item.url) continue;
    if (isCurrent(item) || inFlight.has(item.id)) continue;
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
    cachedUrls.set(item.id, item.url);
    saveManifest();
  } catch {
    await fsp.rm(tmpPath, { force: true });
    // Left uncached — the next warm() call (each poll tick) retries automatically.
  }
}
