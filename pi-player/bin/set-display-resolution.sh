#!/usr/bin/env bash
# Installed by provision.sh, root-owned, and only ever invoked via the signage
# user's narrow sudoers grant (see provision.sh) from pi-player's
# displayResolution.ts — forces a specific HDMI output mode instead of trusting
# the connected display's own EDID negotiation. See displayResolution.ts's header
# comment for why: some consumer TVs negotiate a mode vc4-kms-v3d treats as
# "default" that the TV itself then displays as a small, wrong-aspect-ratio box
# rather than filling the panel, even though the TV supports 1080p natively.
#
# Uses the same modern KMS `video=<connector>:<mode>,rotate=<degrees>` kernel
# command-line parameter set-boot-rotation.sh already uses for rotation (they
# share one cmdline.txt token) — an unmatched/wrong connector name here is a
# harmless no-op, same safety reasoning as that script.
#
# <rotate> is carried forward from whatever set-boot-rotation.sh may have
# separately configured for this same connector — this script only ever changes
# the mode portion, never clobbers an existing rotation setting.
#
# usage: set-display-resolution.sh <connector> <auto|1920x1080>
#   Always strips any existing video= token first (idempotent), then re-adds one
#   with the requested mode ("d" for auto, an explicit mode for 1920x1080) and
#   the existing rotate= value, if any.

set -euo pipefail

CMDLINE_FILE=/boot/firmware/cmdline.txt
[[ -f "$CMDLINE_FILE" ]] || CMDLINE_FILE=/boot/cmdline.txt
[[ -f "$CMDLINE_FILE" ]] || { echo "No cmdline.txt found" >&2; exit 1; }

CONNECTOR="${1:-}"
RESOLUTION="${2:-}"

if [[ -z "$CONNECTOR" ]] || [[ ! "$RESOLUTION" =~ ^(auto|1920x1080)$ ]]; then
  echo "usage: $0 <connector> <auto|1920x1080>" >&2
  exit 1
fi

CONTENT="$(cat "$CMDLINE_FILE")"
EXISTING_ROTATE=""
if [[ "$CONTENT" =~ video=${CONNECTOR}:[^,[:space:]]*,rotate=([0-9]+) ]]; then
  EXISTING_ROTATE="${BASH_REMATCH[1]}"
fi

MODE="d"
[[ "$RESOLUTION" == "1920x1080" ]] && MODE="1920x1080@60"

# Strips any existing video= token (for any connector — see set-boot-rotation.sh's
# own comment on the single-output assumption) before re-adding.
sed -i -E 's/ ?video=[^ ]*//g; s/[[:space:]]+/ /g; s/[[:space:]]+$//' "$CMDLINE_FILE"

if [[ "$MODE" != "d" || -n "$EXISTING_ROTATE" ]]; then
  TOKEN="video=${CONNECTOR}:${MODE}"
  [[ -n "$EXISTING_ROTATE" ]] && TOKEN="${TOKEN},rotate=${EXISTING_ROTATE}"
  sed -i "s/\$/ ${TOKEN}/" "$CMDLINE_FILE"
fi
