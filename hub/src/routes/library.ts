import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { UPLOADS_DIR } from '../db.js';
import * as store from '../store.js';
import { countPdfPages } from '../pdfPages.js';
import { getVideoDuration } from '../videoDuration.js';
import { capVideoResolution } from '../videoTranscode.js';

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

libraryRouter.post('/video', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });
  // Runs before duration/size are read: a Pi 3B+ can't reliably decode full 1080p
  // source video in real time (confirmed on real hardware — see videoTranscode.ts),
  // so every upload is capped here once rather than relying on it being pre-encoded
  // correctly by hand. Re-encoding a large video takes real time on the NAS; the
  // upload response waits for it rather than serving the oversized original in the
  // meantime.
  await capVideoResolution(req.file.path);
  const duration = await getVideoDuration(req.file.path);
  const size = fs.statSync(req.file.path).size; // req.file.size is the pre-transcode size
  const item = store.addLibraryItem({
    name: req.file.originalname,
    type: 'video',
    size: formatBytes(size),
    duration,
    thumb: `/uploads/${req.file.filename}`,
  });
  res.status(201).json(item);
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
