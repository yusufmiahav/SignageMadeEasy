import { Router } from 'express';
import os from 'node:os';
import { clearConfig, loadConfig, saveConfig } from './config.js';
import { startPolling, stopPolling } from './poller.js';
import { getLocalMac } from './localIp.js';
import * as identifyFlash from './identifyFlash.js';

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

agentRouter.post('/restart', (_req, res) => {
  res.status(204).end();
  // Give the response a moment to flush, then exit — systemd's Restart=always
  // (see pi-player/systemd/signage-player.service) brings the process straight
  // back up. There's no separate "restart" concept to build; exit-and-respawn is it.
  setTimeout(() => process.exit(0), 200);
});

// Settings screen's "Identify" button (bulb icon) — just bumps a counter the player
// page's own /state poll picks up (see app.ts and identifyFlash.ts), which triggers
// a white/black blink overlay on that Pi's physical display.
agentRouter.post('/identify-flash', (_req, res) => {
  identifyFlash.trigger();
  res.status(204).end();
});
