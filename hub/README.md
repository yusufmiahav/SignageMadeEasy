# SignageMadeEasy — Hub

The central server every paired Raspberry Pi polls, and the only thing the control
app (`../src`) talks to over the network. One container serves both the REST API
(`/api/*`) and the control app's static build (everything else).

## Deploying on your NAS (Ugreen DXP4800 or similar)

```bash
git clone https://github.com/yusufmiahav/SignageMadeEasy.git
cd SignageMadeEasy
git checkout claude/signage-made-easy-dev-r00fl6
docker compose -f hub/docker-compose.yml up -d --build
```

**That branch checkout matters**: this repo's `main` branch does not yet have
everything described in this README (or in the code) — active work happens on
`claude/signage-made-easy-dev-r00fl6` and gets merged to `main` only
periodically. Deploying from `main` right now would silently miss fixes,
including ones referenced elsewhere in this file.

Then open `http://<nas-ip>:4000` from any phone or laptop on the same LAN — that's
the control app, now talking to a real hub instead of `localStorage`.

## Updating

```bash
cd SignageMadeEasy
git pull
docker compose -f hub/docker-compose.yml up -d --build
```

`git pull` updates whichever branch you're currently on — since the initial
clone above already checked out `claude/signage-made-easy-dev-r00fl6`, this
just needs to run from inside that same checkout. `--build` matters: without
it, `up -d` will happily restart the container using whatever image was built
last time, silently skipping the update. `hub/data` (your library, locations,
paired screens) lives outside the git checkout entirely and is untouched by
either command.

If `git pull` ever refuses because of local changes it doesn't want to
overwrite (rare — nothing in this repo expects to be hand-edited on the NAS),
check `git status` before doing anything destructive; `git stash` is usually
the safe way to get `pull` moving again without losing whatever changed.

**Networking is not optional here**: the compose file runs the container with
`network_mode: host` on purpose. The hub needs to reach Pi IPs directly (to finish
pairing and to send restart commands) and to scan its own `/24` for unpaired
displays — both require sharing the NAS's actual LAN subnet, which a default Docker
bridge network won't give you. If your platform can't do host networking, use a
macvlan network bound to your LAN interface instead.

Everything persists under `hub/data/` (bind-mounted): `signage.db` (SQLite) and
`uploads/` (the media library). Back that directory up; that's the whole hub's state.

## Running as a non-root user

The hub's server process runs as a non-root user (uid/gid 1000) rather than root,
for defense in depth. Nothing to do on your end — `docker-entrypoint.sh` starts
as root, fixes `hub/data`'s ownership (a host bind mount, so Docker itself never
touches it), and drops to the non-root user before starting the server, every
time the container starts. This self-heals a `hub/data` left root-owned by an
older version of this image too — just rebuild/pull and restart.

If you're instead seeing `EACCES: permission denied, mkdir '/app/data/uploads'`
right now, you're on an image from before this self-healing entrypoint existed —
pull the latest hub image (or rebuild from the latest source) and restart; no
manual `chown` should be needed after that. If you'd rather not rebuild
immediately, running `sudo chown -R 1000:1000 hub/data` once before
`docker compose ... up -d` unblocks the current image too.

## Login PIN

The control app asks for a PIN before showing or changing anything on this hub — a
single shared PIN, not per-user accounts, since this is a small LAN control panel
rather than a multi-tenant system. **Defaults to `Abc123`** if you don't set
anything, so a fresh hub is usable immediately.

**Change it** by setting `SIGNAGE_PIN` on the hub container (see `docker-compose.yml`,
already there commented in with the default value) — edit that line and
`docker compose -f hub/docker-compose.yml up -d --build` again to apply it. Anyone
already logged in stays logged in until they log out; the new PIN only applies to
the next login.

This only gates the management API (library, groups, screens, network scan, backup)
— it does **not** encrypt traffic. Over plain HTTP (the default LAN deployment,
before you set up HTTPS) the PIN and session cookie both travel in the clear, so
anyone on the same network with a packet sniffer could capture them; this is a lock
on the front door, not a wall around the building. Put the hub behind HTTPS (a
reverse proxy with a self-signed or real certificate) before relying on this PIN to
keep out anyone more determined than a casual LAN user.

