#!/usr/bin/env bash
# Installed by provision.sh, root-owned, and only ever invoked via the signage
# user's narrow sudoers grant (see provision.sh) from pi-player's bootRotation.ts —
# rotates the Plymouth boot splash and raw kernel console (drawn before sway/
# Chromium even start) to match a portrait-mounted screen's orientation. Separate
# from displayOrientation.ts's `swaymsg output transform`, which only rotates
# sway's own output *after* it starts — see pi-player/README.md's "Screen
# orientation" section for why the boot-time picture needs this second,
# kernel-level mechanism, and why it was left unimplemented until now.
#
# Uses the modern KMS `video=<connector>:<mode>,rotate=<degrees>` kernel
# command-line parameter rather than the legacy firmware `display_rotate=`
# setting in config.txt: an unmatched/wrong connector name here is a harmless
# no-op — the kernel just doesn't find that output to apply it to, and boot
# proceeds completely normally, just unrotated. config.txt's own display_rotate=
# has no such safety net and can leave a Pi with no display output at all if
# it's wrong, which is exactly the risk that made this a "real hardware
# follow-up" rather than something guessed at blind.
#
# <mode> is normally "d" (the driver's own default/preferred mode) unless
# set-display-resolution.sh has separately forced an explicit one for this same
# connector — this script preserves whatever that's currently set to rather than
# clobbering it back to "d", since both scripts share one `video=` cmdline token
# but are independently invoked (see displayResolution.ts).
#
# usage: set-boot-rotation.sh <connector> <0|90|180|270>
#   Always strips any existing video= token first (idempotent — safe to call
#   repeatedly, never accumulates duplicate tokens), then re-adds one carrying
#   forward the existing mode, with rotate= set only if degrees isn't 0.

set -euo pipefail

CMDLINE_FILE=/boot/firmware/cmdline.txt
[[ -f "$CMDLINE_FILE" ]] || CMDLINE_FILE=/boot/cmdline.txt
[[ -f "$CMDLINE_FILE" ]] || { echo "No cmdline.txt found" >&2; exit 1; }

CONNECTOR="${1:-}"
DEGREES="${2:-}"

if [[ -z "$CONNECTOR" ]] || [[ ! "$DEGREES" =~ ^(0|90|180|270)$ ]]; then
  echo "usage: $0 <connector> <0|90|180|270>" >&2
  exit 1
fi

CONTENT="$(cat "$CMDLINE_FILE")"
EXISTING_MODE="d"
if [[ "$CONTENT" =~ video=${CONNECTOR}:([^,[:space:]]+) ]]; then
  EXISTING_MODE="${BASH_REMATCH[1]}"
fi

# Strips any existing video= token (for any connector — this project only ever
# targets the single connected output, see drmConnector.ts) before re-adding.
sed -i -E 's/ ?video=[^ ]*//g; s/[[:space:]]+/ /g; s/[[:space:]]+$//' "$CMDLINE_FILE"

if [[ "$DEGREES" != "0" || "$EXISTING_MODE" != "d" ]]; then
  TOKEN="video=${CONNECTOR}:${EXISTING_MODE}"
  [[ "$DEGREES" != "0" ]] && TOKEN="${TOKEN},rotate=${DEGREES}"
  sed -i "s/\$/ ${TOKEN}/" "$CMDLINE_FILE"
fi
