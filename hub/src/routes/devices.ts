import fs from 'node:fs';
import path from 'node:path';
import { Router, type Request } from 'express';
import * as store from '../store.js';
import * as piAgent from '../piAgent.js';
import { requireAuth } from '../auth.js';
import { DATA_DIR } from '../db.js';

export const devicesRouter = Router();

// The most recent successful /preview frame for each device, kept so a screen that's
// gone offline since the last time someone checked still shows *something* instead
// of just "couldn't reach this screen" — see the /:id/preview route below. Filename
// is the device id alone (deterministic, no DB column needed); mtime doubles as the
// "captured at" timestamp.
const PREVIEWS_DIR = path.join(DATA_DIR, 'previews');
fs.mkdirSync(PREVIEWS_DIR, { recursive: true });

function previewCachePath(deviceId: string): string {
  return path.join(PREVIEWS_DIR, `${deviceId}.jpg`);
}

// The hub can't know which of its own addresses a given Pi can actually reach —
// blindly trusting req.get('host') below bakes in whichever address the *browser*
// happened to use at pairing time, not one the Pi can necessarily route to. A single
// SIGNAGE_PUBLIC_HUB_URL env var only helps when there's ONE address every screen
// can reach; a hub with more than one fixed network address (e.g. 192.168.1.x and
// 10.21.1.x, each serving different screens) has no single correct answer here at
// all — see the pair route's own `hubUrl` request field below, which lets the
// person pairing say explicitly "this screen reaches the hub at X" per screen
// instead, overriding this guess.
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
  const { tempC, throttled, uptimeSec, diskFreeMb, diskTotalMb, usbOverrideActive, playerStartedAt, version } = req.body ?? {};
  store.recordHeartbeat(req.params.id, ip, { tempC, throttled, uptimeSec, diskFreeMb, diskTotalMb, usbOverrideActive, playerStartedAt, version });
  res.status(204).end();
});

devicesRouter.use(requireAuth);

devicesRouter.get('/', (_req, res) => {
  res.json(store.listDevices());
});

// Registered before /:id routes below, same "a literal segment here would otherwise
// never be reachable" reasoning as /reorder below. Settings screen's "Update log"
// section — see store.listUpdateEvents.
devicesRouter.get('/update-log', (_req, res) => {
  res.json(store.listUpdateEvents());
});

// Registered before /:id routes below — a literal "reorder" segment here would
// otherwise never be reachable if a param route matched it first (mirrors
// groups.ts's own reorder route for the same reason). `ids` must be the complete
// set of devices in one scope (one group, or the standalone/no-group list) — see
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
  const { name, ip, groupId, locationId, skipHandshake, hubUrl } = req.body ?? {};
  if (typeof ip !== 'string' || (typeof groupId !== 'string' && groupId !== null)) {
    return res.status(400).json({ error: 'ip is required; groupId must be a string or null (no group)' });
  }
  if (locationId !== undefined && locationId !== null && typeof locationId !== 'string') {
    return res.status(400).json({ error: 'locationId must be a string or null' });
  }
  if (hubUrl !== undefined && typeof hubUrl !== 'string') {
    return res.status(400).json({ error: 'hubUrl must be a string' });
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

  const device = store.pairDevice({ name: resolvedName, ip, mac, groupId, locationId: locationId ?? null, status });

  if (!skipHandshake && status === 'online') {
    try {
      // An explicit hubUrl from the pairing request always wins over the
      // env-var/req.get('host') guess — see publicHubUrl's own comment.
      await piAgent.configure(ip, device.id, hubUrl || publicHubUrl(req));
    } catch {
      // Non-fatal — the Pi will show its unpaired screen until it can be reconfigured.
    }
  }

  res.status(201).json(device);
});

