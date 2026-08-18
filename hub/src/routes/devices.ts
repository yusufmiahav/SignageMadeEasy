import { Router } from 'express';
import * as store from '../store.js';
import * as piAgent from '../piAgent.js';

export const devicesRouter = Router();

devicesRouter.get('/', (_req, res) => {
  res.json(store.listDevices());
});

devicesRouter.post('/pair', async (req, res) => {
  const { name, ip, groupId, skipHandshake } = req.body ?? {};
  if (typeof ip !== 'string' || typeof groupId !== 'string') {
    return res.status(400).json({ error: 'ip and groupId are required' });
  }

  let resolvedName = typeof name === 'string' && name.trim() ? name.trim() : 'Display';
  let status: 'online' | 'offline' = 'offline';

  // Real Pis run the tiny local agent this hands off to; skipHandshake lets tests /
  // manual entries that don't have a real agent running still create a device record.
  if (!skipHandshake) {
    try {
      const identity = await piAgent.identify(ip);
      resolvedName = resolvedName === 'Display' ? identity.hostname : resolvedName;
      status = 'online';
    } catch {
      // Pi unreachable right now — still pair it (matches the frontend's existing
      // manual-IP flow, which doesn't require the display to be live to save the pairing).
    }
  }

  const device = store.pairDevice({ name: resolvedName, ip, groupId, status });

  if (!skipHandshake && status === 'online') {
    try {
      await piAgent.configure(ip, device.id, req.protocol + '://' + req.get('host'));
    } catch {
      // Non-fatal — the Pi will show its unpaired screen until it can be reconfigured.
    }
  }

  res.status(201).json(device);
});

devicesRouter.patch('/:id', (req, res) => {
  const { name, groupId } = req.body ?? {};
  if (typeof name === 'string') store.renameDevice(req.params.id, name);
  if (typeof groupId === 'string') store.moveDevice(req.params.id, groupId);
  res.status(204).end();
});

devicesRouter.delete('/:id', (req, res) => {
  const device = store.getDevice(req.params.id);
  store.removeDevice(req.params.id);
  res.status(204).end();

  // Best-effort and fire-and-forget: don't make "delete" feel slow waiting on a Pi
  // that might be offline. If this doesn't land, the Pi's own poller notices within
  // one cycle anyway (its next /api/player/:id/state call 404s and it self-unpairs).
  if (device) piAgent.unpair(device.ip).catch(() => {});
});

devicesRouter.post('/:id/restart', async (req, res) => {
  const device = store.getDevice(req.params.id);
  if (!device) return res.status(404).json({ error: 'not found' });
  try {
    await piAgent.restart(device.ip);
    res.status(204).end();
  } catch {
    res.status(502).json({ error: 'could not reach device' });
  }
});

devicesRouter.put('/:id/announcement', (req, res) => {
  const { announcementId } = req.body ?? {};
  store.setDeviceAnnouncement(req.params.id, announcementId ?? null);
  res.status(204).end();
});

devicesRouter.post('/:id/announcement/toggle', (req, res) => {
  store.toggleDeviceAnnouncement(req.params.id);
  res.status(204).end();
});

devicesRouter.post('/:id/heartbeat', (req, res) => {
  const device = store.getDevice(req.params.id);
  if (!device) return res.status(404).json({ error: 'not found' });
  const ip = (req.body?.ip as string | undefined) ?? req.ip ?? device.ip;
  store.recordHeartbeat(req.params.id, ip);
  res.status(204).end();
});
