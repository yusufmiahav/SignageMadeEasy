import { Router } from 'express';
import * as store from '../store.js';

export const settingsRouter = Router();

settingsRouter.get('/', (_req, res) => {
  res.json({ safetyHold: store.getSafetyHold(), savedHubNetworks: store.listSavedHubNetworks() });
});

// Settings screen's action history — see store.ts's listActionEvents. Lives here
// rather than under /api/devices/update-log (devices.ts) since an entry can be
// either a group or a device.
settingsRouter.get('/action-log', (_req, res) => {
  res.json(store.listActionEvents());
});

settingsRouter.patch('/', (req, res) => {
  const { safetyHold } = req.body ?? {};
  if (safetyHold !== undefined) {
    if (typeof safetyHold !== 'boolean') return res.status(400).json({ error: 'safetyHold must be a boolean' });
    store.setSafetyHold(safetyHold);
  }
  res.status(204).end();
});

// Replaces the whole list at once (like library.ts's playlist routes) — this is a
// short, hand-maintained list a person edits directly in Settings, not a collection
// built up one add/remove call at a time.
settingsRouter.put('/hub-networks', (req, res) => {
  const { networks } = req.body ?? {};
  const valid =
    Array.isArray(networks) &&
    networks.every((n) => n && typeof n === 'object' && typeof n.id === 'string' && typeof n.name === 'string' && typeof n.url === 'string');
  if (!valid) return res.status(400).json({ error: 'networks must be an array of { id, name, url } strings' });
  store.setSavedHubNetworks(networks);
  res.status(204).end();
});
