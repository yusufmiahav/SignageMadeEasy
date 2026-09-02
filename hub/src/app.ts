import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UPLOADS_DIR } from './db.js';
import { libraryRouter } from './routes/library.js';
import { groupsRouter } from './routes/groups.js';
import { devicesRouter } from './routes/devices.js';
import { playerRouter } from './routes/player.js';
import { scanRouter } from './routes/scan.js';
import { backupRouter } from './routes/backup.js';
import { settingsRouter } from './routes/settings.js';
import { authRouter } from './routes/auth.js';
import { requireAuth } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  // credentials: true (needed for the session cookie) requires an explicit origin
  // rather than cors()'s default wildcard — origin: true reflects the request's own
  // Origin header, which covers both the same-origin production deployment (hub
  // serves the control app itself) and the cross-origin dev setup (vite dev server
  // on a different port than the hub).
  app.use(cors({ origin: true, credentials: true }));
  // A backup export/import (see routes/backup.ts) is pure JSON metadata, no binary,
  // but a large library/device count could still exceed express's 100kb default —
  // raised generously since every other route here sends tiny bodies anyway.
  app.use(express.json({ limit: '10mb' }));

  app.use('/uploads', express.static(UPLOADS_DIR));

  // Only the management API below needs a login — the Pi-facing routes
  // (playerRouter, and devicesRouter's own heartbeat route specifically) have no
  // login flow and stay open, same reasoning as devices.ts's heartbeat placement.
  app.use('/api/auth', authRouter);
  app.use('/api/library', requireAuth, libraryRouter);
  app.use('/api/groups', requireAuth, groupsRouter);
  app.use('/api/devices', devicesRouter);
  app.use('/api/player', playerRouter);
  app.use('/api/scan', requireAuth, scanRouter);
  app.use('/api/backup', requireAuth, backupRouter);
  app.use('/api/settings', requireAuth, settingsRouter);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // Serve the control app's production build (apps/web `npm run build` output copied
  // in at Docker build time — see hub/Dockerfile) as the single deployed artifact.
  const webDist = path.resolve(__dirname, '../web-dist');
  app.use(express.static(webDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
    res.sendFile(path.join(webDist, 'index.html'), (err) => {
      if (err) next();
    });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}
