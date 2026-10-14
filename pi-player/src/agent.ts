import { Router, type Request } from 'express';
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

// Every route below that's about ONE screen's content/pairing (identify, configure,
// unpair, identify-flash, preview) reads this — see hub/src/piAgent.ts's outputQuery,
// which is the only place `?output=2` ever gets added to a request. Anything else
// (restart, update, reprovision, and every Pi-local setup-page route in app.ts) is a
// whole-machine action with no such thing as "just one output," so those don't read
// it at all — triggering them from either output's row in the control app does the
// exact same thing, which is correct, not a bug.
function outputFrom(req: Request): 1 | 2 {
  return req.query.output === '2' ? 2 : 1;
}

agentRouter.get('/identify', (req, res) => {
  const output = outputFrom(req);
  res.json({ hostname: os.hostname(), paired: loadConfig(output) != null, mac: getLocalMac() });
});

agentRouter.post('/configure', (req, res) => {
  const { deviceId, hubUrl } = req.body ?? {};
  if (typeof deviceId !== 'string' || typeof hubUrl !== 'string') {
    return res.status(400).json({ error: 'deviceId and hubUrl are required' });
  }
  const output = outputFrom(req);
  saveConfig({ deviceId, hubUrl }, output);
  startPolling(output);
  res.status(204).end();
});

agentRouter.post('/unpair', (req, res) => {
  const output = outputFrom(req);
  clearConfig(output);
  stopPolling(output);
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
agentRouter.post('/identify-flash', (req, res) => {
  identifyFlash.trigger(outputFrom(req));
  res.status(204).end();
});

// Settings screen's "Preview" button — see preview.ts.
agentRouter.get('/preview', async (req, res) => {
  try {
    const jpeg = await captureScreenshot(outputFrom(req));
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
