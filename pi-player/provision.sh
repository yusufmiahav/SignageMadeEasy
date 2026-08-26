#!/usr/bin/env bash
# SignageMadeEasy Pi provisioning script — run ONCE, as root, over SSH, on a freshly
# flashed Raspberry Pi OS Lite (64-bit, Bookworm or newer). Idempotent: safe to re-run
# after a git pull to pick up player updates.
#
# Before this: flash with Raspberry Pi Imager, using its own gear-icon "OS
# customisation" dialog to set hostname, enable SSH, and set your Wi-Fi SSID/password
# — none of that is this script's job.
#
#   ssh pi@<ip-shown-on-first-boot>
#   sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/<branch>/pi-player/provision.sh)"
# or, if you've already cloned the repo onto the Pi:
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

# ---------------------------------------------------------------------------
log "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends \
  labwc curl ca-certificates git rsync

# ydotool/ydotoold (used to trigger labwc's HideCursor keybind at startup — see
# pi-player/labwc/autostart and rc.xml) aren't in every release's default repo —
# e.g. Raspberry Pi OS Trixie only has them in trixie-backports. Best-effort and
# isolated from the required packages
# above on purpose: this failing must never take the rest of provisioning down
# with it (that's exactly what happened before this was split out — one missing
# package killed the whole script via set -euo pipefail before it ever reached
# anything else, the same failure mode as the earlier git-ownership bug).
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
  echo "ydotool/ydotoold not available — labwc's HideCursor keybind won't be" >&2
  echo "triggered, so the cursor will stay visible (XCURSOR_SIZE=0 still applies" >&2
  echo "as a fallback — see signage-kiosk.service)." >&2
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
log "Fetching SignageMadeEasy"
mkdir -p "$INSTALL_DIR"
if [[ -d "$INSTALL_DIR/src/.git" ]]; then
  git -C "$INSTALL_DIR/src" pull --ff-only
elif [[ -f "$(dirname "$0")/../pi-player/package.json" ]]; then
  # Already running from inside a checkout — use it directly rather than re-cloning.
  ln -sfn "$(cd "$(dirname "$0")/.." && pwd)" "$INSTALL_DIR/src"
else
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR/src"
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
log "Installing labwc config (kiosk autostart + cursor-hide keybind)"
# Replaces the old cage blank-cursor-theme workaround entirely — labwc has a
# real HideCursor action (see pi-player/labwc/rc.xml for why it's wired the
# way it is, and the real version-compatibility caveat).
SIGNAGE_HOME="$(getent passwd "$SIGNAGE_USER" | cut -d: -f6)"
LABWC_CONFIG_DIR="$SIGNAGE_HOME/.config/labwc"
mkdir -p "$LABWC_CONFIG_DIR"
cp "$APP_DIR/labwc/rc.xml" "$LABWC_CONFIG_DIR/rc.xml"
sed "s#/usr/bin/chromium#${CHROMIUM_BIN}#" "$APP_DIR/labwc/autostart" \
  > "$LABWC_CONFIG_DIR/autostart"
chmod +x "$LABWC_CONFIG_DIR/autostart"
chown -R "$SIGNAGE_USER:$SIGNAGE_USER" "$SIGNAGE_HOME/.config"

# ---------------------------------------------------------------------------
log "Installing systemd units"
cp "$APP_DIR/systemd/signage-player.service" /etc/systemd/system/
cp "$APP_DIR/systemd/signage-kiosk.service" /etc/systemd/system/
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

log "Disabling console screen blanking"
if [[ -f /boot/firmware/cmdline.txt ]] && ! grep -q consoleblank=0 /boot/firmware/cmdline.txt; then
  sed -i 's/$/ consoleblank=0/' /boot/firmware/cmdline.txt
fi

log "Done. Reboot to start the kiosk: sudo reboot"
echo "After reboot the display shows its IP + a pairing QR code until you pair it"
echo "from the control app (Home / Settings -> Add a screen)."
