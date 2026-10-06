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
import { tflRouter } from './routes/tfl.js';
import { foldersRouter } from './routes/folders.js';
import { locationsRouter } from './routes/locations.js';
import { requireAuth } from './auth.js';
import { HUB_VERSION } from './version.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  // credentials: true (needed for the session cookie) requires an explicit origin
  // rather than cors()'s default wildcard — origin: true reflects the request's own
  // Origin header, which covers both the same-origin production deployment (hub
  // serves the control app itself) and the cross-origin dev setup (vite dev server
  // on a different port than the hub).
  // exposedHeaders lets the control app's fetch() read the two custom headers
  // devices.ts's /:id/preview route sets on a stale (cached, Pi unreachable) reply —
  // without this, browsers hide every response header except a small CORS-safelisted
  // set from JS even though the body itself came through fine.
  app.use(cors({ origin: true, credentials: true, exposedHeaders: ['X-Preview-Stale', 'X-Preview-At'] }));
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
  app.use('/api/tfl', requireAuth, tflRouter);
  app.use('/api/folders', requireAuth, foldersRouter);
  app.use('/api/locations', requireAuth, locationsRouter);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // The control app's Settings screen compares this against each device's own
  // reported version (see store.ts's Device.version) to flag screens that haven't
  // picked up the hub's current code yet. Null when the hub's own /VERSION file
  // couldn't be read (see version.ts) — in that case the control app just shows
  // each screen's raw version with nothing to compare it to.
  app.get('/api/version', requireAuth, (_req, res) => res.json({ hubVersion: HUB_VERSION }));

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
