import { Router, type Request } from 'express';
import * as store from '../store.js';
import * as piAgent from '../piAgent.js';
import { requireAuth } from '../auth.js';

export const devicesRouter = Router();

// The hub can't know which of its own addresses a given Pi can actually reach — on a
// multi-homed NAS (e.g. one NIC on 192.168.x, another on 10.21.x), the browser doing
// the pairing might be on a different subnet than the Pi being paired, and blindly
// trusting req.get('host') below bakes in whichever address the *browser* happened to
// use, not one the Pi can necessarily route to. Set this to an address reachable from
// every Pi's network when that's not always the same one.
function publicHubUrl(req: Request): string {
  return process.env.SIGNAGE_PUBLIC_HUB_URL ?? `${req.protocol}://${req.get('host')}`;
}

// The Pi's own poller calls this autonomously every ~5s with no login flow — it must
// stay reachable without a session, so it's registered before the requireAuth gate
// below rather than being just another route this router happens to protect.
devicesRouter.post('/:id/heartbeat', (req, res) => {
  const device = store.getDevice(req.params.id);
  if (!device) return res.status(404).json({ error: 'not found' });
  const ip = (req.body?.ip as string | undefined) ?? req.ip ?? device.ip;
  const { tempC, throttled, uptimeSec, diskFreeMb, diskTotalMb } = req.body ?? {};
  store.recordHeartbeat(req.params.id, ip, { tempC, throttled, uptimeSec, diskFreeMb, diskTotalMb });
  res.status(204).end();
});

devicesRouter.use(requireAuth);

devicesRouter.get('/', (_req, res) => {
  res.json(store.listDevices());
});

// Registered before /:id routes below — a literal "reorder" segment here would
// otherwise never be reachable if a param route matched it first (mirrors
// groups.ts's own reorder route for the same reason). `ids` must be the complete
// set of devices in one scope (one location, or the misc/no-location list) — see
// store.reorderDevices's comment.
devicesRouter.put('/reorder', (req, res) => {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
    return res.status(400).json({ error: 'ids must be an array of strings' });
  }
  store.reorderDevices(ids);
  res.status(204).end();
});

devicesRouter.post('/pair', async (req, res) => {
  const { name, ip, groupId, skipHandshake } = req.body ?? {};
  if (typeof ip !== 'string' || (typeof groupId !== 'string' && groupId !== null)) {
    return res.status(400).json({ error: 'ip is required; groupId must be a string or null (no location)' });
  }
  if (store.listDevices().some((d) => d.ip === ip)) {
    return res.status(409).json({ error: `A screen is already paired at ${ip}` });
  }

  let resolvedName = typeof name === 'string' && name.trim() ? name.trim() : 'Display';
  let status: 'online' | 'offline' = 'offline';
  let mac: string | null = null;

  // Real Pis run the tiny local agent this hands off to; skipHandshake lets tests /
  // manual entries that don't have a real agent running still create a device record.
  if (!skipHandshake) {
    try {
      const identity = await piAgent.identify(ip);
      resolvedName = resolvedName === 'Display' ? identity.hostname : resolvedName;
      status = 'online';
      mac = identity.mac ?? null;
    } catch {
      // Pi unreachable right now — still pair it (matches the frontend's existing
      // manual-IP flow, which doesn't require the display to be live to save the pairing).
    }
  }

  const device = store.pairDevice({ name: resolvedName, ip, mac, groupId, status });

  if (!skipHandshake && status === 'online') {
    try {
      await piAgent.configure(ip, device.id, publicHubUrl(req));
    } catch {
      // Non-fatal — the Pi will show its unpaired screen until it can be reconfigured.
    }
  }

  res.status(201).json(device);
});

devicesRouter.patch('/:id', (req, res) => {
  const { name, groupId, videoQuality } = req.body ?? {};
  if (typeof name === 'string') store.renameDevice(req.params.id, name);
  // groupId: null moves the device to "no location" — distinct from omitting the
  // key entirely, which leaves its current location untouched.
  if (typeof groupId === 'string' || groupId === null) store.moveDevice(req.params.id, groupId);
  if (videoQuality === 'auto' || videoQuality === 'full') store.setDeviceVideoQuality(req.params.id, videoQuality);
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

// Misc-screen (no location) equivalents of a location's forced-content/blackout
// controls — see Device.forcedContentId's comment in types.ts.
devicesRouter.put('/:id/forced', (req, res) => {
  const { libId } = req.body ?? {};
  if (libId !== null && typeof libId !== 'string') return res.status(400).json({ error: 'libId must be a string or null' });
  store.setDeviceForcedContent(req.params.id, libId);
  res.status(204).end();
});

devicesRouter.put('/:id/blackout', (req, res) => {
  const { blackout } = req.body ?? {};
  if (typeof blackout !== 'boolean') return res.status(400).json({ error: 'blackout must be a boolean' });
  store.setDeviceBlackout(req.params.id, blackout);
  res.status(204).end();
});

// Misc-screen (no location) equivalents of a location's default-playlist/events
// scheduling — see Device.defaultPlaylist/events' comments in types.ts. Mirror
// groups.ts's own playlist/event routes exactly, scoped to a device instead.
devicesRouter.put('/:id/playlist', (req, res) => {
  const { libIds } = req.body ?? {};
  if (!Array.isArray(libIds)) return res.status(400).json({ error: 'libIds must be an array' });
  store.setDeviceDefaultPlaylist(req.params.id, libIds);
  res.status(204).end();
});

devicesRouter.post('/:id/playlist', (req, res) => {
  const { libIds } = req.body ?? {};
  if (!Array.isArray(libIds)) return res.status(400).json({ error: 'libIds must be an array' });
  store.addToDeviceDefaultPlaylist(req.params.id, libIds);
  res.status(204).end();
});

devicesRouter.delete('/:id/playlist/:libId', (req, res) => {
  store.removeFromDeviceDefaultPlaylist(req.params.id, req.params.libId);
  res.status(204).end();
});

devicesRouter.post('/:id/playlist/:libId/reorder', (req, res) => {
  const { direction } = req.body ?? {};
  if (direction !== 'up' && direction !== 'down') return res.status(400).json({ error: 'direction must be "up" or "down"' });
  store.reorderDeviceDefaultPlaylist(req.params.id, req.params.libId, direction);
  res.status(204).end();
});

devicesRouter.post('/:id/events', (req, res) => {
  const { name, start, end, libIds, startTime, endTime } = req.body ?? {};
  if (typeof name !== 'string' || typeof start !== 'string' || typeof end !== 'string' || !Array.isArray(libIds)) {
    return res.status(400).json({ error: 'name, start, end, libIds are required' });
  }
  if ((startTime !== undefined && typeof startTime !== 'string') || (endTime !== undefined && typeof endTime !== 'string')) {
    return res.status(400).json({ error: 'startTime/endTime must be strings when provided' });
  }
  res.status(201).json(store.addDeviceEvent(req.params.id, { name, start, end, libIds, startTime, endTime }));
});

devicesRouter.delete('/:id/events/:eventId', (req, res) => {
  store.removeDeviceEvent(req.params.id, req.params.eventId);
  res.status(204).end();
});
