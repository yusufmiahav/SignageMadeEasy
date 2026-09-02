# SignageMadeEasy — Raspberry Pi Player

Turns a Raspberry Pi 3B+ into a signage display: boots straight into fullscreen
kiosk playback, shows its IP + a pairing QR code until paired, and polls the hub
(`../hub`) for what to play.

No custom flashable `.img` here — building one properly (via `pi-gen`) needs a real
ARM build environment and 30–90+ minutes; this ships a provisioning script for stock
Raspberry Pi OS instead, which Raspberry Pi Imager's own customisation options
already cover most of the setup for.

## Flashing

1. Raspberry Pi Imager → **Raspberry Pi OS Lite (64-bit)**.
2. Click the gear icon (OS customisation) before writing:
   - Set a hostname (e.g. `signage-lobby`).
   - Enable SSH.
   - Set your Wi-Fi SSID + password.
3. Write the SD card, boot the Pi, connect HDMI + power.

## Provisioning (once, over SSH)

```bash
ssh pi@<ip-shown-during-first-boot-or-from-your-router>
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/yusufmiahav/SignageMadeEasy/main/pi-player/provision.sh)"
sudo reboot
```

This installs Node.js, `cage` (a minimal single-app Wayland kiosk compositor —
lighter than a full X11 desktop for exactly this one-app-fullscreen use case) and
Chromium, builds and deploys the player app to `/opt/signage/app`, sets up two
systemd services (`signage-player`, `signage-kiosk`), configures auto-login on
`tty1`, and disables console screen blanking. Re-run it after a `git pull` to
redeploy player updates — it's idempotent.

After reboot the display shows its **IP address and a QR code**. Pair it from the
control app (Home or Settings → "Add a screen") via Scan network, Scan QR, or Enter
IP — any of those has the hub reach the Pi directly to finish pairing.

## How it works

- **`signage-player.service`** — a small Node/Express process on port 8088.
  Persists pairing state to `/opt/signage/config.json`. Polls the hub for content
  every ~5s once paired, keeping the last-known-good state so playback keeps
  looping through a brief network/hub outage. Exposes `/identify`, `/configure`,
  `/restart` for the hub to call directly, and a local `/state` the player page polls.
- **Media caching** (`src/mediaCache.ts`) — every playlist item gets downloaded once
  to `/opt/signage/cache` and served from there afterward, so steady-state playback
  reads off the SD card instead of re-fetching from the hub over the LAN on every
  rotation — smoother video in particular, since it's no longer subject to WiFi
  jitter mid-playback. Downloads happen in the background after each poll; playback
  falls back to the hub's own URL for anything not cached yet, so it never blocks.
- **`signage-kiosk.service`** — `cage` launching Chromium in kiosk mode pointed at
  `http://localhost:8088`.
- **The player page** (`public/`) — hard-cuts between playlist items (no crossfade):
  images for their configured duration (8s by default, editable per-image from the
  control app's Schedule screen), PDF pages 8s each (rendered client-side with a
  vendored copy of `pdf.js`, not a CDN — the Pi only needs the LAN to reach the hub,
  nothing here should require internet access), and a live clock (current time of
  day on a black background, no file involved) for its own configured duration same
  as an image. An announcement, if one's turned on for this device, overlays as a
  ticker regardless of what's in rotation.
