import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { UPLOADS_DIR } from '../db.js';
import * as store from '../store.js';
import { countPdfPages } from '../pdfPages.js';
import { getVideoDuration } from '../videoDuration.js';
import { needsCapping, transcodeToCapped } from '../videoTranscode.js';

export const libraryRouter = Router();

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
});

libraryRouter.get('/', (_req, res) => {
  res.json(store.listLibrary());
});

libraryRouter.put('/reorder', (req, res) => {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
    return res.status(400).json({ error: 'ids must be an array of strings' });
  }
  store.reorderLibrary(ids);
  res.status(204).end();
});

libraryRouter.post('/image', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });
  const item = store.addLibraryItem({
    name: req.file.originalname,
    type: 'image',
    size: formatBytes(req.file.size),
    thumb: `/uploads/${req.file.filename}`,
  });
  res.status(201).json(item);
});

// Fire-and-forget: runs after the upload response has already gone out (see the
// route below). A Pi 3B+ can't reliably decode full 1080p source video in real time
// (confirmed on real hardware — see videoTranscode.ts), so every upload this large
// gets a capped copy in the background rather than relying on it being pre-encoded
// correctly by hand or making the uploader wait through a multi-minute re-encode
// before the item even shows up in the library.
function runCapInBackground(itemId: string, sourcePath: string, cappedPath: string): void {
  void transcodeToCapped(sourcePath, cappedPath).then((ok) => {
    if (ok) {
      store.setVideoTranscodeResult(itemId, 'done', `/uploads/${path.basename(cappedPath)}`);
    } else {
      store.setVideoTranscodeResult(itemId, 'failed');
    }
  });
}

libraryRouter.post('/video', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });
  const duration = await getVideoDuration(req.file.path);
  const fullUrl = `/uploads/${req.file.filename}`;
  const shouldCap = await needsCapping(req.file.path);
  const item = store.addLibraryItem({
    name: req.file.originalname,
    type: 'video',
    size: formatBytes(req.file.size),
    duration,
    thumb: fullUrl, // fallback until (if) a capped copy lands, and the permanent value if capping is skipped/fails
    fullUrl,
    transcodeStatus: shouldCap ? 'processing' : 'skipped',
  });
  res.status(201).json(item);

  if (shouldCap) {
    const ext = path.extname(req.file.filename);
    const cappedPath = path.join(UPLOADS_DIR, `${path.basename(req.file.filename, ext)}.capped${ext}`);
    runCapInBackground(item.id, req.file.path, cappedPath);
  }
});

libraryRouter.post('/pdf', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });
  const buffer = fs.readFileSync(req.file.path);
  const pageCount = countPdfPages(buffer);
  const item = store.addLibraryItem({
    name: req.file.originalname,
    type: 'pdf',
    size: formatBytes(req.file.size),
    thumb: `/uploads/${req.file.filename}`,
    pageCount,
  });
  res.status(201).json(item);
});

libraryRouter.post('/announcement', (req, res) => {
  const { name, text } = req.body ?? {};
  if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'text is required' });
  const item = store.addLibraryItem({ name: (name ?? '').trim() || 'Announcement', type: 'announcement', text });
  res.status(201).json(item);
});

// No file, no extra fields — just the current time of day on a black background,
// rendered live on the Pi (see pi-player/public/player.js's 'clock' branch).
libraryRouter.post('/clock', (req, res) => {
  const { name } = req.body ?? {};
  const item = store.addLibraryItem({ name: (name ?? '').trim() || 'Clock', type: 'clock' });
  res.status(201).json(item);
});

// No file either — the hub only ever stores the NDI source name a Pi 4/5 or x86
// device resolves directly over the LAN at playback time (see pi-player/src/ndiPlayer.ts).
libraryRouter.post('/ndi', (req, res) => {
  const { name, ndiSourceName } = req.body ?? {};
  if (typeof ndiSourceName !== 'string' || !ndiSourceName.trim()) {
    return res.status(400).json({ error: 'ndiSourceName is required' });
  }
  const item = store.addLibraryItem({
    name: (name ?? '').trim() || ndiSourceName.trim(),
    type: 'ndi',
    ndiSourceName: ndiSourceName.trim(),
  });
  res.status(201).json(item);
});

// No file, no live data stored here either — just which TfL modes to show; the
// actual line status is resolved fresh from tflStatus.ts's cache every time this
// item is served (see store.ts's getPlayerState).
const VALID_TFL_MODES = ['tube', 'overground', 'dlr', 'elizabeth-line'];
libraryRouter.post('/tfl-status', (req, res) => {
  const { name, tflModes } = req.body ?? {};
  if (!Array.isArray(tflModes) || tflModes.length === 0 || !tflModes.every((m) => VALID_TFL_MODES.includes(m))) {
    return res.status(400).json({ error: `tflModes must be a non-empty array from: ${VALID_TFL_MODES.join(', ')}` });
  }
  const item = store.addLibraryItem({ name: (name ?? '').trim() || 'TfL status', type: 'tfl-status', tflModes });
  res.status(201).json(item);
});