devicesRouter.patch('/:id', async (req, res) => {
  const { name, groupId, locationId, videoQuality, ip, hubUrl } = req.body ?? {};
  if (typeof name === 'string') store.renameDevice(req.params.id, name);
  // groupId: null moves the device to "standalone, no group" — distinct from
  // omitting the key entirely, which leaves its current group untouched.
  if (typeof groupId === 'string' || groupId === null) store.moveDevice(req.params.id, groupId);
  // locationId: null un-files a standalone screen from any Location — only
  // meaningful while the screen has no group (a grouped screen's Location comes
  // from its group instead). Same omit-vs-null distinction as groupId above.
  if (locationId !== undefined) {
    if (locationId !== null && typeof locationId !== 'string') return res.status(400).json({ error: 'locationId must be a string or null' });
    store.setDeviceLocation(req.params.id, locationId);
  }
  if (videoQuality === 'auto' || videoQuality === 'full') store.setDeviceVideoQuality(req.params.id, videoQuality);

  // Repoints this device at a different IP — e.g. its DHCP lease changed (no
  // reservation), or its SD card was re-flashed/factory-reset and would
  // otherwise re-pair as a brand new device. Pushes the exact same /configure
  // call the initial pairing flow above uses, just targeting this EXISTING
  // device's id instead of a freshly minted one, so whatever Pi is actually at
  // the new address adopts this device's identity and inherits its full
  // existing configuration (group, schedule, forced content, name, etc.)
  // instead of starting over. Non-fatal if nothing answers there right now —
  // same "still save it, the Pi can catch up later" reasoning as pairing's own
  // handshake, and matters here in particular: the IP might be edited based on
  // what the router's DHCP table says *before* that Pi has even booted yet.
  //
  // The /configure push below fires even when the given IP matches what's
  // already stored — real-world case: a screen's hubUrl goes stale (e.g. it was
  // first paired against a different network before being physically moved, or
  // the hub itself changed address) while its own IP hasn't changed at all, so
  // gating the push on "did the IP change" would never fix it. Re-saving the
  // same IP from Settings is then the way to force a fresh /configure — using
  // whichever hub address *this* request arrived on — without needing to SSH in
  // and hand-edit the Pi's config.json.
  if (typeof ip === 'string' && ip.trim()) {
    const device = store.getDevice(req.params.id);
    if (!device) return res.status(404).json({ error: 'not found' });
    const trimmedIp = ip.trim();
    if (trimmedIp !== device.ip) {
      if (store.listDevices().some((d) => d.id !== device.id && d.ip === trimmedIp)) {
        return res.status(409).json({ error: `A screen is already paired at ${trimmedIp}` });
      }
      store.setDeviceIp(device.id, trimmedIp);
    }
    let reconfigured = false;
    try {
      await piAgent.configure(trimmedIp, device.id, (typeof hubUrl === 'string' && hubUrl) || publicHubUrl(req));
      reconfigured = true;
    } catch {
      // Non-fatal — see this block's own comment above.
    }
    return res.json({ ok: true, reconfigured });
  }

  res.status(204).end();
});

devicesRouter.delete('/:id', (req, res) => {
  const device = store.getDevice(req.params.id);
  store.removeDevice(req.params.id);
  res.status(204).end();
  // Otherwise orphaned forever — nothing else ever looks this file up again once
  // the device id it's keyed by no longer exists.
  fs.unlink(previewCachePath(req.params.id), () => {});

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

// Pi 4/5 or x86 device only — relays the paired device's own NDI discovery for
// AddNdiSourceDialog's "Scan for sources" button (see pi-player/src/ndiPlayer.ts's
// findSources). 502 on unreachable/not-NDI-capable/discovery-helper-missing mirrors
// /restart above — there's no way to distinguish those cases from here, so the dialog
// just falls back to manual entry either way.
devicesRouter.get('/:id/ndi-sources', async (req, res) => {
  const device = store.getDevice(req.params.id);
  if (!device) return res.status(404).json({ error: 'not found' });
  try {
    res.json({ sources: await piAgent.listNdiSources(device.ip) });
  } catch {
    res.status(502).json({ error: 'could not reach device' });
  }
});

// Settings screen's "Identify" button (bulb icon) — see pi-player/src/identifyFlash.ts.
devicesRouter.post('/:id/identify-flash', async (req, res) => {
  const device = store.getDevice(req.params.id);
  if (!device) return res.status(404).json({ error: 'not found' });
  try {
    await piAgent.identifyFlash(device.ip);
    res.status(204).end();
  } catch {
    res.status(502).json({ error: 'could not reach device' });
  }
});

// Settings screen's "Preview" button — see pi-player/src/preview.ts. A successful
// live fetch is cached to disk (fire-and-forget — a failed write here shouldn't fail
// the request that already has a perfectly good image to return); a failed one falls
// back to that cache so an offline screen still shows its last-known frame instead of
// just an error, with X-Preview-Stale/X-Preview-At telling the control app which
// case this is (see DevicePreviewDialog.tsx). Only a 502 with no cache at all — a
// screen that's never once successfully previewed — behaves exactly as before.
devicesRouter.get('/:id/preview', async (req, res) => {
  const device = store.getDevice(req.params.id);
  if (!device) return res.status(404).json({ error: 'not found' });
  const cachePath = previewCachePath(device.id);
  try {
    const jpeg = await piAgent.preview(device.ip);
    fs.writeFile(cachePath, jpeg, () => {});
    res.set('X-Preview-Stale', 'false');
    res.type('image/jpeg').send(jpeg);
  } catch {
    try {
      const cached = fs.readFileSync(cachePath);
      res.set('X-Preview-Stale', 'true');
      res.set('X-Preview-At', fs.statSync(cachePath).mtime.toISOString());
      res.type('image/jpeg').send(cached);
    } catch {
      res.status(502).json({ error: 'could not reach device' });
    }
  }
});

// Settings screen's "Update" button (fast path) — see pi-player/src/selfUpdate.ts.
// Unlike the other agent-relayed routes above, the error message is relayed
// verbatim rather than collapsed to a generic "could not reach device" — the most
// likely failure (a Pi not yet re-provisioned since this feature shipped) comes
// back from the agent with a specific, actionable reason worth showing.
devicesRouter.post('/:id/update', async (req, res) => {
  const device = store.getDevice(req.params.id);
  if (!device) return res.status(404).json({ error: 'not found' });
  try {
    await piAgent.update(device.ip);
    // The agent has accepted the trigger (not necessarily finished — see
    // store.ts's markUpdateTriggered) — from here the control app can show a live
    // "Updating…" status instead of just the one-off toast that used to be the
    // only feedback this ever gave.
    store.markUpdateTriggered(device.id, device.name, 'update');
    res.status(204).end();
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'could not reach device' });
  }
});

