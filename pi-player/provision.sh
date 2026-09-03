#!/usr/bin/env bash
# SignageMadeEasy player provisioning script — run ONCE, as root, over SSH, on
# either a freshly flashed Raspberry Pi OS Lite (64-bit, Bookworm or newer) or a
# freshly installed Debian (Bookworm/Trixie) x86_64 machine — e.g. an Intel HDMI
# compute stick. Idempotent: safe to re-run after a git pull to pick up player
# updates. The player app itself (pi-player/src) is plain Node.js with zero native
# or architecture-specific dependencies — the only parts of this script that differ
# by platform are how the boot-splash kernel command line is set (Raspberry Pi's
# flat cmdline.txt vs. GRUB on a generic PC) and a couple of Pi-only hardware
# tweaks (arm_freq underclock, forcing HDMI audio) that have no x86 equivalent —
# branched inline below via $IS_PI rather than as a separate script, so a fix to
# the ~90% that's shared never has to be applied twice.
#
# x86 note: use Debian, not Ubuntu — recent Ubuntu releases only ship Chromium as
# a snap, which complicates a kiosk autostart (confinement, unpredictable binary
# path/timing) in a way a native .deb doesn't. Enable the `contrib` and
# `non-free-firmware` components in /etc/apt/sources.list (or tick them during
# install) — plain `main` alone isn't enough for every Chromium dependency, and
# newer Intel iGPUs need non-free-firmware for reliable display/hardware video
# decode via the i915 driver.
#
# Before this: flash/install the OS —
#   - Raspberry Pi: flash with Raspberry Pi Imager, using its own gear-icon "OS
#     customisation" dialog to set hostname, enable SSH, and set your Wi-Fi
#     SSID/password — none of that is this script's job.
#   - x86 stick: install Debian (netinst is fine) with an SSH server and no
#     desktop environment, same idea as "Lite" on the Pi.
#
#   ssh pi@<ip-shown-on-first-boot>
#   sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/<branch>/pi-player/provision.sh)"
# or, if you've already cloned the repo onto the device:
#   sudo ./pi-player/provision.sh

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run as root (sudo)." >&2
  exit 1
fi

REPO_URL="${SIGNAGE_REPO_URL:-https://github.com/yusufmiahav/SignageMadeEasy.git}"
INSTALL_DIR=/opt/signage
APP_DIR="$INSTALL_DIR/app"
SIGNAGE_USER=signage

log() { echo -e "\n==> $*"; }

# /proc/device-tree/model exists on real Raspberry Pi hardware regardless of which
# OS is installed on it — a more reliable check than `uname -m` (arm64 also covers
# other ARM boards, and this project doesn't try to support those) or os-release
# (Raspberry Pi OS is just Debian under the hood, so its own os-release doesn't
# say "raspberry" anywhere).
IS_PI=0
if [[ -f /proc/device-tree/model ]] && grep -qi 'raspberry pi' /proc/device-tree/model 2>/dev/null; then
  IS_PI=1
fi

# Distinct from IS_PI above — a Pi 4/5 has enough headroom for the NDI-in feature
# (native GStreamer + gst-plugin-ndi, see pi-player/src/ndiPlayer.ts and README.md),
# which a 3B+ isn't targeted for. A plain 32-bit "Raspberry Pi 4" board string and a
# 64-bit one both match this the same way IS_PI's own check does.
IS_PI4_5=0
if [[ -f /proc/device-tree/model ]] && grep -qiE 'raspberry pi (4|5)' /proc/device-tree/model 2>/dev/null; then
  IS_PI4_5=1
fi

# ---------------------------------------------------------------------------
log "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends \
  cage curl ca-certificates git rsync plymouth plymouth-themes network-manager

