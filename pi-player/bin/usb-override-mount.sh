#!/usr/bin/env bash
# Installed by provision.sh, root-owned, and only ever invoked by the
# signage-usb-override@.service systemd template unit — which udev/ instantiates
# automatically the moment a USB partition with a filesystem appears (see
# udev/99-signage-usb-override.rules). Not meant to be run by hand outside that.
#
# Mounts the given partition read-only, looks for a top-level "signage" folder,
# and if found, copies every recognized image/video inside it onto this Pi's own
# disk as the active USB override (see pi-player/src/usbOverride.ts) — then
# unmounts immediately: the files are already copied, so the USB stick itself can
# be pulled straight back out and the override keeps playing.
#
# Deliberately requires that "signage" folder as a marker rather than treating ANY
# inserted USB stick as override content — a technician's personal USB drive
# (backup photos, a different job's files) plugged in for an unrelated reason must
# never silently take over a screen. Mounted read-only and noexec: this only ever
# reads file *contents* as media, never executes anything from the stick.

set -euo pipefail

DEV_NAME="${1:?device name required, e.g. sda1 — passed as %i by the systemd template unit}"
DEV_PATH="/dev/$DEV_NAME"
MOUNT_POINT="/mnt/signage-usb-override/$DEV_NAME"
OVERRIDE_DIR="/opt/signage/usb-override"
SIGNAGE_USER="signage"
ACTIVATE_URL="http://127.0.0.1:8088/usb-override/activate"

log() { echo "[usb-override] $*"; }

cleanup() {
  umount "$MOUNT_POINT" 2>/dev/null || true
  rmdir "$MOUNT_POINT" 2>/dev/null || true
}
trap cleanup EXIT

if [[ ! -b "$DEV_PATH" ]]; then
  log "no such block device: $DEV_PATH — stick may have already been removed"
  exit 0
fi

mkdir -p "$MOUNT_POINT"
if ! mount -o ro,noexec,nosuid "$DEV_PATH" "$MOUNT_POINT" 2>/dev/null; then
  log "could not mount $DEV_PATH — not a supported filesystem, or already mounted elsewhere"
  exit 0
fi

SRC_DIR="$MOUNT_POINT/signage"
if [[ ! -d "$SRC_DIR" ]]; then
  log "no top-level 'signage' folder on $DEV_PATH — ignoring (add one with your images/videos in it to force content onto this screen)"
  exit 0
fi

# Starting fresh each time means the most recently inserted stick's content always
# wins outright, rather than merging with whatever an earlier override left behind.
rm -rf "$OVERRIDE_DIR"
mkdir -p "$OVERRIDE_DIR"

copied=0
shopt -s nullglob nocaseglob
for f in "$SRC_DIR"/*.jpg "$SRC_DIR"/*.jpeg "$SRC_DIR"/*.png "$SRC_DIR"/*.gif "$SRC_DIR"/*.webp "$SRC_DIR"/*.bmp \
         "$SRC_DIR"/*.mp4 "$SRC_DIR"/*.mov "$SRC_DIR"/*.mkv "$SRC_DIR"/*.webm "$SRC_DIR"/*.avi "$SRC_DIR"/*.m4v; do
  [[ -f "$f" ]] || continue
  cp "$f" "$OVERRIDE_DIR/"
  copied=$((copied + 1))
done
shopt -u nullglob nocaseglob

if [[ "$copied" -eq 0 ]]; then
  log "'signage' folder found on $DEV_PATH but no recognized images/videos inside it"
  rm -rf "$OVERRIDE_DIR"
  exit 0
fi

chown -R "$SIGNAGE_USER:$SIGNAGE_USER" "$OVERRIDE_DIR"
log "copied $copied file(s) from $DEV_PATH/signage — activating override"
curl -fsS -X POST "$ACTIVATE_URL" >/dev/null 2>&1 || log "warning: could not reach the local player agent to activate the override (is signage-player.service running?)"