// Settings screen's "Re-provision" button (full path) — see
// pi-player/src/selfUpdate.ts. Same verbatim-error reasoning as /update above.
devicesRouter.post('/:id/reprovision', async (req, res) => {
  const device = store.getDevice(req.params.id);
  if (!device) return res.status(404).json({ error: 'not found' });
  try {
    await piAgent.reprovision(device.ip);
    store.markUpdateTriggered(device.id, device.name, 'reprovision');
    res.status(204).end();
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'could not reach device' });
  }
});

// Home screen's "Clear USB override" button — see pi-player/src/usbOverride.ts and
// piAgent.ts's clearUsbOverride. Optimistically flips the hub's own copy of the flag
// on success so the badge disappears immediately rather than waiting for the next
// heartbeat to confirm it (which still happens regardless, and is the only thing
// that sets it back to true again if something re-activates the override).
devicesRouter.post('/:id/clear-usb-override', async (req, res) => {
  const device = store.getDevice(req.params.id);
  if (!device) return res.status(404).json({ error: 'not found' });
  try {
    await piAgent.clearUsbOverride(device.ip);
    store.setDeviceUsbOverrideActive(device.id, false);
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

// Standalone-screen (no group) equivalents of a group's forced-content/blackout
// controls — see Device.forcedPlaylist's comment in types.ts.
// @deprecated Single-item route, kept for the Companion module's existing action
// — the control app itself uses /forced-playlist below.
devicesRouter.put('/:id/forced', (req, res) => {
  const { libId } = req.body ?? {};
  if (libId !== null && typeof libId !== 'string') return res.status(400).json({ error: 'libId must be a string or null' });
  store.setDeviceForcedContent(req.params.id, libId);
  res.status(204).end();
});

// Mirrors the /:id/playlist routes below exactly, scoped to the forced playlist.
devicesRouter.put('/:id/forced-playlist', (req, res) => {
  const { libIds } = req.body ?? {};
  if (!Array.isArray(libIds)) return res.status(400).json({ error: 'libIds must be an array' });
  store.setDeviceForcedPlaylist(req.params.id, libIds);
  res.status(204).end();
});

devicesRouter.post('/:id/forced-playlist', (req, res) => {
  const { libIds } = req.body ?? {};
  if (!Array.isArray(libIds)) return res.status(400).json({ error: 'libIds must be an array' });
  store.addToDeviceForcedPlaylist(req.params.id, libIds);
  res.status(204).end();
});

devicesRouter.delete('/:id/forced-playlist/:libId', (req, res) => {
  store.removeFromDeviceForcedPlaylist(req.params.id, req.params.libId);
  res.status(204).end();
});

devicesRouter.post('/:id/forced-playlist/:libId/reorder', (req, res) => {
  const { direction } = req.body ?? {};
  if (direction !== 'up' && direction !== 'down') return res.status(400).json({ error: 'direction must be "up" or "down"' });
  store.reorderDeviceForcedPlaylist(req.params.id, req.params.libId, direction);
  res.status(204).end();
});

devicesRouter.put('/:id/blackout', (req, res) => {
  const { blackout } = req.body ?? {};
  if (typeof blackout !== 'boolean') return res.status(400).json({ error: 'blackout must be a boolean' });
  store.setDeviceBlackout(req.params.id, blackout);
  res.status(204).end();
});

// Standalone-screen (no group) equivalents of a group's default-playlist/events
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
