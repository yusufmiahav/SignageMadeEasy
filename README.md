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

## Troubleshooting

**Docker build fails on `COPY public ./public`.** Your checkout is missing the
(otherwise-empty) `public/` folder — git doesn't track empty directories, and some
download methods (zip exports of old commits, certain mirrors) can drop it. Run
`mkdir -p public` in the repo root before building, or re-clone with `git clone`.

**NAS has no `git` or `unzip`.** Many NAS shells (including Ugreen's) ship a minimal
busybox userland. Download and extract with what's usually already there instead:
```bash
curl -L https://github.com/yusufmiahav/SignageMadeEasy/archive/refs/heads/main.zip -o signage.zip
python3 -m zipfile -e signage.zip .
```

**The control app loads but nothing you add sticks / Settings says "Standalone
mode".** The frontend fell back to browser-local storage instead of talking to the
hub. This means the hub's Docker image was built without `VITE_API_BASE_URL` set —
check you're on a current `hub/Dockerfile` (it sets this explicitly) and rebuild with
`docker compose -f hub/docker-compose.yml up -d --build`. A hard-refresh
(Ctrl/Cmd+Shift+R) clears any cached copy of the old, disconnected build.

**A screen never comes online / pairing "succeeds" but the Pi still shows its QR
code.** The hub must be able to reach the Pi's IP directly and vice versa — confirm
`network_mode: host` is set in `hub/docker-compose.yml` (a default Docker bridge
network puts the hub on a different subnet than your LAN) and that both devices are
actually on the same network/VLAN.

**The kiosk display never starts on its own after a reboot.** Raspberry Pi OS Lite
boots to `multi-user.target`, not `graphical.target` — a `signage-kiosk.service`
from before this was fixed (`WantedBy=graphical.target`) will sit inactive forever.
Re-run `provision.sh` (idempotent — safe to run again) to pick up the current unit
file, then reboot. You can check which target a unit is pulled in by with
`systemctl status signage-kiosk.service`; `inactive (dead)` with zero log lines is
the signature of this specific issue.

**A mouse cursor is visible, parked in the bottom-right corner of the display.**
This is expected and, on cage, as good as it gets — confirmed on real hardware
across several attempts that cage cannot be made to render a truly invisible
cursor: neither a transparent Xcursor theme (`XCURSOR_THEME`/`XCURSOR_SIZE`/
`XCURSOR_PATH`) nor CSS `cursor: none` on the page changes what cage itself
draws, since cage's cursor isn't something a client can hide — cage's own
maintainers have said outright that hiding it isn't something they support.
What *does* work: `signage-kiosk.service`'s `ExecStartPost` warps the cursor via
a synthetic input device (`ydotoold`/`ydotool`) to the bottom-right corner at
startup, off the main content — that's the corner cursor you're seeing, and
it's intentional, not a bug. `provision.sh` installs `ydotool`/`ydotoold`
best-effort (not every Raspberry Pi OS release has it in its default repo) — if
it's missing, the warp is skipped and the cursor stays centered instead. A
compositor with a real "hide the cursor" feature (e.g. `labwc`, instead of
`cage`) could do better here, at the cost of a bigger, less-tested change —
not pursued for this project since the corner cursor is a minor cosmetic
issue, not a functional one.

**The kiosk service shows "Failed to start" once or twice right after boot, then
recovers on its own within ~30s** (`journalctl -u signage-kiosk.service -b` shows
`XDG_RUNTIME_DIR is not set in the environment`). A startup race: `pam_systemd`/
logind hadn't finished setting up the signage user's session by the time cage's
first attempt or two ran. Fixed via an `ExecStartPre` in `signage-kiosk.service`
that waits (up to 10s) for `pam_systemd`'s own `/run/user/<uid>/bus` to actually
exist before starting cage — re-run `provision.sh` and reboot to pick it up. (An
earlier attempt at this fix pointed `XDG_RUNTIME_DIR` at a directory systemd
created itself instead of waiting for the real one — don't do that: cage's
`libseat` needs the *actual* pam_systemd-managed runtime directory specifically,
since that's where the D-Bus session socket it uses to reach logind lives;
pointing it elsewhere breaks device access entirely with no self-healing.)

**Deleting a screen in the control app doesn't disconnect it / the Pi still shows
"connected".** Fixed in the hub/Pi-player pairing logic — the hub now pushes an
immediate unpair to the Pi, and the Pi's own poller self-unpairs within one cycle
(~5s) even if it was offline at delete time. Re-run `provision.sh` and reboot the Pi,
and make sure the hub is on a current build, to pick this up.

**"Under-voltage detected" on a Pi 3B+.** The official 2.5A USB-C/micro-USB supply is
worth using — HDMI + Wi-Fi + a browser under load draws more than many phone
chargers reliably deliver, and brief undervoltage can cause visible glitches or
throttling. A one-off warning right after boot is usually the SoC bootloader
noticing a brief dip and is not itself something `provision.sh` can fix — swap the
power supply/cable if it persists or you see repeated warnings in
`dmesg | grep -i voltage`.

**Video playback is choppy.** `signage-kiosk.service` forces Chromium's software
video decoder (`--disable-accelerated-video-decode`) because hardware decode on
this platform was found to silently hang partway through longer videos — see the
comment in that file for the full diagnosis. Software decode trades some smoothness
for reliability; if it's too choppy, re-encode your source video to 720p H.264
(baseline/main profile, not H.265/HEVC/VP9/AV1 — those are much heavier to decode
in software), e.g.:
```bash
ffmpeg -i input.mp4 -vf scale=1280:720 -c:v libx264 -profile:v main -preset medium -crf 23 -an output.mp4
```
(`-an` strips audio — the kiosk always plays muted, so it's dead weight.)

**A fresh hub still shows old locations/screens/library items.** It isn't seeded
with demo data — anything you see was added through the app itself. If you expected
an empty install, double-check you're pointed at the hub you think you are (its data
lives entirely in the `data/` volume you mounted) rather than an old container or a
stale browser tab still caching a previous session.

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
