import { Router } from 'express';
import * as store from '../store.js';

export const backupRouter = Router();

backupRouter.get('/', (_req, res) => {
  res.json(store.exportBackup());
});

backupRouter.post('/restore', (req, res) => {
  const { library, groups, devices, folders, locations } = req.body ?? {};
  if (!Array.isArray(library) || !Array.isArray(groups) || !Array.isArray(devices)) {
    return res.status(400).json({ error: 'Not a valid backup file — expected library, groups, and devices arrays' });
  }
  // Optional — a backup exported before folders/locations existed has no such
  // array; treated as none rather than rejected outright.
  if (folders !== undefined && !Array.isArray(folders)) {
    return res.status(400).json({ error: 'folders must be an array if present' });
  }
  if (locations !== undefined && !Array.isArray(locations)) {
    return res.status(400).json({ error: 'locations must be an array if present' });
  }
  try {
    store.restoreBackup({ library, groups, devices, folders, locations });
    res.status(204).end();
  } catch (err) {
    res.status(400).json({ error: `Restore failed: ${err instanceof Error ? err.message : 'invalid backup data'}` });
  }
});
