#!/usr/bin/env bash
# Installed by provision.sh, root-owned, and only ever invoked via the signage
# user's narrow sudoers grant (see provision.sh) from pi-player's selfUpdate.ts —
# backs the Settings screen's "Update" button (the fast path: app code only, not
# system packages/boot config/systemd units — see reprovision.sh for that).
#
# Mirrors provision.sh's own "Fetching SignageMadeEasy"/"Building the player app"
# steps exactly (kept in sync by hand, same reasoning as this project's other
# hub/pi-player mirrors) rather than calling into provision.sh directly —
# provision.sh's first step is a `git pull` of the very checkout a locally-run copy
# of itself would be executing from, which is only safe when the whole script was
# read into memory up front (see reprovision.sh, which curls it fresh for exactly
# that reason). Running the on-disk copy here while it rewrites itself out from
# under a still-running bash process is a hazard this script has no reason to take
# on for what's normally a much smaller, faster job.

set -euo pipefail

INSTALL_DIR=/opt/signage
APP_DIR="$INSTALL_DIR/app"
SIGNAGE_USER=signage

git -C "$INSTALL_DIR/src" pull --ff-only

# Same reasoning and destination as provision.sh's own version-stamping step —
# keeps this in sync even on the fast update path, not just a full re-provision.
git -C "$INSTALL_DIR/src" rev-parse --short HEAD > "$INSTALL_DIR/version" 2>/dev/null || echo unknown > "$INSTALL_DIR/version"

rsync -a --delete \
  --exclude node_modules --exclude dist \
  "$INSTALL_DIR/src/pi-player/" "$APP_DIR/"
cd "$APP_DIR"
npm install
npm run build
# Same non-recursive-on-$INSTALL_DIR reasoning as provision.sh's own chown step —
# see its comment for why root has to keep owning src/.
chown "$SIGNAGE_USER:$SIGNAGE_USER" "$INSTALL_DIR"
chown -R "$SIGNAGE_USER:$SIGNAGE_USER" "$APP_DIR"

systemctl restart signage-player
