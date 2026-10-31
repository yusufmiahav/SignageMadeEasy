#!/usr/bin/env bash
# Installed by provision.sh, root-owned, and only ever invoked by the
# signage-usb-override@.service systemd template unit — which udev/ instantiates
# automatically the moment a USB partition with a filesystem appears (see
# udev/99-signage-usb-override.rules). Not meant to be run by hand outside that.
#
# Mounts the given partition read-only and copies every recognized image/video
# loose at its top level (not inside any subfolder) onto this Pi's own disk as
# the active USB override (see pi-player/src/usbOverride.ts) — then unmounts
# immediately: the files are already copied, so the USB stick itself can be
# pulled straight back out and the override keeps playing.
#
# Deliberately only the top level, not a recursive scan — a subfolder's contents
# (e.g. a technician's own unrelated backup photos nested in their own folder)
# are left alone; only files dropped loose at the stick's root count. Mounted
# read-only and noexec: this only ever reads file *contents* as media, never
# executes anything from the stick.

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

# Starting fresh each time means the most recently inserted stick's content always
# wins outright, rather than merging with whatever an earlier override left behind.
rm -rf "$OVERRIDE_DIR"
mkdir -p "$OVERRIDE_DIR"

copied=0
shopt -s nullglob nocaseglob
for f in "$MOUNT_POINT"/*.jpg "$MOUNT_POINT"/*.jpeg "$MOUNT_POINT"/*.png "$MOUNT_POINT"/*.gif "$MOUNT_POINT"/*.webp "$MOUNT_POINT"/*.bmp \
         "$MOUNT_POINT"/*.mp4 "$MOUNT_POINT"/*.mov "$MOUNT_POINT"/*.mkv "$MOUNT_POINT"/*.webm "$MOUNT_POINT"/*.avi "$MOUNT_POINT"/*.m4v; do
  [[ -f "$f" ]] || continue
  cp "$f" "$OVERRIDE_DIR/"
  copied=$((copied + 1))
done
shopt -u nullglob nocaseglob

if [[ "$copied" -eq 0 ]]; then
  log "no recognized images/videos loose at the top level of $DEV_PATH — ignoring (files inside a subfolder don't count)"
  rm -rf "$OVERRIDE_DIR"
  exit 0
fi

chown -R "$SIGNAGE_USER:$SIGNAGE_USER" "$OVERRIDE_DIR"
log "copied $copied file(s) from $DEV_PATH — activating override"
curl -fsS -X POST "$ACTIVATE_URL" >/dev/null 2>&1 || log "warning: could not reach the local player agent to activate the override (is signage-player.service running?)"