- **Video playback** (`src/mpvPlayer.ts`) — video runs through `mpv` as a separate
  process, hardware-decoded, rather than an in-page `<video>` element. Chromium's own
  hardware video decode was tried first and confirmed on real hardware to silently
  stall mid-video at a fixed point every time (see `signage-kiosk.service`'s
  `--disable-accelerated-video-decode`, kept for documentation even though Chromium
  no longer plays video at all) — mpv uses the same underlying V4L2 decoder, so that
  risk isn't gone, just mitigated: a watchdog kills and restarts mpv if its reported
  playback position ever stops advancing, and `SIGNAGE_MPV_HWDEC=no` (set as an
  `Environment=` line in `signage-player.service` and restart the service — no
  redeploy needed) forces software decode if hardware decode turns out to be
  unreliable on a given Pi. mpv connects to the same Wayland compositor socket cage
  already runs for Chromium and paints its own fullscreen surface on top of it,
  discovered fresh at each launch rather than assumed at a fixed path (see
  `mpvPlayer.ts`'s `findWaylandDisplay`) since the player agent and kiosk are
  separate services that can start in either order. **Not yet confirmed on real
  hardware** — verified in this project's sandbox as far as an environment with no
  real Pi/Wayland/mpv can go (route wiring, the display-discovery timeout/fallback
  path, and the IPC reply-parsing logic against a fake mpv socket); the actual
  hardware-decode behavior, the cage-stacking assumption, and the watchdog's
  real-world timing all need a real device to confirm.
- **Wi-Fi fallback hotspot** (`src/wifiManager.ts`) — if this Pi has no working
  network connection at all (no ethernet, no associated Wi-Fi — not just "can't
  reach the hub", which this can't fix anyway) for about a minute, it broadcasts
  its own Wi-Fi network so a technician can configure it from a phone with no
  SSH or laptop needed. The kiosk screen itself shows the network name, password,
  and the address to visit — nothing to look up in documentation. See
  "Configuring Wi-Fi in the field" below.

## Configuring Wi-Fi in the field (no SSH needed)

If a Pi loses its Wi-Fi connection for about a minute, its screen switches to
showing:
- A Wi-Fi network name to join from a phone (`SignageSetup-<hostname>`)
- Its password
- A web address to open in a browser once joined

Follow what the screen says, fill in the real network's name and password on
that page, and submit. The Pi attempts to connect immediately; on success the
kiosk resumes normally within moments. On failure (wrong password, out of
range) the fallback network stays up so you can just try again.

## Local content fail-safe (no hub connection needed)

That same setup page (`http://<pi-ip>:8088/network-setup.html`) has a "Local
content" section below the Wi-Fi form — reachable any time the Pi has *some*
network path to it, not just while it's broadcasting its own fallback hotspot.
Upload a single image, video, or PDF there and it plays full-screen, looping,
whenever this Pi has nothing usable from the hub: never paired yet, hub down,
wrong hub address, hub not deployed at all. The unpaired and "waiting for the
hub" screens also print that same URL as a hint, so the option is discoverable
without already knowing it exists.

It's a one-file stand-in, not a second content library — a new upload replaces
whatever was there before, and "Clear local content" removes it. The instant
the hub has real content to serve again, the player switches back to it
automatically; local content never needs to be manually turned off.

## Static IP or DHCP

Same setup page, an "IP address" section: DHCP (the default) or a static
IP/gateway/DNS for whichever connection — ethernet or Wi-Fi — currently holds
this Pi's default route. Applies immediately via `nmcli`, which can drop the
page's own connection mid-request if you're viewing it over the same network
being reconfigured — that's expected; reload at the new address if you set one.

## Performance: running without a heatsink

Also on the setup page, a "Performance" toggle caps the ARM clock to 1200MHz
(`arm_freq` in `/boot/config.txt`/`/boot/firmware/config.txt`) to run cooler on
a bare Pi 3B+ with no heatsink, at the cost of some CPU headroom. Only takes
effect on reboot — the page shows a "Reboot required" prompt with a one-click
reboot button whenever the on-disk setting and what's actually running at the
moment disagree. Check `vcgencmd get_throttled` and `vcgencmd measure_temp`
before and after to see whether it actually helped your specific setup.

## Boot splash

Raw kernel/systemd boot text is replaced with a plain white screen, the
"SignageMadeEasy" wordmark, and a small spinner in the corner (`assets/plymouth/`) —
installed as a Plymouth theme and set as default automatically by `provision.sh`,
with `splash quiet` added to the kernel command line so the console text is actually
suppressed rather than just shown behind the splash. Its syntax was checked against
real, working Plymouth themes, but **this hasn't been confirmed on real hardware** —
there's no way to render a boot splash in a sandbox with no kernel framebuffer. If it
looks wrong, doesn't appear, or (worse) affects boot reliability, revert with:

```bash
sudo plymouth-set-default-theme pix -R   # or whatever theme `plymouth-set-default-theme --list` shows was default before
sudo sed -i 's/ splash quiet//' /boot/firmware/cmdline.txt   # or /boot/cmdline.txt
sudo reboot
```

## Local development / testing (not on real Pi hardware)

```bash
cd pi-player
npm install
SIGNAGE_CONFIG_PATH=./dev-config.json PORT=8088 npm run dev
```

Open `http://localhost:8088` in a browser — behaves exactly like the kiosk view
(minus `cage`/Chromium's actual fullscreen kiosk chrome). Point it at a hub running
locally by `POST`ing to `/configure` with a real `deviceId` from that hub.
