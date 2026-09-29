import { Router } from 'express';
import os from 'node:os';
import { clearConfig, loadConfig, saveConfig } from './config.js';
import { startPolling, stopPolling } from './poller.js';
import { getLocalMac } from './localIp.js';
import * as identifyFlash from './identifyFlash.js';
import { captureScreenshot } from './preview.js';
import * as selfUpdate from './selfUpdate.js';
import * as underclock from './underclock.js';

export const agentRouter = Router();

// The endpoints the hub calls directly (not polled) — see hub/src/piAgent.ts.
// These deliberately have no auth, matching the rest of this LAN-trusted design.

agentRouter.get('/identify', (_req, res) => {
  res.json({ hostname: os.hostname(), paired: loadConfig() != null, mac: getLocalMac() });
});

agentRouter.post('/configure', (req, res) => {
  const { deviceId, hubUrl } = req.body ?? {};
  if (typeof deviceId !== 'string' || typeof hubUrl !== 'string') {
    return res.status(400).json({ error: 'deviceId and hubUrl are required' });
  }
  saveConfig({ deviceId, hubUrl });
  startPolling();
  res.status(204).end();
});

agentRouter.post('/unpair', (_req, res) => {
  clearConfig();
  stopPolling();
  res.status(204).end();
});

// A real hardware reboot, not just this Node process bouncing — a quick process
// restart left the screen looking "stuck" in exactly the same way a genuine hang
// would (still no picture, same blank moment), so there was no way to tell from
// the control app whether this actually did anything. `sudo reboot` already has
// an unconditional sudoers grant (see provision.sh — the local setup page's own
// "Reboot this display" button already uses it via underclock.ts), so this needs
// no new provisioning to work, even on a Pi provisioned long before this change.
agentRouter.post('/restart', async (_req, res) => {
  res.status(204).end();
  try {
    await underclock.reboot();
  } catch {
    // Response already sent — nothing left to do differently if this fails.
  }
});

// Settings screen's "Identify" button (bulb icon) — just bumps a counter the player
// page's own /state poll picks up (see app.ts and identifyFlash.ts), which triggers
// a white/black blink overlay on that Pi's physical display.
agentRouter.post('/identify-flash', (_req, res) => {
  identifyFlash.trigger();
  res.status(204).end();
});

// Settings screen's "Preview" button — see preview.ts.
agentRouter.get('/preview', async (_req, res) => {
  try {
    const jpeg = await captureScreenshot();
    res.type('image/jpeg').send(jpeg);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Settings screen's "Update" button (fast path: app code only) — see selfUpdate.ts.
// 202, not 204: this reports the update as accepted/underway, not completed.
agentRouter.post('/update', async (_req, res) => {
  try {
    await selfUpdate.triggerUpdate();
    res.status(202).end();
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Settings screen's "Re-provision" button (full path) — see selfUpdate.ts.
agentRouter.post('/reprovision', async (_req, res) => {
  try {
    await selfUpdate.triggerReprovision();
    res.status(202).end();
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