**Multi-homed NAS (more than one network)**: when pairing a screen, the hub tells it
which address to poll based on whatever host the *browser* used to reach the hub —
fine on a single-subnet LAN, but if your NAS has multiple NICs (e.g. one on
`192.168.x`, another on `10.21.x`) and a Pi ends up on a different one than the
browser doing the pairing, the Pi gets handed an address it can't route to and sits
stuck on "waiting for the hub." Set `SIGNAGE_PUBLIC_HUB_URL` (e.g.
`http://10.21.0.5:4000`) as an environment variable on the hub container to always
hand out one specific, known-reachable address regardless of which interface the
pairing request came in on. A screen already paired with the wrong address needs its
`hubUrl` fixed directly in `/opt/signage/config.json` on the Pi (then
`sudo systemctl restart signage-player`) — re-pairing isn't required.

## Pairing a Raspberry Pi

See `../pi-player/README.md` for flashing + provisioning. Once a Pi is running the
player service, pair it from the control app's Settings/Home "Add a screen" dialog —
Scan network, Scan QR, or Enter IP all end up calling this hub's `/api/devices/pair`,
which reaches the Pi directly to complete the handshake.

## Android / browser-only screens

For an Android box, smart TV, or any other display you'd rather run a kiosk
browser app on than this project's own Pi/x86 software (`../pi-player/`) — image
and video only, plus the announcement ticker. No local agent, no `provision.sh`,
nothing to install on the device beyond a kiosk-mode browser app (e.g.
[Fully Kiosk Browser](https://www.fully-kiosk.com/)).

**Pairing** (control app → "Add a screen" → **Android / browser screen**) doesn't
reach out to the device at all — unlike the Pi flow above, there's no local agent
to call `/identify` on, so this just creates the device record directly and hands
back a URL (`http://<hub>/screen/<deviceId>`) plus a QR code of it. Open that URL
in the kiosk browser's start-page setting once — that's the entire setup. The
device's real IP fills in automatically from its own first heartbeat.

**How it works**: `hub/browser-player/` is a small, dependency-free static page
(no build step) served directly by the hub at `/screen/<deviceId>` — the page
reads its own device id from the URL and polls `/api/player/<deviceId>/state`
and posts to `/api/devices/<deviceId>/heartbeat` itself, both same-origin, so
there's no hub address to configure anywhere.

**Local storage, not just live polling** — two independent layers, since a kiosk
browser can restart (scheduled reload, device reboot) at any moment:
- Downloaded images/video are cached via the browser's [Cache Storage
  API](https://developer.mozilla.org/en-US/docs/Web/API/Cache) and pruned to only
  what's in the current playlist — playback reads from there once cached instead
  of re-fetching from the hub every rotation, and keeps working through a brief
  network drop.
- The last-known-good resolved state (same `safetyHold`-gated behavior as the Pi
  player — see `../pi-player/README.md`'s "How it works") is persisted to
  `localStorage`, so a fresh page load with the hub genuinely unreachable still
  shows the last real content instead of a blank "connecting" screen, using the
  cached media above to actually render it.

**What's deliberately not supported here**, since none of it applies without a
local agent running on the device: restart-from-the-control-app, the "Identify"
flash button, NDI, the TfL status board, clock, PDF, and the Wi-Fi
fallback hotspot / local-content failsafe. Clicking Restart/Identify on one of
these screens just surfaces a clear "could not reach device" error rather than
doing anything — same as it already does for a Pi that's genuinely offline.

## Video: resolution, format, and how the automatic capping works

**Why this matters**: a Raspberry Pi 3B+ decodes video in hardware (the VideoCore IV
GPU), but that hardware decoder is fixed-throughput — it can only decode so many
pixels per second regardless of CPU load, temperature, or how good the source
bitrate is. Confirmed on real Pi 3B+ hardware: a 1920x1080 H.264 source dropped
roughly 65% of frames even with hardware decode active, the display already at its
correct native resolution, and heat/bitrate ruled out as causes — the bottleneck is
decode throughput at the *source* resolution, not anything about the display or the
encode quality. Lowering the source resolution is what actually fixes stutter; a
"better" bitrate or a beefier heatsink doesn't touch this bottleneck at all.

**Best settings to upload, if you're encoding yourself:**
- **Resolution**: 1280x720 (720p) or lower. This is what's confirmed smooth on a
  Pi 3B+ — the automatic cap below defaults to exactly this width for that reason.
  Go lower (e.g. 854x480) if you're still seeing dropped frames on your specific
  hardware/content mix.
- **Codec**: H.264 ("AVC"), in an `.mp4` container. This is the only codec the
  Pi 3B+'s VideoCore IV has a hardware decode path for at all — HEVC/H.265, VP9, and
  AV1 all fall back to slow software decode on this SoC regardless of resolution, so
  a small HEVC file can stutter worse than a larger H.264 one.
- **Profile**: H.264 High or Main profile at a moderate bitrate (a few Mbps is
  plenty for signage content) — the hardware decoder handles either fine; profile
  isn't the bottleneck here, resolution and codec are.

**What the hub does automatically on upload** (`hub/src/videoTranscode.ts`): every
video upload is inspected with `ffprobe`; if it's wider than `1280px` a capped copy
is encoded via `ffmpeg` **in the background**, alongside the untouched original —
neither replaces the other. This means you don't strictly have to pre-encode
correctly yourself — a 4K or 1080p upload gets a capped copy made for it
automatically — but it only checks *resolution*, not codec, so an already-small
HEVC/VP9/AV1 file currently skips capping and still hits slow software decode on
the Pi. If you're not sure your source is H.264, re-encode it yourself first (or
ask for the codec check to be added here too).

Because capping runs in the background, the upload itself responds immediately —
you don't wait through a multi-minute re-encode before the item shows up in the
Library. While it's running, the item's card shows a **"Decoding…"** badge; if it
ever shows **"Full-res only"** instead, capping failed for that file (corrupt
input, an ffmpeg error, a timeout on a very long clip) and every screen just plays
the original, same as if it never needed capping at all.

**Full resolution on a per-screen basis**: each screen (Home screen → its device
card) has a "Video" dropdown — **Optimized video** (default) plays the capped copy
once one exists, falling back to the original while it's still processing;
**Full-resolution video** always plays the original upload regardless of capping
state. Use "Full-resolution video" for a screen on more capable hardware (Pi 4/5)
or a lower-resolution display where the cap buys nothing — every other screen keeps
getting the capped copy from the same upload.

Override the cap width with the `SIGNAGE_MAX_VIDEO_WIDTH` environment variable on
the hub container if your fleet's baseline hardware differs (e.g. everything is
Pi 4/5-class, or you want it lower for an even weaker device) — it only changes
what "capped" means, the per-screen full-resolution option above is independent of
it. A large source video takes real time to re-encode — the NAS is far more capable
than the Pi this protects, but it's not instant, which is exactly why it no longer
blocks the upload response.

**Maximum upload size**: 500MB per file (`hub/src/routes/library.ts`'s `multer`
config) — generous headroom for looped signage clips, which are typically short.

## TfL live status boards

Adding a "TfL status" library item (Library screen → **Add TfL status**) shows a
live red/amber/green line-status board for the Tube/Overground/DLR/Elizabeth line
modes you pick, on any screen — no per-device setup needed, and no restriction to
Pi 4/5 or x86 hardware the way NDI has, since this is plain HTML/CSS rendered by
the player page itself.

The hub polls `https://api.tfl.gov.uk` centrally, once every 2 minutes, and caches
the result in memory — every screen showing a status board just reads from that
cache via its normal ~5s state poll, rather than each screen hitting TfL directly.
Works out of the box with no API key (TfL serves this unauthenticated at a lower
rate limit, plenty for one poll every 2 minutes); for a higher limit, register a
free key at <https://api-portal.tfl.gov.uk> and set it as `TFL_APP_KEY` on the hub
container. If TfL is briefly unreachable, the hub logs it and keeps serving the
last-known-good cache rather than showing nothing.

Line status is colored by TfL's own `statusSeverityDescription` text (e.g. "Good
Service", "Minor Delays"), not its numeric severity code — see
`hub/src/tflStatus.ts`'s and `pi-player/public/player.js`'s comments for why.
Line names/ids themselves are never hardcoded anywhere in this project, so a
future TfL renaming (like the 2024 London Overground split into Lioness/Mildmay/
etc.) needs no code change here — whatever the API currently reports for your
chosen modes is what renders.

## API surface

Mirrors `../src/api/client.ts`'s `SignageApiClient` method-for-method under `/api/library`,
`/api/groups`, `/api/devices`, plus two endpoints that only exist for the Pi player:

- `GET /api/player/:deviceId/state` — resolved playlist (forced → event → default),
  each item as a full URL + duration, plus the announcement ticker state.
- `POST /api/devices/:id/heartbeat` — liveness ping; a device goes `offline` after 45s
  without one.

## Local development

```bash
cd hub
npm install
npm run dev     # tsx watch, no Docker, SQLite file under hub/data/
```

The dev server does **not** serve a frontend build (there's no `web-dist` until the
Docker build stage runs it) — point the control app's dev server at it instead via
`VITE_API_BASE_URL=http://localhost:4000 npm run dev` from the repo root.
