import { Router } from 'express';
import * as store from '../store.js';

export const locationsRouter = Router();

locationsRouter.get('/', (_req, res) => {
  res.json(store.listLocations());
});

locationsRouter.post('/', (req, res) => {
  const { name } = req.body ?? {};
  if (typeof name !== 'string') return res.status(400).json({ error: 'name is required' });
  res.status(201).json(store.addLocation(name));
});

locationsRouter.patch('/:id', (req, res) => {
  const { name } = req.body ?? {};
  if (typeof name !== 'string') return res.status(400).json({ error: 'name is required' });
  store.renameLocation(req.params.id, name);
  res.status(204).end();
});

// Never deletes anything filed under it — see store.ts's removeLocation for why
// groups/screens just get un-filed instead.
locationsRouter.delete('/:id', (req, res) => {
  store.removeLocation(req.params.id);
  res.status(204).end();
});