# ydotool/ydotoold (used to warp the cursor off-screen — see signage-kiosk.service,
# the part actually confirmed on real hardware to hide it) aren't in every
# release's default repo — e.g. Raspberry Pi OS Trixie only has them in
# trixie-backports. Best-effort and isolated from the required packages above on
# purpose: this failing must never take the rest of provisioning down with it
# (that's exactly what happened before this was split out — one missing package
# killed the whole script via set -euo pipefail before it ever reached anything
# else, the same failure mode as the earlier git-ownership bug).
#
# Package name varies by architecture too, confirmed on real hardware: on
# Raspberry Pi OS's 32-bit (armhf) build, `ydotoold` isn't an installable
# package at all — `ydotool` alone bundles both the client and the daemon —
# whereas other architectures split them into two separate packages. Try the
# two-package form first, fall back to the single-package form, and verify
# with the actual binary rather than trusting either apt-get call's exit code
# alone, since apt-get can succeed while still not providing what we need.
try_install_ydotool() {
  apt-get install -y --no-install-recommends "$@" ydotool ydotoold 2>/dev/null || \
  apt-get install -y --no-install-recommends "$@" ydotool 2>/dev/null
}

HAVE_YDOTOOL=0
if try_install_ydotool && command -v ydotoold >/dev/null 2>&1; then
  HAVE_YDOTOOL=1
elif [[ -f /etc/os-release ]] && grep -q '^VERSION_CODENAME=trixie' /etc/os-release; then
  BACKPORTS_LIST=/etc/apt/sources.list.d/trixie-backports.list
  if [[ ! -f "$BACKPORTS_LIST" ]]; then
    echo "deb http://deb.debian.org/debian trixie-backports main" > "$BACKPORTS_LIST"
  fi
  # Pinned to trixie-backports specifically (-t) so this doesn't pull anything
  # else up from backports as a side effect — only touches these two packages.
  if apt-get update 2>/dev/null && \
     try_install_ydotool -t trixie-backports && command -v ydotoold >/dev/null 2>&1; then
    HAVE_YDOTOOL=1
  fi
fi
if [[ "$HAVE_YDOTOOL" -eq 0 ]]; then
  echo "ydotool/ydotoold not available — skipping the cursor off-screen warp (the" >&2
  echo "XCURSOR_THEME/XCURSOR_SIZE attempt still applies, but wasn't confirmed" >&2
  echo "sufficient on its own — see signage-kiosk.service)." >&2
fi

# Package name for Chromium differs across Raspberry Pi OS releases.
if apt-cache show chromium >/dev/null 2>&1; then
  CHROMIUM_PKG=chromium
else
  CHROMIUM_PKG=chromium-browser
fi
apt-get install -y --no-install-recommends "$CHROMIUM_PKG"
CHROMIUM_BIN="$(command -v chromium || command -v chromium-browser)"

# ---------------------------------------------------------------------------
log "Installing Node.js (skipping if a recent-enough version is already present)"
NEED_NODE=1
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -e 'console.log(process.versions.node.split(".")[0])')"
  [[ "$NODE_MAJOR" -ge 20 ]] && NEED_NODE=0
