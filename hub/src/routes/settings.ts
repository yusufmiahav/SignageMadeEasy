import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import * as store from '../store.js';
import * as tapo from '../tapo.js';
import { DATA_DIR } from '../db.js';
import { localSubnets, subnetHintFromHost } from './scan.js';

export const settingsRouter = Router();

settingsRouter.get('/', (_req, res) => {
  const tapoAccount = store.getTapoAccount();
  res.json({
    safetyHold: store.getSafetyHold(),
    savedHubNetworks: store.listSavedHubNetworks(),
    offlineAlertMinutes: store.getOfflineAlertMinutes(),
    blackoutAllActive: store.isBlackoutAllActive(),
    // The password itself is never sent back here — tapoEmail (shown so Settings can
    // display which account is configured) plus this one boolean is all the control
    // app ever needs to know, same write-only-secret pattern as the hub's own PIN.
    tapoEmail: tapoAccount.email,
    tapoConfigured: !!(tapoAccount.email && tapoAccount.password),
  });
});

// Settings screen's action history — see store.ts's listActionEvents. Lives here
// rather than under /api/devices/update-log (devices.ts) since an entry can be
// either a group or a device.
settingsRouter.get('/action-log', (_req, res) => {
  res.json(store.listActionEvents());
});

settingsRouter.patch('/', (req, res) => {
  const { safetyHold, offlineAlertMinutes, tapoEmail, tapoPassword } = req.body ?? {};
  if (safetyHold !== undefined) {
    if (typeof safetyHold !== 'boolean') return res.status(400).json({ error: 'safetyHold must be a boolean' });
    store.setSafetyHold(safetyHold);
  }
  if (offlineAlertMinutes !== undefined) {
    if (typeof offlineAlertMinutes !== 'number' || !Number.isFinite(offlineAlertMinutes) || offlineAlertMinutes < 0) {
      return res.status(400).json({ error: 'offlineAlertMinutes must be a non-negative number' });
    }
    store.setOfflineAlertMinutes(offlineAlertMinutes);
  }
  // tapoEmail: null clears the whole account (both fields) — distinct from omitting
  // both keys entirely, which leaves whatever's already saved untouched. Setting it
  // requires both fields together: a Tapo login needs both to mean anything.
  if (tapoEmail === null) {
    store.clearTapoAccount();
  } else if (tapoEmail !== undefined || tapoPassword !== undefined) {
    if (typeof tapoEmail !== 'string' || !tapoEmail.trim() || typeof tapoPassword !== 'string' || !tapoPassword.trim()) {
      return res.status(400).json({ error: 'tapoEmail and tapoPassword must both be non-empty strings' });
    }
    store.setTapoAccount(tapoEmail.trim(), tapoPassword);
  }
  res.status(204).end();
});

// Discovers Tapo plugs reachable from the hub right now, using the saved account
// above — see tapo.ts's discover() for why this sweeps both a LAN broadcast and
// the hub's own subnets directly (an optional `?subnet=` hint, same param/parsing
// as Pi pairing's own "Scan network" — see scan.ts — covers a plug on a subnet/VLAN
// that isn't one of the hub's own, e.g. a separate guest Wi-Fi network).
settingsRouter.post('/tapo-scan', async (req, res) => {
  const { email, password } = store.getTapoAccount();
  if (!email || !password) return res.status(400).json({ error: 'No Tapo account configured yet — save one above first' });
  const subnets = new Set(localSubnets());
  const hint = typeof req.query.subnet === 'string' ? subnetHintFromHost(req.query.subnet) : null;
  if (hint) subnets.add(hint);
  try {
    const found = await tapo.discover(email, password, [...subnets]);
    res.json(found);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Scan failed' });
  }
});

// Settings' "Update hub" button (Advanced). The hub container itself has no
// Docker access (by design — see hub/README.md's "Auto-update" section on why
// that stays outside any container), so this can't run `docker compose ...
// --build` directly; it only drops a marker file a host-side cron job
// (hub/self-update.sh, polling with --check-marker) picks up within a few
// minutes and acts on. 204, not a promise of done — see that script's own log
// (hub/data/self-update.log) to confirm it actually ran. (Not 202: the control
// app's request() helper only skips parsing a JSON body for 204 — every other
// fire-and-forget action route in this file/devices.ts already follows that,
// this one just missed it originally.)
settingsRouter.post('/update-hub', (_req, res) => {
  fs.writeFileSync(path.join(DATA_DIR, '.update-requested'), String(Date.now()));
  res.status(204).end();
});

// "Blackout (all screens)" as a toggle — see store.ts's engageBlackoutAll/
// restoreFromBlackoutAll for why this needs its own endpoint rather than just
// looping PUT /api/groups/:id/blackout + PUT /api/devices/:id/blackout from the
// control app (the old client-side-loop approach): only the hub can snapshot
// everyone's prior state atomically before clobbering it.
settingsRouter.put('/blackout-all', (req, res) => {
  const { active } = req.body ?? {};
  if (typeof active !== 'boolean') return res.status(400).json({ error: 'active must be a boolean' });
  if (active) store.engageBlackoutAll();
  else store.restoreFromBlackoutAll();
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
