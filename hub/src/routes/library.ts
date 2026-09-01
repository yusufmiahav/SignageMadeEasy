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

libraryRouter.patch('/:id', (req, res) => {
  const { durationSec, name } = req.body ?? {};
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
  res.status(204).end();
});

libraryRouter.delete('/:id', (req, res) => {
  store.removeLibraryItem(req.params.id);
  res.status(204).end();
});
