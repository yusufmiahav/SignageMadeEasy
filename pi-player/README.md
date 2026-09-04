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

It installs Node.js, `sway` (a wlroots-based Wayland compositor, run here in a
minimal single-app kiosk configuration — see `sway-kiosk.config` — lighter than a
full desktop for exactly this one-app-fullscreen use case) and Chromium, builds and
deploys the player app to `/opt/signage/app`, sets up two systemd services
(`signage-player`, `signage-kiosk`), configures auto-login on
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
- **`signage-kiosk.service`** — `sway` (configured via `sway-kiosk.config` for a
  single fullscreen app with no cursor, no bar, no window chrome) launching
  Chromium in kiosk mode pointed at `http://localhost:8088`.
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

## Cursor

The kiosk display shows no visible mouse cursor. This used to run on `cage`, a
minimal Wayland compositor with no cursor-management API at all — cage's own
maintainers confirmed hiding it isn't something they support, and every
workaround tried (a transparent Xcursor theme, warping the cursor off-screen
with synthetic input) either had no effect or only relocated a still-visible
cursor to a screen corner, confirmed on real Pi and x86 hardware. Switching to
`sway` (still a minimal wlroots-based compositor, just one with an actual
cursor API) fixed it properly: `sway-kiosk.config`'s `seat seat0 hide_cursor
100` genuinely hides the cursor after 100ms of inactivity — trivially true on a
kiosk with no real mouse ever attached, so it's hidden almost immediately after
boot and stays that way.

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

## NDI live sources (Raspberry Pi 4/5 or an x86 mini PC/stick)

A Pi 4/5 or an x86_64 mini PC/HDMI stick (not a Pi 3B+ — this needs more headroom
than that has) can display a live **NDI** (Network Device Interface) video feed — a
camera, an encoder, another computer's NDI output — as one item in the normal
rotation, alongside images/video/PDF/clock. This is NDI-**in** (receiving), not
NDI-out. Nothing about the actual receiving/rendering code is Pi-specific — it's
just GStreamer + whatever Wayland socket the kiosk compositor exposes — so an x86
stick works the same way, and the NDI SDK itself ships an `x86_64-linux-gnu` build
alongside its ARM ones.

**The hub never touches the actual video stream.** Adding an NDI source from the
control app only saves one short string, the NDI source name — the real video flows
directly over the LAN from the NDI source device to this device's own receiver
process, completely bypassing the hub. Practically, that means **this device and the
NDI source need to be reachable from each other via NDI's own discovery**, which is
mDNS-based and doesn't cross subnets without a separate NDI Discovery Server —
generally, put them on the same LAN segment/VLAN.

### One-time setup: building gst-plugin-ndi and the discovery helper

`provision.sh` installs GStreamer's own packages automatically on any device capable
of NDI (a Pi 4/5 or an x86 stick — not a Pi 3B+), but the actual NDI support — the
`ndisrc` GStreamer element and this project's small discovery helper
(`pi-player/native/ndi-find.c`) — needs the proprietary **NDI SDK for Linux**, which
can't be downloaded automatically: Vizrt's EULA requires a human to accept it first.
Confirmed working end-to-end on real Pi 5 hardware (64-bit Raspberry Pi OS) with
these exact steps; an x86 stick follows the same steps, just using the SDK's
`x86_64-linux-gnu` folder instead of the ARM one (called out below).

1. Go to <https://ndi.video/for-developers/ndi-sdk/>, accept the EULA, and download
   the **NDI SDK for Linux** (a `.tar.gz`). Get it onto the device (`scp` from your
   computer works fine — remember the `:` before the remote path, e.g.
   `scp Install_NDI_SDK_v6_Linux.tar.gz user@device-ip:~/`), then extract it:
   ```bash
   tar xzf Install_NDI_SDK_v6_Linux.tar.gz
   ```
   This unpacks straight into a `NDI SDK for Linux/` folder with `include/` and
   per-architecture `lib/`/`bin/` subfolders — no separate installer script to run.
   A Pi 4 or 5 (64-bit) uses the `aarch64-rpi4-linux-gnueabi` folder; an x86_64
   stick uses `x86_64-linux-gnu`.

2. Install the SDK's shared library where the system linker will find it (`-a`
   preserves the `libndi.so` → `libndi.so.6` → `libndi.so.6.x.x` symlink chain) —
   substitute `x86_64-linux-gnu` for the folder name below on an x86 stick:
   ```bash
   sudo cp -a ~/"NDI SDK for Linux/lib/aarch64-rpi4-linux-gnueabi/"libndi.so* /usr/local/lib/
   sudo ldconfig
   ldconfig -p | grep ndi   # should list libndi.so.6 resolving under /usr/local/lib
   ```

3. Build [`gst-plugin-ndi`](https://github.com/teltek/gst-plugin-ndi) (the community
   GStreamer NDI plugin, written in Rust — needs `cargo`, installed via
   <https://rustup.rs> if it isn't already). It only needs `libndi` linkable from
   step 2 above, not the SDK headers:
   ```bash
   git clone https://github.com/teltek/gst-plugin-ndi.git
   cd gst-plugin-ndi
   cargo build --release
   ```
   Install the resulting plugin into GStreamer's real plugin directory (rather than
   relying on `GST_PLUGIN_PATH`, which the systemd service won't have set):
   ```bash
   GST_PLUGINS_DIR=$(pkg-config --variable=pluginsdir gstreamer-1.0)
   sudo install -o root -g root -m 644 target/release/libgstndi.so "$GST_PLUGINS_DIR"
   sudo ldconfig
   rm -rf ~/.cache/gstreamer-1.0   # otherwise a previously-cached load failure can stick
   gst-inspect-1.0 ndisrc          # should show the ndisrc element details
   ```

4. Build the discovery helper from this repo (`pi-player/native/`) — this one *does*
   need the SDK's headers, since it's a small C program calling the NDI API directly:
   ```bash
   cd ~/SignageMadeEasy/pi-player/native   # wherever this repo is checked out on the Pi
   make NDI_INCLUDE="$HOME/NDI SDK for Linux/include"
   sudo make install
   ```
   Installs to `/opt/signage/bin/ndi-find` (override with `PREFIX=...` at build time,
   or the `SIGNAGE_NDI_FIND_BIN` env var on `signage-player.service` at runtime, if
   you'd rather put it somewhere else). Test it directly — it should print any
   currently-broadcasting NDI source names, one per line, after a few seconds:
   ```bash
   /opt/signage/bin/ndi-find
   ```

5. Re-run `provision.sh` (or just check manually) — it probes for both of these on a
   Pi 4/5 or x86 device and prints a reminder if either is still missing, but doesn't
   fail the rest of provisioning if they are.

### Adding an NDI source from the control app

Library screen → **Add NDI source**. Either:
- Pick a paired device (a Pi 4/5 or x86 stick) and click **Scan for sources** — this
  asks that device to run its own NDI discovery (a few seconds) and lists whatever it
  finds, or
- Type the NDI source name in manually (its exact NDI network name, e.g.
  `DESKTOP-ABC (Camera 1)`) — useful if the source isn't broadcasting yet, or no
  NDI-capable device is paired/reachable right now.

Add it to a playlist/event like any other content — it plays full-screen for its
configured duration (same "Plays for Ns" control as images/clocks) before rotating to
the next item. If the named source isn't currently reachable, the screen just holds
on the last frame it had (or a black screen if it never connected) until it is.

## Local development / testing (not on real Pi hardware)

```bash
cd pi-player
npm install
SIGNAGE_CONFIG_PATH=./dev-config.json PORT=8088 npm run dev
```

Open `http://localhost:8088` in a browser — behaves exactly like the kiosk view
(minus `sway`/Chromium's actual fullscreen kiosk chrome). Point it at a hub running
locally by `POST`ing to `/configure` with a real `deviceId` from that hub.
