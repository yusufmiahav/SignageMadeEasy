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

**A Pi lost its Wi-Fi connection and needs reconfiguring in the field.** No SSH
needed — after about a minute with no network at all, the Pi broadcasts its own
Wi-Fi network and its screen shows the network name, password, and a web address
to visit from a phone. See `pi-player/README.md`'s "Configuring Wi-Fi in the
field" section.

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

**The kiosk service shows "Failed to start" once or twice (sometimes more) right
after boot, then recovers on its own** (`journalctl -u signage-kiosk.service -b`
shows `XDG_RUNTIME_DIR is not set in the environment`). A startup race:
`pam_systemd`/logind hadn't finished setting up the signage user's session by the
time cage's first attempt or two ran. Two earlier fix attempts here were each
confirmed insufficient on real hardware before landing on the real one:

- Pointing `XDG_RUNTIME_DIR` at a directory systemd created itself, instead of
  waiting for the real one — broke device access entirely with no self-healing:
  cage's `libseat` needs the *actual* pam_systemd-managed runtime directory
  specifically, since that's where the D-Bus session socket it uses to reach
  logind lives.
- An `ExecStartPre` wait for `pam_systemd`'s own `/run/user/<uid>/bus` to exist,
  plus ordering the unit after `systemd-logind.service`/`dbus.service` — reduced
  but didn't eliminate the race: those units being "active" doesn't mean logind
  has finished registering *this specific* new session yet, and the bus-socket
  check could pass near-instantly by observing its own just-opened session
  rather than proving pam_systemd's separate env injection had actually landed.

The actual fix: `provision.sh` now runs `loginctl enable-linger signage`, which
makes logind create `/run/user/<uid>` (and its D-Bus session) at boot, before any
login session exists at all — no race to lose. `signage-kiosk.service`'s
`ExecStart` also now exports `XDG_RUNTIME_DIR` explicitly from that same real
path rather than trusting `pam_systemd`'s per-invocation injection to land in
time. Re-run `provision.sh` and reboot to pick it up.

**The boot splash never appears — you just see plain `[ OK ] Starting...` text
scrolling instead**, even though the theme is installed and set as default,
`splash quiet` is present in `cmdline.txt`, `dtoverlay=vc4-kms-v3d` is present,
and `journalctl -u plymouth-start.service` shows a clean start with no errors.
Root-caused via `plymouth.debug=file:/var/log/plymouth-debug.log` on the kernel
command line (temporary, real-hardware-only diagnostic) and reading the
resulting log: Plymouth detected a serial console (`/dev/ttyS0`, alongside the
real HDMI `/dev/tty1`) and logged `"serial consoles detected, managing them
with details forced"` — it hardcodes a fallback to its plain-text "details"
plugin whenever a serial console is present, regardless of what theme is
configured. That plain-text output *is* the `[ OK ] Starting...` text you're
seeing; every other prerequisite was genuinely fine, Plymouth just never loaded
our theme at all. Raspberry Pi OS's default `cmdline.txt` sets `console=serial0,...`
(or `ttyS0`/`ttyAMA0` depending on model/overlay) alongside `console=tty1`
together, and this isn't something `plymouthd.conf` can override — the fix is
removing the serial console entry, which `provision.sh` now does automatically.
This trades away UART-cable boot debugging, which isn't used on a deployed
kiosk with HDMI + SSH available. Re-run `provision.sh` and reboot to pick it up.

**Screen stays blank/frozen after boot even though `signage-kiosk.service` shows
"active (running)"** with a real cage/Chromium process tree using real CPU —
`journalctl -u signage-kiosk.service -b` shows a tight, unending loop of
`[backend/drm/atomic.c] connector HDMI-A-1: Atomic commit failed: Permission
denied` (and often `[libseat] Could not close device: Unknown object
'/org/freedesktop/login1/session/_N'`). Two fix attempts here were each
confirmed insufficient on real hardware before landing on the real one:

- First suspected a Plymouth/DRM handoff race, since this surfaced right after
  the boot splash fix above started working: added `plymouth-quit-wait.service`
  (which actually blocks until Plymouth has released DRM master, unlike
  `plymouth-quit.service` alone, which only *signals* it to start quitting) to
  the unit's `After=`. Confirmed on real hardware this did **not** fix it — the
  identical failure recurred, immediately, on the very next boot.
- The real root cause, found by correlating `journalctl -b | grep -iE "new
  session|removed session"` timestamps against `systemctl status`'s reported
  start time: the cursor-warp used to be a separate `ExecStartPost=`, sharing
  this unit's single `PAMName=login` session with `ExecStart`. That shared
  session was torn down the instant `ExecStartPost`'s own short-lived process
  exited (its ~15s retry loop finishing lined up almost exactly with the
  session's "Removed" timestamp) — even though cage's own process was still
  running. Losing that session mid-flight is what actually produced the
  "Atomic commit failed" loop; Plymouth was never the culprit, the two issues
  just surfaced around the same time.

Fixed by never giving the cursor warp its own systemd-tracked process at all:
it now runs as a background job launched from inside `ExecStart`'s own `sh -c`,
before `exec` replaces the shell with cage, so there is exactly one process
(and one PAM session) for the entire unit's lifetime — nothing left to exit
early and pull the session out from under cage. The `plymouth-quit-wait.service`
ordering is harmless and worth keeping (it's still the correct ordering in
principle), it just wasn't what was actually broken here. Re-run `provision.sh`
and reboot to pick it up.

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
