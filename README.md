# SignageMadeEasy

Manage LAN-based digital signage — Raspberry Pi players driving 1920×1080 HDMI
displays — from a phone or a laptop. Pair screens, manage a content library, build
per-location playlists and calendar events, and send announcements.

Three parts, each in its own top-level folder:

| Folder | What it is |
|---|---|
| `src/` (repo root) | The control app — a React/Vite web UI, one responsive codebase from phone to desktop. |
| `hub/` | The central server: a Node/Express/SQLite backend every Pi polls and the control app talks to. Docker-deployable, meant to run on an always-on box (e.g. a NAS) on the same LAN. |
| `pi-player/` | What runs on each Raspberry Pi: a local agent/poller service plus the kiosk player page, provisioning script, and systemd units. |

## Deploying the whole system

**1. Deploy the hub** on your NAS or always-on LAN box:

```bash
git clone https://github.com/yusufmiahav/SignageMadeEasy.git
cd SignageMadeEasy
docker compose -f hub/docker-compose.yml up -d --build
```

Open `http://<hub-host-ip>:4000` from any phone or laptop on the same LAN — that's
the control app, now backed by the hub instead of browser-local storage. Full
details (why `network_mode: host` matters, where data persists, backups) are in
[`hub/README.md`](hub/README.md).

**2. Flash and provision each Raspberry Pi 3B+:**

- Flash **Raspberry Pi OS Lite (64-bit)** with Raspberry Pi Imager, using its
  gear-icon customisation to set hostname, enable SSH, and set your Wi-Fi
  SSID/password.
- SSH in once and run the provisioning script:
  ```bash
  sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/yusufmiahav/SignageMadeEasy/main/pi-player/provision.sh)"
  sudo reboot
  ```
- After reboot the display shows its IP and a pairing QR code.

Full details (what the script installs, how the kiosk session works) are in
[`pi-player/README.md`](pi-player/README.md).

**3. Pair each display** from the control app — Home or Settings → "Add a screen"
→ Scan network, Scan QR code, or Enter IP. The app also links to the setup guide
above from Settings → "Setup".

## Local development

**Frontend only, no hub** (the default — persists to `localStorage`):

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check + production build
npm run lint      # oxlint
```

**Frontend against a real hub**, both running locally:

```bash
cd hub && npm install && npm run dev   # terminal 1 — hub on :4000
cd .. && VITE_API_BASE_URL=http://localhost:4000 npm run dev   # terminal 2 — frontend
```

**Pi player**, standalone (not on real hardware — see `pi-player/README.md`):

```bash
cd pi-player && npm install
SIGNAGE_CONFIG_PATH=./dev-config.json PORT=8088 npm run dev
```

## Stack

- **Control app**: React + TypeScript + Vite. Plain CSS — the
  [Modernist](src/styles/modernist.css) design system (tokens + component classes)
  plus [app-level layout CSS](src/styles/app.css), no CSS framework. No router —
  navigation is a single `tab` state (`home | library | schedule | settings`).
- **Hub**: Node + Express + `better-sqlite3` + `multer`, single Docker image also
  serving the control app's static build.
- **Pi player**: Node + Express agent/poller, plain HTML/CSS/JS kiosk page (no
  bundler), `cage` + Chromium for the actual kiosk display session.

## Architecture

The control app's data layer is a typed async client (`src/api/client.ts`) with
two implementations behind the same interface, chosen at build time by whether
`VITE_API_BASE_URL` is set:

- `src/api/localStore.ts` — persists to `localStorage`, works fully standalone
  with no backend (real image thumbnails via `FileReader`, real video duration via
  a temporary `<video>` element). This is the default.
- `src/api/httpClient.ts` — calls the hub's REST API over `fetch`.

No screen or component needs to know which one is active — they only ever call the
typed methods on `api`. The hub, in turn, mirrors that same contract server-side
(`hub/src/store.ts`) plus a few endpoints that only the Pi player needs (resolved
playlist state, heartbeat) — see `hub/README.md` for the full API surface.

## Project structure

```
src/          the control app (see table above)
  api/        typed client + localStorage/HTTP implementations + content resolution logic
  hooks/      useAppState — central data + actions used by every screen
  components/ shared UI (cards, calendar, dialogs, icons)
  screens/    Home, Library, Schedule, Settings
  styles/     modernist.css (design system, unmodified) + app.css (layout)
hub/          central server — see hub/README.md
pi-player/    Raspberry Pi kiosk player — see pi-player/README.md
```
