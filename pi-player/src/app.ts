import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { agentRouter } from './agent.js';
import { getCachedState } from './poller.js';
import { getLocalIp } from './localIp.js';
import { loadConfig } from './config.js';
import * as mediaCache from './mediaCache.js';
import * as wifiManager from './wifiManager.js';
import * as localContent from './localContent.js';
import * as underclock from './underclock.js';
import * as staticIp from './staticIp.js';
import * as ndiPlayer from './ndiPlayer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const localContentUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, localContent.tmpDir()),
    filename: (_req, file, cb) => cb(null, `upload-${Date.now()}${path.extname(file.originalname)}`),
  }),
  // Generous cap — this is a single-file fallback, but the file may well be a video.
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
});

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(agentRouter);

  // The player page polls this locally rather than hitting the hub itself — keeps
  // "talk to the hub" and "render the page" decoupled, and means the page always has
  // something to show even mid-reconnect.
  app.get('/state', (_req, res) => {
    const config = loadConfig();
    const { state, error } = getCachedState();
    // Points the page at locally cached media where available (see mediaCache.ts) —
    // falls back to the hub's own URL for anything not downloaded yet, so playback
    // never blocks waiting on a cache warm-up.
    const resolved = state && { ...state, items: state.items.map((item) => ({ ...item, url: mediaCache.resolveUrl(item) })) };
    const wifiStatus = wifiManager.getStatus();
    // Takes priority over the normal unpaired/connecting/player screens on the
    // kiosk display (see player.js) — while broadcasting its own network there's no
    // real LAN for the control app to reach this Pi on anyway, so the usual QR/IP
    // pairing flow is moot until this resolves.
    const networkSetup = wifiStatus.hotspotActive
      ? { ssid: wifiStatus.hotspotSsid, password: wifiStatus.hotspotPassword, url: `http://${getLocalIp()}:8088/network-setup.html` }
      : null;
    res.json({ paired: config != null, ip: getLocalIp(), state: resolved, error, networkSetup, localContent: localContent.get() });
  });

  // Field fail-safe: reachable any time the hub can't be reached (unpaired, hub down,
  // wrong IP, not deployed yet — not just the no-network hotspot case above), so this
  // isn't gated on wifiStatus/hotspot state the way /network-setup is. See player.js's
  // pollOnce for where this takes priority over the unpaired/connecting screens, and
  // loses it the moment the hub has real state to show again.
  app.post('/local-content', localContentUpload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    try {
      localContent.save(req.file);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete('/local-content', (_req, res) => {
    localContent.clear();
    res.json({ ok: true });
  });

  app.get('/local-content/file', (_req, res) => {
    const file = localContent.filePath();
    if (!file) return res.status(404).end();
    res.sendFile(file);
  });

  // Underclock toggle (see underclock.ts) — a no-heatsink option for running a bare
  // Pi 3B+ cooler, at the cost of some CPU headroom. Only takes effect on reboot,
  // which is what rebootRequired below is for.
  app.get('/underclock/status', async (_req, res) => {
    res.json(await underclock.getStatus());
  });

  app.post('/underclock', async (req, res) => {
    const { enabled } = req.body ?? {};
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be a boolean' });
    try {
      await underclock.setEnabled(enabled);
      res.json(await underclock.getStatus());
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // A real hardware reboot — deliberately separate from agent.ts's /restart (which
  // only restarts this Node process) and only ever reachable from the local
  // device-setup page a person is physically looking at, never from the hub.
  app.post('/system/reboot', async (_req, res) => {
    try {
      res.json({ ok: true });
      await underclock.reboot();
    } catch {
      // Response already sent — nothing left to do differently if this fails.
    }
  });

  // Static-IP / DHCP toggle (see staticIp.ts) for whichever connection currently
  // holds this Pi's default route.
  app.get('/network-ip/status', async (_req, res) => {
    res.json(await staticIp.getStatus());
  });

  app.post('/network-ip', async (req, res) => {
    const { method, address, gateway, dns } = req.body ?? {};
    try {
      if (method === 'auto') {
        await staticIp.setDhcp();
      } else if (method === 'manual') {
        if (typeof address !== 'string' || !address || typeof gateway !== 'string' || !gateway) {
          return res.status(400).json({ error: 'address and gateway are required for a static IP' });
        }
        await staticIp.setStatic({ address, gateway, dns: typeof dns === 'string' ? dns : '' });
      } else {
        return res.status(400).json({ error: 'method must be "auto" or "manual"' });
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Field Wi-Fi provisioning (see wifiManager.ts) — reachable at this same address
  // whether that's the real LAN or, when broadcasting its own fallback network, the
  // hotspot's own gateway address a phone joining that network would be given.
  app.get('/network-setup/networks', async (_req, res) => {
    try {
      res.json({ ssids: await wifiManager.scanNetworks() });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/network-setup', async (req, res) => {
    const { ssid, password } = req.body ?? {};
    if (typeof ssid !== 'string' || !ssid) return res.status(400).json({ error: 'ssid is required' });
    const result = await wifiManager.applyCredentials(ssid, typeof password === 'string' ? password : '');
    if (result.ok) res.json({ ok: true });
    else res.status(502).json({ ok: false, error: result.error });
  });

  // Native NDI playback (Pi 4/5 only — see ndiPlayer.ts). Mirrors the mpv-branch's own
  // /native-<x>/play|status|stop shape: a native process spawned per item, controlled
  // via a tiny HTTP surface the player page (player.js) drives instead of a <video>
  // tag, since NDI has no browser decoder.
  app.post('/native-ndi/play', (req, res) => {
    const { ndiSourceName } = req.body ?? {};
    if (typeof ndiSourceName !== 'string' || !ndiSourceName) return res.status(400).json({ error: 'ndiSourceName is required' });
    res.json({ token: ndiPlayer.play(ndiSourceName) });
  });

  app.get('/native-ndi/status/:token', (req, res) => {
    res.json({ playing: ndiPlayer.isPlaying(Number(req.params.token)) });
  });

  app.post('/native-ndi/stop', (_req, res) => {
    ndiPlayer.stop();
    res.json({ ok: true });
  });

  app.get('/native-ndi/sources', async (_req, res) => {
    try {
      res.json({ sources: await ndiPlayer.findSources() });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Locally cached media (see mediaCache.ts) — served alongside the hub's own URL,
  // which /state falls back to for anything not cached yet.
  app.get('/media/:id', (req, res) => {
    const file = mediaCache.filePathFor(req.params.id);
    if (!file) return res.status(404).end();
    res.sendFile(file);
  });

  // Encodes this Pi's bare IP address — what the control app's "Scan QR code" pairing
  // mode reads, same info as the "Enter IP" flow just captured with a camera instead.
  app.get('/qr.png', async (_req, res) => {
    const ip = getLocalIp();
    if (!ip) return res.status(503).end();
    res.type('png');
    QRCode.toFileStream(res, ip, { margin: 1, width: 400 });
  });

  // Vendored (not CDN-loaded) so PDF playback keeps working with no internet access —
  // the Pi only needs the LAN to reach the hub, matching the rest of this design.
  app.use('/vendor/pdfjs', express.static(path.resolve(__dirname, '../node_modules/pdfjs-dist/build')));

  app.use(express.static(path.resolve(__dirname, '../public')));

  return app;
}
