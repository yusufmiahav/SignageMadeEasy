#!/usr/bin/env bash
# Installed by provision.sh, root-owned, and only ever invoked via the signage
# user's narrow sudoers grant (see provision.sh) from pi-player's selfUpdate.ts —
# backs the Settings screen's "Re-provision" button (the full path: system
# packages, boot config, systemd units, and the app — see self-update.sh for the
# lighter, faster "just the app code" path used for routine updates instead).
#
# Exactly the documented manual "SSH in, re-run the curl command, then reboot"
# flow (see pi-player/README.md's "Provisioning" section) — just triggered from
# the hub instead of a terminal.
#
# Curled into bash rather than executed from the local /opt/signage/src checkout:
# provision.sh's own first step is a `git pull` of that very checkout, so running
# the on-disk copy directly here would mean bash could be reading from a file that
# pull just rewrote out from under it, mid-run. Curling it fresh sidesteps that
# entirely — the whole script is read into memory before any of it executes,
# decoupled from whatever the checkout on disk does to itself afterward.
#
# That branch in the URL matters, same warning as pi-player/README.md's own — do
# not swap in main.

set -euo pipefail

BRANCH_URL="https://raw.githubusercontent.com/yusufmiahav/SignageMadeEasy/claude/signage-made-easy-dev-r00fl6/pi-player/provision.sh"

curl -fsSL "$BRANCH_URL" | bash
reboot
