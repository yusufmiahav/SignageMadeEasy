import { Router } from 'express';
import * as store from '../store.js';

export const settingsRouter = Router();

settingsRouter.get('/', (_req, res) => {
  res.json({ safetyHold: store.getSafetyHold() });
});

settingsRouter.patch('/', (req, res) => {
  const { safetyHold } = req.body ?? {};
  if (safetyHold !== undefined) {
    if (typeof safetyHold !== 'boolean') return res.status(400).json({ error: 'safetyHold must be a boolean' });
    store.setSafetyHold(safetyHold);
  }
  res.status(204).end();
});
