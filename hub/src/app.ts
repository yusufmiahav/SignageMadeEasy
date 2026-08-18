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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use('/uploads', express.static(UPLOADS_DIR));

  app.use('/api/library', libraryRouter);
  app.use('/api/groups', groupsRouter);
  app.use('/api/devices', devicesRouter);
  app.use('/api/player', playerRouter);
  app.use('/api/scan', scanRouter);

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
