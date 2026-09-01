import { Router } from 'express';
import * as store from '../store.js';

export const backupRouter = Router();

backupRouter.get('/', (_req, res) => {
  res.json(store.exportBackup());
});

backupRouter.post('/restore', (req, res) => {
  const { library, groups, devices } = req.body ?? {};
  if (!Array.isArray(library) || !Array.isArray(groups) || !Array.isArray(devices)) {
    return res.status(400).json({ error: 'Not a valid backup file — expected library, groups, and devices arrays' });
  }
  try {
    store.restoreBackup({ library, groups, devices });
    res.status(204).end();
  } catch (err) {
    res.status(400).json({ error: `Restore failed: ${err instanceof Error ? err.message : 'invalid backup data'}` });
  }
});
