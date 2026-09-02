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
  cage curl ca-certificates git rsync mpv plymouth plymouth-themes

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
log "Installing the underclock toggle script (root-owned — see pi-player/src/underclock.ts)"
# Deliberately NOT under $APP_DIR: that whole tree is chowned to $SIGNAGE_USER
# above, and $SIGNAGE_USER can invoke this script via the sudoers grant below —
# if $SIGNAGE_USER could also edit the script it runs as root, that grant would
# be a straight path to arbitrary root access instead of the one fixed on/off
# toggle it's meant to be.
mkdir -p /opt/signage/bin
install -m 755 -o root -g root "$INSTALL_DIR/src/pi-player/bin/set-underclock.sh" /opt/signage/bin/set-underclock.sh

# ---------------------------------------------------------------------------
log "Granting $SIGNAGE_USER passwordless access to the underclock script and reboot"
# Same reasoning and same visudo-validate-before-install pattern as the nmcli grant
# above: narrow, specific, fixed commands only — never a blanket NOPASSWD:ALL.
# reboot's real path varies across Raspberry Pi OS releases (merged-/usr or not) —
# resolved here rather than hardcoded, same as $CHROMIUM_BIN above.
REBOOT_BIN="$(command -v reboot)"
SUDOERS_TMP="$(mktemp)"
{
  echo "$SIGNAGE_USER ALL=(root) NOPASSWD: /opt/signage/bin/set-underclock.sh"
  echo "$SIGNAGE_USER ALL=(root) NOPASSWD: $REBOOT_BIN"
} > "$SUDOERS_TMP"
if visudo -c -f "$SUDOERS_TMP" >/dev/null 2>&1; then
  install -m 440 "$SUDOERS_TMP" /etc/sudoers.d/signage-underclock
else
  echo "Generated underclock sudoers rule failed validation — skipping. The" >&2
  echo "underclock toggle and reboot-from-the-setup-page won't work without it." >&2
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
# Replaces the raw kernel/systemd boot text with a plain white screen, wordmark, and
# small corner spinner — see assets/plymouth/signagemadeeasy.script. Its syntax was
# checked against real, working Plymouth themes, but this sandbox has no way to
# actually render a boot splash (no kernel framebuffer/DRM to test against), so this
# still needs a real-hardware look before trusting it fully. Wrapped so a failure
# here (initramfs tooling issue, disk space, etc.) can't take the rest of
# provisioning down with it — same reasoning as the ydotool install above.
mkdir -p /usr/share/plymouth/themes/signagemadeeasy
cp "$APP_DIR/assets/plymouth/signagemadeeasy.plymouth" /usr/share/plymouth/themes/signagemadeeasy/
cp "$APP_DIR/assets/plymouth/signagemadeeasy.script" /usr/share/plymouth/themes/signagemadeeasy/
if plymouth-set-default-theme signagemadeeasy -R; then
  CMDLINE_FILE=/boot/firmware/cmdline.txt
  [[ -f "$CMDLINE_FILE" ]] || CMDLINE_FILE=/boot/cmdline.txt
  if [[ -f "$CMDLINE_FILE" ]] && ! grep -q '\bsplash\b' "$CMDLINE_FILE"; then
    # Single line, space-appended — cmdline.txt must never contain a newline.
    sed -i 's/$/ splash quiet/' "$CMDLINE_FILE"
  fi
else
  echo "Failed to set the boot splash theme — skipping. The kiosk itself is" >&2
  echo "unaffected; boot will just show the default console text instead." >&2
fi

# ---------------------------------------------------------------------------
log "Installing systemd units"
cp "$APP_DIR/systemd/signage-player.service" /etc/systemd/system/
sed "s#/usr/bin/chromium#${CHROMIUM_BIN}#" "$APP_DIR/systemd/signage-kiosk.service" \
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

log "Disabling console screen blanking"
if [[ -f /boot/firmware/cmdline.txt ]] && ! grep -q consoleblank=0 /boot/firmware/cmdline.txt; then
  sed -i 's/$/ consoleblank=0/' /boot/firmware/cmdline.txt
fi

log "Forcing full HDMI mode (video + audio) instead of a DVI-compatible, audio-less negotiation"
# Some monitors/EDIDs make the Pi negotiate HDMI in a video-only mode with no audio
# at all, regardless of what mpv tries to output — a well-known, low-risk Pi gotcha,
# distinct from (and much safer than) forcing a specific resolution: this doesn't
# touch EDID parsing or the chosen video mode, it only tells the firmware "this is
# a real HDMI sink, always enable audio."
CONFIG_FILE=/boot/firmware/config.txt
[[ -f "$CONFIG_FILE" ]] || CONFIG_FILE=/boot/config.txt
if [[ -f "$CONFIG_FILE" ]] && ! grep -q '^hdmi_drive=' "$CONFIG_FILE"; then
  echo "hdmi_drive=2" >> "$CONFIG_FILE"
fi

log "Done. Reboot to start the kiosk: sudo reboot"
echo "After reboot the display shows its IP + a pairing QR code until you pair it"
echo "from the control app (Home / Settings -> Add a screen)."
