# SignageMadeEasy — Player

Turns a Raspberry Pi 3B+ (or a generic x86_64 mini PC / HDMI compute stick — see
below) into a signage display: boots straight into fullscreen kiosk playback,
shows its IP + a pairing QR code until paired, and polls the hub (`../hub`) for
what to play. The player app itself is plain Node.js with no architecture-specific
code — the same `provision.sh` sets up either platform, detecting which one it's
running on.

No custom flashable `.img` here — building one properly (via `pi-gen`) needs a real
ARM build environment and 30–90+ minutes; this ships a provisioning script for stock
Raspberry Pi OS / Debian instead, which Raspberry Pi Imager's own customisation
options (or Debian's own installer, on x86) already cover most of the setup for.

## Flashing

**Raspberry Pi:**
1. Raspberry Pi Imager → **Raspberry Pi OS Lite (64-bit)**.
2. Click the gear icon (OS customisation) before writing:
   - Set a hostname (e.g. `signage-lobby`).
   - Enable SSH.
   - Set your Wi-Fi SSID + password.
3. Write the SD card, boot the Pi, connect HDMI + power.

**x86 mini PC / Intel HDMI stick:** install **Debian** (Bookworm or Trixie), not
Ubuntu — recent Ubuntu releases only ship Chromium as a snap, which doesn't suit a
kiosk autostart. A netinst image is fine:
1. During install, tick **SSH server** and untick every desktop-environment task —
   same idea as Raspberry Pi OS *Lite*, no desktop needed.
2. On the "software selection"/mirror step, enable the `contrib` and
   `non-free-firmware` archive components (or add them to `/etc/apt/sources.list`
   after install) — needed for Chromium's own dependencies and, on newer Intel
   iGPUs, the `i915` driver's firmware.
3. Boot it, connect HDMI + power + ethernet (or configure Wi-Fi via `nmcli`/
   `nmtui` once booted).

## Provisioning (once, over SSH)

```bash
ssh <user>@<ip-shown-during-first-boot-or-from-your-router>
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/yusufmiahav/SignageMadeEasy/main/pi-player/provision.sh)"
sudo reboot
```

Same command on both platforms — the script detects Raspberry Pi hardware and
branches the handful of steps that differ (how the boot-splash kernel command
line is set, and a couple of Pi-only hardware tweaks with no x86 equivalent).

It installs Node.js, `cage` (a minimal single-app Wayland kiosk compositor —
lighter than a full X11 desktop for exactly this one-app-fullscreen use case) and
Chromium, builds and deploys the player app to `/opt/signage/app`, sets up two
systemd services (`signage-player`, `signage-kiosk`), configures auto-login on
`tty1`, and disables console screen blanking. Re-run it after a `git pull` to
redeploy player updates — it's idempotent. On an x86 stick, Chromium's own
hardware video decode (VAAPI) is used instead of the Pi's software-decode
workaround — see the boot splash section below for why those differ.

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
  control app's Schedule screen), video to its natural end, PDF pages 8s each
  (rendered client-side with a vendored copy of `pdf.js`, not a CDN — the Pi only
  needs the LAN to reach the hub, nothing here should require internet access), and
  a live clock (current time of day on a black background, no file involved) for
  its own configured duration same as an image. A video that's the sole item in the
  active playlist (forced content, or a playlist/event with just one video)
  restarts itself in place instead of reloading via the rotation logic, so it plays
  seamlessly with no reload between passes. An announcement, if one's turned on for
  this device, overlays as a ticker regardless of what's in rotation.
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

**Raspberry Pi only.** Also on the setup page, a "Performance" toggle caps the ARM
clock to 1200MHz (`arm_freq` in `/boot/config.txt`/`/boot/firmware/config.txt`) to
run cooler on a bare Pi 3B+ with no heatsink, at the cost of some CPU headroom.
Only takes effect on reboot — the page shows a "Reboot required" prompt with a
one-click reboot button whenever the on-disk setting and what's actually running at
the moment disagree. Check `vcgencmd get_throttled` and `vcgencmd measure_temp`
before and after to see whether it actually helped your specific setup. On an x86
stick `provision.sh` skips installing this entirely (no `arm_freq` equivalent, and
not a hardware constraint that hardware has) — toggling it there just reports an
error rather than crashing anything.

## Boot splash

Raw kernel/systemd boot text is replaced with a plain black screen, the
"SignageMadeEasy" wordmark, and a small spinner in the corner (`assets/plymouth/`) —
installed as a Plymouth theme and set as default automatically by `provision.sh`,
with `splash quiet` added to the kernel command line so the console text is actually
suppressed rather than just shown behind the splash. Confirmed working on real
hardware. On a Raspberry Pi that command line lives in `/boot/firmware/cmdline.txt`
(a flat, single-line file); on an x86 stick there's no such file — it comes from
`/etc/default/grub`'s `GRUB_CMDLINE_LINUX_DEFAULT`, baked into `/boot/grub/grub.cfg`
by `update-grub`, which `provision.sh` runs automatically after editing it.

**If it doesn't show up after provisioning + a reboot**, the most likely cause is a
device that was provisioned before this fix existed: `provision.sh` also strips
`console=serial0,...` (or `ttyS0`/`ttyAMA0`) from the kernel command line —
Plymouth silently falls back to plain boot text whenever a serial console is present
alongside the real HDMI one, regardless of theme setup, and that fallback isn't
something the theme config can override. Fix: `git pull` on the device (or re-run
the one-liner from [Provisioning](#provisioning-once-over-ssh)) to make sure it has
the current `provision.sh`, re-run it, then reboot. If it still doesn't appear,
check whether the serial console actually got removed — **Raspberry Pi:**

```bash
cat /boot/firmware/cmdline.txt   # should NOT contain console=serial0/ttyS0/ttyAMA0
```

If it's still there, strip it manually and reboot once more:

```bash
sudo sed -i -E 's/console=(serial0|ttyS0|ttyAMA0)(,[0-9]+)?[[:space:]]*//g; s/[[:space:]]+/ /g; s/^[[:space:]]+//; s/[[:space:]]+$//' /boot/firmware/cmdline.txt
sudo reboot
```

**x86 stick:**

```bash
cat /etc/default/grub | grep GRUB_CMDLINE_LINUX_DEFAULT   # should NOT contain console=ttyS0/serial0
```

If it's still there, strip it manually, regenerate GRUB's config, and reboot:

```bash
sudo sed -i -E 's/console=(ttyS[0-9]+|serial0)(,[0-9]+)?[[:space:]]*//g' /etc/default/grub
sudo update-grub
sudo reboot
```

To revert the splash entirely back to plain console text — **Raspberry Pi:**

```bash
sudo plymouth-set-default-theme pix -R   # or whatever theme `plymouth-set-default-theme --list` shows was default before
sudo sed -i 's/ splash quiet//' /boot/firmware/cmdline.txt   # or /boot/cmdline.txt
sudo reboot
```

**x86 stick:**

```bash
sudo plymouth-set-default-theme pix -R   # or whatever theme `plymouth-set-default-theme --list` shows was default before
sudo sed -i 's/ splash quiet//' /etc/default/grub
sudo update-grub
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
