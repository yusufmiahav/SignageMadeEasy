#!/usr/bin/env bash
# Installed by provision.sh, root-owned, and only ever invoked via the signage
# user's narrow sudoers grant (see provision.sh) from pi-player's underclock.ts —
# not meant to be run by hand for anything beyond that fixed on/off toggle. Edits
# the boot firmware config directly, which is why this is a separate root-run
# script rather than something the (non-root) player agent does itself.

set -euo pipefail

MARKER_BEGIN="# BEGIN SignageMadeEasy underclock"
MARKER_END="# END SignageMadeEasy underclock"
TARGET_FREQ=1200

CONFIG_FILE=/boot/firmware/config.txt
[[ -f "$CONFIG_FILE" ]] || CONFIG_FILE=/boot/config.txt

remove_block() {
  # Idempotent either way: safe to call before adding (clears any previous block
  # first, no duplicates on repeated "on" calls) and safe to call for "off".
  sed -i "/^${MARKER_BEGIN}\$/,/^${MARKER_END}\$/d" "$CONFIG_FILE"
}

case "${1:-}" in
  on)
    remove_block
    {
      echo "$MARKER_BEGIN"
      echo "arm_freq=$TARGET_FREQ"
      echo "$MARKER_END"
    } >> "$CONFIG_FILE"
    ;;
  off)
    remove_block
    ;;
  *)
    echo "usage: $0 on|off" >&2
    exit 1
    ;;
esac