fi
if [[ "$NEED_NODE" -eq 1 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# ---------------------------------------------------------------------------
log "Creating the $SIGNAGE_USER user"
if ! id "$SIGNAGE_USER" >/dev/null 2>&1; then
  useradd --system --create-home --shell /usr/sbin/nologin \
    --groups video,render,input,tty "$SIGNAGE_USER"
fi

# ---------------------------------------------------------------------------
log "Enabling linger for $SIGNAGE_USER"
# Root cause of a real-hardware crash-loop confirmed via journalctl: cage
# failed with "XDG_RUNTIME_DIR is not set" on the first 2-3 boot attempts,
# self-healing only because Restart=always kept buying time. An After=
# ordering on systemd-logind.service/dbus.service alone wasn't enough — that
# unit being "active" doesn't mean logind has finished registering *this*
# session yet, and the existing ExecStartPre bus-socket check in
# signage-kiosk.service can pass instantly by observing its own just-opened
# session rather than actually waiting for one. Linger sidesteps the race
# entirely instead of trying to win it: it tells logind to create
# /run/user/<uid> (and its D-Bus session bus) at boot, before any login
# session exists at all, so it's already there and stable by the time
# signage-kiosk.service starts. Idempotent — enabling linger for an
# already-lingering user is a harmless no-op.
loginctl enable-linger "$SIGNAGE_USER"

# ---------------------------------------------------------------------------
log "Granting $SIGNAGE_USER passwordless nmcli access (Wi-Fi fallback hotspot — see pi-player/src/wifiManager.ts)"
# The player agent runs as $SIGNAGE_USER, not root, but reconfiguring Wi-Fi
# (starting a fallback hotspot, connecting to a newly-entered network) needs
# root/NetworkManager privileges nmcli doesn't grant to arbitrary local users by
# default on a headless install. Validated with visudo before being installed —
# a broken sudoers.d file is the kind of mistake that can break sudo system-wide,
# not something to risk on `set -euo pipefail` alone catching a typo.
SUDOERS_TMP="$(mktemp)"
echo "$SIGNAGE_USER ALL=(root) NOPASSWD: /usr/bin/nmcli" > "$SUDOERS_TMP"
if visudo -c -f "$SUDOERS_TMP" >/dev/null 2>&1; then
  install -m 440 "$SUDOERS_TMP" /etc/sudoers.d/signage-nmcli
else
  echo "Generated nmcli sudoers rule failed validation — skipping. The Wi-Fi" >&2
  echo "fallback hotspot won't be able to reconfigure networking without it." >&2
fi
rm -f "$SUDOERS_TMP"

# ---------------------------------------------------------------------------
log "Fetching SignageMadeEasy"
mkdir -p "$INSTALL_DIR"
if [[ -d "$INSTALL_DIR/src/.git" ]]; then
  # A pre-fix version of this script recursively chowned all of $INSTALL_DIR
  # (src/ included) to $SIGNAGE_USER. That's since been narrowed below to leave
  # src/ root-owned, but that narrowing can't undo ownership a Pi already picked
  # up from an earlier bad run — and root's own `git pull` trips the same
  # dubious-ownership safety check any other mismatched user would, permanently
  # wedging every future re-run at this exact step (confirmed on real hardware:
  # the checkout stayed on a commit from months earlier despite repeated
  # re-provisioning). Both lines are idempotent and harmless when ownership is
  # already correct, so they run unconditionally rather than only when something
  # looks wrong.
  chown -R root:root "$INSTALL_DIR/src"
  if ! git config --global --get-all safe.directory | grep -qx "$INSTALL_DIR/src"; then
    git config --global --add safe.directory "$INSTALL_DIR/src"
  fi
  git -C "$INSTALL_DIR/src" pull --ff-only
elif [[ -f "$(dirname "$0")/../pi-player/package.json" ]]; then
  # Already running from inside a checkout — use it directly rather than re-cloning.
  ln -sfn "$(cd "$(dirname "$0")/.." && pwd)" "$INSTALL_DIR/src"
else
  # --depth implies --single-branch unless told otherwise: without --no-single-branch
  # here, this clone only ever tracks whatever branch was checked out at clone time,
  # and a later `git fetch origin` + `git checkout <other-branch>` fails outright with
  # "pathspec did not match any file(s) known to git" since the remote branch was
  # never fetchable at all — confirmed on a real Pi trying to switch onto a different
  # branch after being provisioned once already.
  git clone --depth 1 --no-single-branch "$REPO_URL" "$INSTALL_DIR/src"
fi

log "Building the player app"
rsync -a --delete \
  --exclude node_modules --exclude dist \
  "$INSTALL_DIR/src/pi-player/" "$APP_DIR/"
cd "$APP_DIR"
npm install
npm run build
# Non-recursive on $INSTALL_DIR: it also contains src/, the git checkout used to
# pull updates on every re-run (see "Fetching SignageMadeEasy" above). Recursively
# chowning it away from root broke that pull on the second run onward — root
# running `git pull` on a repo it no longer owns trips git's dubious-ownership
# check and the whole script (set -euo pipefail) died right there, silently
# skipping every step after it, including reinstalling the systemd units.
chown "$SIGNAGE_USER:$SIGNAGE_USER" "$INSTALL_DIR"
chown -R "$SIGNAGE_USER:$SIGNAGE_USER" "$APP_DIR"

# ---------------------------------------------------------------------------
# arm_freq (see pi-player/src/underclock.ts) only exists on Raspberry Pi firmware —
# an x86 stick has no equivalent knob here, and doesn't need one: it's not a bare
# board with no heatsink the way a Pi 3B+ can be. The underclock toggle on the
# local setup page still degrades gracefully without this (app.ts's /underclock
# route already catches the missing-script error and reports it to the page,
# rather than crashing) — this just skips installing something that would never
# be usable on this hardware.
if [[ "$IS_PI" -eq 1 ]]; then
  log "Installing the underclock toggle script (root-owned — see pi-player/src/underclock.ts)"
  # Deliberately NOT under $APP_DIR: that whole tree is chowned to $SIGNAGE_USER
  # above, and $SIGNAGE_USER can invoke this script via the sudoers grant below —
  # if $SIGNAGE_USER could also edit the script it runs as root, that grant would
  # be a straight path to arbitrary root access instead of the one fixed on/off
  # toggle it's meant to be.
  mkdir -p /opt/signage/bin
  install -m 755 -o root -g root "$INSTALL_DIR/src/pi-player/bin/set-underclock.sh" /opt/signage/bin/set-underclock.sh
fi

# ---------------------------------------------------------------------------
if [[ "$IS_PI" -eq 1 ]]; then
  log "Granting $SIGNAGE_USER passwordless access to the underclock script and reboot"
else
  log "Granting $SIGNAGE_USER passwordless access to reboot"
fi
# Same reasoning and same visudo-validate-before-install pattern as the nmcli grant
# above: narrow, specific, fixed commands only — never a blanket NOPASSWD:ALL.
# reboot's real path varies across OS releases (merged-/usr or not) — resolved
# here rather than hardcoded, same as $CHROMIUM_BIN above. The reboot grant itself
# isn't underclock-specific — the local setup page's static-IP/Wi-Fi flows use it
# too — so it's unconditional even on hardware with no underclock toggle to grant.
REBOOT_BIN="$(command -v reboot)"
SUDOERS_TMP="$(mktemp)"
{
  if [[ "$IS_PI" -eq 1 ]]; then
    echo "$SIGNAGE_USER ALL=(root) NOPASSWD: /opt/signage/bin/set-underclock.sh"
  fi
  echo "$SIGNAGE_USER ALL=(root) NOPASSWD: $REBOOT_BIN"
} > "$SUDOERS_TMP"
if visudo -c -f "$SUDOERS_TMP" >/dev/null 2>&1; then
  install -m 440 "$SUDOERS_TMP" /etc/sudoers.d/signage-underclock
else
  echo "Generated underclock/reboot sudoers rule failed validation — skipping. The" >&2
  echo "underclock toggle (if applicable) and reboot-from-the-setup-page won't work without it." >&2
fi
rm -f "$SUDOERS_TMP"

# ---------------------------------------------------------------------------
log "Installing a blank cursor theme"
# cage always draws *a* cursor with no direct API to suppress it — but it does
# receive XCURSOR_THEME/XCURSOR_SIZE (confirmed via /proc/<pid>/environ on real
# hardware): the cursor it draws is just a normal Xcursor theme lookup at a
# given size. Pointing XCURSOR_THEME at a fully transparent theme genuinely
# hides it, PROVIDED XCURSOR_SIZE is a real size — see signage-kiosk.service
# for why it must not be 0.
SIGNAGE_HOME="$(getent passwd "$SIGNAGE_USER" | cut -d: -f6)"
CURSOR_DIR="$SIGNAGE_HOME/.icons/blank/cursors"
mkdir -p "$CURSOR_DIR"
cp "$APP_DIR/assets/blank-cursor" "$CURSOR_DIR/left_ptr"
ln -sf left_ptr "$CURSOR_DIR/default"
cat > "$SIGNAGE_HOME/.icons/blank/index.theme" <<'EOF'
[Icon Theme]
Name=blank
EOF
chown -R "$SIGNAGE_USER:$SIGNAGE_USER" "$SIGNAGE_HOME/.icons"

# ---------------------------------------------------------------------------
log "Installing the SignageMadeEasy boot splash (Plymouth)"
# Replaces the raw kernel/systemd boot text with a plain black screen, wordmark, and
# small corner spinner — see assets/plymouth/signagemadeeasy.script. Its syntax was
# checked against real, working Plymouth themes, but this sandbox has no way to
# actually render a boot splash (no kernel framebuffer/DRM to test against), so this
# still needs a real-hardware look before trusting it fully. Wrapped so a failure
# here (initramfs tooling issue, disk space, etc.) can't take the rest of
# provisioning down with it — same reasoning as the ydotool install above.
mkdir -p /usr/share/plymouth/themes/signagemadeeasy
cp "$APP_DIR/assets/plymouth/signagemadeeasy.plymouth" /usr/share/plymouth/themes/signagemadeeasy/
cp "$APP_DIR/assets/plymouth/signagemadeeasy.script" /usr/share/plymouth/themes/signagemadeeasy/
# `-R` both sets the theme and rebuilds the initramfs to include it in one step. On
# a Pi whose /boot partition has filled up from repeated re-provisioning (old kernels/
# initramfs images accumulating on the small FAT boot partition), that rebuild can
# fail — confirmed as the actual difference between a correctly-configured Pi and one
# that still shows plain boot text: everything below here used to be gated on `-R`
# succeeding, so a failed rebuild silently skipped the serial-console fix too (see
# that fix's own comment below) even though the two are unrelated. Falls back to
# setting the theme without a rebuild, then rebuilding separately, so a
# rebuild-specific failure is at least visible instead of masking the working
# theme-selection call.
if plymouth-set-default-theme signagemadeeasy -R; then
  :
elif plymouth-set-default-theme signagemadeeasy && update-initramfs -u; then
  :
else
  echo "Could not set/rebuild the boot splash theme — continuing anyway. The kiosk" >&2
  echo "itself is unaffected; boot may show default console text instead of the logo." >&2
fi

# Kernel command line: `splash quiet` (show the theme, suppress raw console text),
# `consoleblank=0` (see "Disabling console screen blanking" below — folded in here
# since it's the exact same file/mechanism), and stripping any serial console.
#
# Real root cause of the serial-console strip, confirmed via
# /var/log/plymouth-debug.log on real Pi hardware (plymouth.debug=file:... added
# as a one-off diagnostic, then removed again): every other prerequisite was
# individually correct — theme installed, set as default, splash+quiet present —
# yet Plymouth never loaded our theme at all. The log showed why: "console
# /dev/ttyS0 found!" then "serial consoles detected, managing them with details
# forced" — Plymouth hardcodes a fallback to its plain-text "details" plugin
# (exactly the "[ OK ] Starting..." boot-log text this was meant to hide) whenever
# a serial console is present alongside the real HDMI one, regardless of theme
# config — not something plymouthd.conf can override. Raspberry Pi OS's default
# cmdline.txt sets both `console=serial0,...` (or ttyS0/ttyAMA0) and
# `console=tty1` together; trades away UART-cable boot debugging, which isn't used
# on a deployed kiosk with HDMI + SSH available. Kept unconditional (not gated on
# the theme-set step above succeeding) — a device that failed the initramfs
# rebuild above still needs this, since the serial-console fallback happens
# independently of whether its own theme's initramfs rebuild worked.
if [[ "$IS_PI" -eq 1 ]]; then
  CMDLINE_FILE=/boot/firmware/cmdline.txt
  [[ -f "$CMDLINE_FILE" ]] || CMDLINE_FILE=/boot/cmdline.txt
  if [[ -f "$CMDLINE_FILE" ]] && ! grep -q '\bsplash\b' "$CMDLINE_FILE"; then
    # Single line, space-appended — cmdline.txt must never contain a newline.
    sed -i 's/$/ splash quiet/' "$CMDLINE_FILE"
  fi
  if [[ -f "$CMDLINE_FILE" ]] && ! grep -q consoleblank=0 "$CMDLINE_FILE"; then
    sed -i 's/$/ consoleblank=0/' "$CMDLINE_FILE"
  fi
  if [[ -f "$CMDLINE_FILE" ]] && grep -qE 'console=(serial0|ttyS0|ttyAMA0)(,[0-9]+)?' "$CMDLINE_FILE"; then
    sed -i -E 's/console=(serial0|ttyS0|ttyAMA0)(,[0-9]+)?[[:space:]]*//g; s/[[:space:]]+/ /g; s/^[[:space:]]+//; s/[[:space:]]+$//' "$CMDLINE_FILE"
  fi
else
  # Generic x86/GRUB boot has no flat cmdline.txt — the kernel command line comes
  # from /etc/default/grub's GRUB_CMDLINE_LINUX_DEFAULT instead, baked into
  # /boot/grub/grub.cfg by update-grub. Some cloud-image-derived x86 installs set a
  # serial console (console=ttyS0) for headless use, which would hit the exact
  # same Plymouth fallback documented above — stripped here too just in case, even
  # though a plain Debian install typically won't have one. Idempotent: re-running
  # with these tokens already present is a harmless no-op (the `[[ ... == * ]]`
  # checks skip re-adding what's already there).
  GRUB_FILE=/etc/default/grub
  if [[ -f "$GRUB_FILE" ]]; then
    CURRENT="$(sed -n 's/^GRUB_CMDLINE_LINUX_DEFAULT="\(.*\)"$/\1/p' "$GRUB_FILE" | head -1)"
    NEW="$CURRENT"
    [[ "$NEW" == *splash* ]] || NEW="$NEW splash"
    [[ "$NEW" == *quiet* ]] || NEW="$NEW quiet"
    [[ "$NEW" == *consoleblank=0* ]] || NEW="$NEW consoleblank=0"
    NEW="$(echo "$NEW" | sed -E 's/console=(ttyS[0-9]+|serial0)(,[0-9]+)?[[:space:]]*//g; s/[[:space:]]+/ /g; s/^[[:space:]]+//; s/[[:space:]]+$//')"
    if grep -q '^GRUB_CMDLINE_LINUX_DEFAULT=' "$GRUB_FILE"; then
      sed -i "s#^GRUB_CMDLINE_LINUX_DEFAULT=.*#GRUB_CMDLINE_LINUX_DEFAULT=\"$NEW\"#" "$GRUB_FILE"
    else
      echo "GRUB_CMDLINE_LINUX_DEFAULT=\"$NEW\"" >> "$GRUB_FILE"
    fi
    update-grub
  else
    echo "No /etc/default/grub found — skipping boot-splash kernel cmdline setup." >&2
  fi
fi

# ---------------------------------------------------------------------------
log "Installing systemd units"
cp "$APP_DIR/systemd/signage-player.service" /etc/systemd/system/
KIOSK_SED="s#/usr/bin/chromium#${CHROMIUM_BIN}#"
if [[ "$IS_PI" -eq 0 ]]; then
  # --disable-accelerated-video-decode works around a Pi-specific Chromium/V4L2
  # hang (see this flag's own comment in signage-kiosk.service) — Intel's VAAPI
  # video decode in Chromium is solid, so there's no reason to force software
  # decode here and give up the hardware-decode advantage an x86 stick actually has.
  KIOSK_SED="$KIOSK_SED; /--disable-accelerated-video-decode/d"
fi
sed "$KIOSK_SED" "$APP_DIR/systemd/signage-kiosk.service" \
  > /etc/systemd/system/signage-kiosk.service
systemctl daemon-reload
systemctl enable --now signage-player.service
if [[ "$HAVE_YDOTOOL" -eq 1 ]]; then
  cp "$APP_DIR/systemd/ydotoold.service" /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable --now ydotoold.service
fi
systemctl enable signage-kiosk.service

# ---------------------------------------------------------------------------
log "Configuring auto-login on tty1 (needed for the kiosk unit to attach to a seat)"
mkdir -p /etc/systemd/system/getty@tty1.service.d
cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf <<EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin ${SIGNAGE_USER} --noclear %I \$TERM
EOF
systemctl daemon-reload

if [[ "$IS_PI" -eq 1 ]]; then
  log "Forcing full HDMI mode (video + audio) instead of a DVI-compatible, audio-less negotiation"
  # Some monitors/EDIDs make the Pi negotiate HDMI in a video-only mode with no audio
  # at all, regardless of what the OS or player tries to output — a well-known,
  # low-risk Pi gotcha, distinct from (and much safer than) forcing a specific
  # resolution: this doesn't touch EDID parsing or the chosen video mode, it only
  # tells the firmware "this is a real HDMI sink, always enable audio." No x86
  # equivalent — a standard Intel HDMI output already carries audio by default;
  # if a particular stick/monitor combo doesn't, that's an ALSA/PulseAudio output
  # selection issue specific to that hardware, not something safe to script here.
  CONFIG_FILE=/boot/firmware/config.txt
  [[ -f "$CONFIG_FILE" ]] || CONFIG_FILE=/boot/config.txt
  if [[ -f "$CONFIG_FILE" ]] && ! grep -q '^hdmi_drive=' "$CONFIG_FILE"; then
    echo "hdmi_drive=2" >> "$CONFIG_FILE"
  fi
fi

# ---------------------------------------------------------------------------
if [[ "$IS_PI4_5" -eq 1 ]]; then
  log "Installing GStreamer (for NDI live-source support — see pi-player/README.md)"
  # plugins-bad is required, not optional despite the name — waylandsink (what
  # actually renders NDI video onto the kiosk's Wayland surface) lives there, not in
  # -base/-good. Confirmed missing on real Pi 5 hardware: gst-launch-1.0 rejected the
  # NDI pipeline outright with "no element waylandsink" without it.
  apt-get install -y --no-install-recommends \
    gstreamer1.0-tools gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-plugins-bad \
    libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev

  # gst-plugin-ndi and the ndi-find discovery helper both need to be built by hand
  # against the proprietary NDI SDK (Vizrt's EULA requires a human to accept it —
  # can't be curled/scripted here, see README.md), so this only checks whether that
  # one-time manual step has already happened and points at the docs if not.
  # Deliberately non-fatal — same best-effort pattern as the ydotool install above —
  # since a Pi 4/5 provisioned before that manual step is still a working screen for
  # every other content type.
  if ! gst-inspect-1.0 ndisrc >/dev/null 2>&1; then
    echo "gst-plugin-ndi (the 'ndisrc' GStreamer element) isn't installed yet — NDI" >&2
    echo "sources won't play until it's built. See pi-player/README.md for the" >&2
    echo "one-time manual NDI SDK download/build step." >&2
  fi
  if [[ ! -x /opt/signage/bin/ndi-find ]]; then
    echo "The NDI discovery helper (/opt/signage/bin/ndi-find) isn't built yet — the" >&2
    echo "control app's 'Scan for sources' button won't find anything on this screen" >&2
    echo "until it is. See pi-player/README.md." >&2
  fi
fi

log "Done. Reboot to start the kiosk: sudo reboot"
echo "After reboot the display shows its IP + a pairing QR code until you pair it"
echo "from the control app (Home / Settings -> Add a screen)."