// One or more stations shown together on the same board — see types.ts's
// LibraryItem.tflStations. No live data stored here either; the actual
// countdowns are resolved fresh from tflArrivals.ts's per-station cache every
// time this item is served (see store.ts's getPlayerState). Each stopPointId
// must already be the real, queryable StopPoint id (e.g. "940GZZLUWSM"), not a
// hub/interchange id — see GET /api/tfl/stations/search, which does that
// resolution for the dialog.
function isValidTflStations(value: unknown): value is { stopPointId: string; stopPointName?: string; lines?: string[] }[] {
  return Array.isArray(value) && value.length > 0 && value.every((s) =>
    s && typeof s === 'object' &&
    typeof (s as Record<string, unknown>).stopPointId === 'string' && (s as Record<string, unknown>).stopPointId !== '' &&
    ((s as Record<string, unknown>).stopPointName === undefined || typeof (s as Record<string, unknown>).stopPointName === 'string') &&
    ((s as Record<string, unknown>).lines === undefined || (Array.isArray((s as Record<string, unknown>).lines) && ((s as Record<string, unknown>).lines as unknown[]).every((l) => typeof l === 'string'))),
  );
}

libraryRouter.post('/tfl-arrivals', (req, res) => {
  const { name, tflStations } = req.body ?? {};
  if (!isValidTflStations(tflStations)) {
    return res.status(400).json({ error: 'tflStations must be a non-empty array of { stopPointId, stopPointName?, lines? }' });
  }
  const stations = tflStations.map((s) => ({ stopPointId: s.stopPointId, stopPointName: s.stopPointName || s.stopPointId, ...(s.lines && s.lines.length > 0 && { lines: s.lines }) }));
  const item = store.addLibraryItem({
    name: (name ?? '').trim() || stations.map((s) => s.stopPointName).join(', ') || 'TfL arrivals',
    type: 'tfl-arrivals',
    tflStations: stations,
  });
  res.status(201).json(item);
});

libraryRouter.patch('/:id', (req, res) => {
  const { durationSec, name, tags, ndiSourceName, tflModes, tflStations } = req.body ?? {};
  if (durationSec !== undefined) {
    if (typeof durationSec !== 'number' || !Number.isFinite(durationSec) || durationSec < 1) {
      return res.status(400).json({ error: 'durationSec must be a positive number' });
    }
    store.setItemDuration(req.params.id, Math.round(durationSec));
  }
  if (typeof name === 'string') {
    if (!name.trim()) return res.status(400).json({ error: 'name cannot be empty' });
    store.renameLibraryItem(req.params.id, name.trim());
  }
  if (tags !== undefined) {
    if (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string')) {
      return res.status(400).json({ error: 'tags must be an array of strings' });
    }
    store.setLibraryItemTags(req.params.id, tags);
  }
  // Reconfigures an existing 'ndi' item's source name — see AddNdiSourceDialog.tsx's
  // edit mode. Same no-op-if-wrong-type guard as the two TfL branches below.
  if (typeof ndiSourceName === 'string') {
    if (!ndiSourceName.trim()) return res.status(400).json({ error: 'ndiSourceName cannot be empty' });
    store.setLibraryItemNdiSourceName(req.params.id, ndiSourceName.trim());
  }
  // Reconfigures an existing 'tfl-status' item's modes — see AddTflStatusDialog.tsx's
  // edit mode. A no-op (WHERE ... AND type = 'tfl-status' in store.ts) if this id
  // isn't actually a tfl-status item, same defensive posture as the durationSec
  // type-IN clause above.
  if (tflModes !== undefined) {
    if (!Array.isArray(tflModes) || tflModes.length === 0 || !tflModes.every((m) => VALID_TFL_MODES.includes(m))) {
      return res.status(400).json({ error: `tflModes must be a non-empty array from: ${VALID_TFL_MODES.join(', ')}` });
    }
    store.setLibraryItemTflModes(req.params.id, tflModes);
  }
  // Same reasoning, for an existing 'tfl-arrivals' item's whole station list —
  // see AddTflArrivalsDialog.tsx's edit mode. A full replace (can add/remove a
  // station, or change one's line filter), same as at creation time.
  if (tflStations !== undefined) {
    if (!isValidTflStations(tflStations)) {
      return res.status(400).json({ error: 'tflStations must be a non-empty array of { stopPointId, stopPointName?, lines? }' });
    }
    store.setLibraryItemTflStations(req.params.id, tflStations.map((s) => ({ stopPointId: s.stopPointId, stopPointName: s.stopPointName || s.stopPointId, ...(s.lines && s.lines.length > 0 && { lines: s.lines }) })));
  }
  res.status(204).end();
});

libraryRouter.delete('/:id', (req, res) => {
  store.removeLibraryItem(req.params.id);
  res.status(204).end();
});
