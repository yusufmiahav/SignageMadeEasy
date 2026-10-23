#!/usr/bin/env bash
# Runs ON THE NAS HOST, not inside any container — git pull + rebuild/restart the
# hub, the exact two commands from this README's own "Updating" section, just
# scripted so cron can run them unattended. See hub/README.md's "Auto-update"
# section for the one-time crontab setup this expects.
#
# Invoked two different ways from crontab, both pointed at this same script:
#   - Weekly, unconditionally (no flag) — the scheduled auto-update.
#   - Every few minutes, with --check-marker — exits immediately and silently
#     unless hub/data/.update-requested exists. That marker is what Settings'
#     "Update hub" button actually does (see hub/src/routes/settings.ts's
#     POST /update-hub): the hub container has no Docker access of its own, so
#     clicking the button can only ask this host-side script to run, via that
#     file, not invoke docker compose directly.
#
# A lockfile (flock, not just the marker) stops two invocations overlapping —
# relevant since the weekly schedule and a manual button click could land
# within the same poll window.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$REPO_DIR/hub/data"
LOCK_FILE="$DATA_DIR/.self-update.lock"
MARKER_FILE="$DATA_DIR/.update-requested"
LOG_FILE="$DATA_DIR/self-update.log"

mkdir -p "$DATA_DIR"

if [[ "${1:-}" == "--check-marker" ]]; then
  [[ -f "$MARKER_FILE" ]] || exit 0
fi

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "$(date -u '+%Y-%m-%d %H:%M:%S UTC') — already running, skipping this trigger" >> "$LOG_FILE"
  exit 0
fi

# Removed up front, not after a successful run — an update that fails partway
# through shouldn't leave a stale marker silently re-triggering forever on every
# future poll; check this script's own log (above) to see what went wrong, then
# click "Update hub" again (or just wait for the weekly schedule) once it's fixed.
rm -f "$MARKER_FILE"

{
  echo "=== $(date -u '+%Y-%m-%d %H:%M:%S UTC') — starting update ==="
  cd "$REPO_DIR"
  git pull
  docker compose -f hub/docker-compose.yml up -d --build
  echo "=== $(date -u '+%Y-%m-%d %H:%M:%S UTC') — update finished ==="
} >> "$LOG_FILE" 2>&1
