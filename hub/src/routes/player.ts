import { Router } from 'express';
import * as store from '../store.js';

export const playerRouter = Router();

playerRouter.get('/:deviceId/state', (req, res) => {
  const state = store.getPlayerState(req.params.deviceId);
  if (!state) return res.status(404).json({ error: 'unknown device' });

  // The Pi player is a different origin than the hub, so relative /uploads/... paths
  // (as stored) need to become absolute before they leave this process.
  const base = `${req.protocol}://${req.get('host')}`;
  const items = state.items.map((item) => ({ ...item, url: item.url.startsWith('/') ? base + item.url : item.url }));

  res.json({ ...state, items });
});
