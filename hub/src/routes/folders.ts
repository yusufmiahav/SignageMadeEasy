import { Router } from 'express';
import * as store from '../store.js';

export const foldersRouter = Router();

foldersRouter.get('/', (_req, res) => {
  res.json(store.listFolders());
});

foldersRouter.post('/', (req, res) => {
  const { name, parentId } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' });
  if (parentId !== undefined && parentId !== null && typeof parentId !== 'string') {
    return res.status(400).json({ error: 'parentId must be a string or null' });
  }
  const folder = store.addFolder(name, parentId ?? null);
  res.status(201).json(folder);
});

foldersRouter.patch('/:id', (req, res) => {
  const { name, parentId } = req.body ?? {};
  if (typeof name === 'string') {
    if (!name.trim()) return res.status(400).json({ error: 'name cannot be empty' });
    store.renameFolder(req.params.id, name.trim());
  }
  // Reparents this folder (or leaves it at the top level, for parentId: null) — see
  // store.ts's moveFolder for the cycle guard that backs the 409 below.
  if (parentId !== undefined) {
    if (parentId !== null && typeof parentId !== 'string') return res.status(400).json({ error: 'parentId must be a string or null' });
    const ok = store.moveFolder(req.params.id, parentId);
    if (!ok) return res.status(409).json({ error: "Can't move a folder into its own subfolder" });
  }
  res.status(204).end();
});

// Never deletes contents — see store.ts's removeFolder for why subfolders/items move
// up to this folder's own parent instead.
foldersRouter.delete('/:id', (req, res) => {
  store.removeFolder(req.params.id);
  res.status(204).end();
});
