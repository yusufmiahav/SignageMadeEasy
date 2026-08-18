import { Router } from 'express';
import * as store from '../store.js';

export const groupsRouter = Router();

groupsRouter.get('/', (_req, res) => {
  res.json(store.listGroups());
});

groupsRouter.post('/', (req, res) => {
  const { name } = req.body ?? {};
  if (typeof name !== 'string') return res.status(400).json({ error: 'name is required' });
  res.status(201).json(store.addGroup(name));
});

groupsRouter.patch('/:id', (req, res) => {
  const { name } = req.body ?? {};
  if (typeof name !== 'string') return res.status(400).json({ error: 'name is required' });
  store.renameGroup(req.params.id, name);
  res.status(204).end();
});

groupsRouter.delete('/:id', (req, res) => {
  const deleted = store.deleteGroup(req.params.id);
  if (!deleted) return res.status(409).json({ error: 'group still has devices assigned' });
  res.status(204).end();
});

groupsRouter.put('/:id/playlist', (req, res) => {
  const { libIds } = req.body ?? {};
  if (!Array.isArray(libIds)) return res.status(400).json({ error: 'libIds must be an array' });
  store.setDefaultPlaylist(req.params.id, libIds);
  res.status(204).end();
});

groupsRouter.post('/:id/playlist', (req, res) => {
  const { libIds } = req.body ?? {};
  if (!Array.isArray(libIds)) return res.status(400).json({ error: 'libIds must be an array' });
  store.addToDefaultPlaylist(req.params.id, libIds);
  res.status(204).end();
});

groupsRouter.delete('/:id/playlist/:libId', (req, res) => {
  store.removeFromDefaultPlaylist(req.params.id, req.params.libId);
  res.status(204).end();
});

groupsRouter.post('/:id/playlist/:libId/reorder', (req, res) => {
  const { direction } = req.body ?? {};
  if (direction !== 'up' && direction !== 'down') return res.status(400).json({ error: 'direction must be "up" or "down"' });
  store.reorderDefaultPlaylist(req.params.id, req.params.libId, direction);
  res.status(204).end();
});

groupsRouter.post('/:id/events', (req, res) => {
  const { name, start, end, libIds } = req.body ?? {};
  if (typeof name !== 'string' || typeof start !== 'string' || typeof end !== 'string' || !Array.isArray(libIds)) {
    return res.status(400).json({ error: 'name, start, end, libIds are required' });
  }
  res.status(201).json(store.addEvent(req.params.id, { name, start, end, libIds }));
});

groupsRouter.delete('/:id/events/:eventId', (req, res) => {
  store.removeEvent(req.params.id, req.params.eventId);
  res.status(204).end();
});

groupsRouter.put('/:id/forced', (req, res) => {
  const { libId } = req.body ?? {};
  store.setForcedContent(req.params.id, libId ?? null);
  res.status(204).end();
});
