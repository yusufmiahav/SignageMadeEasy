#!/bin/sh
set -e

# Runs as root (the image's default — see Dockerfile, which deliberately has no
# USER line) so it can fix the data dir's ownership regardless of what it is: a
# fresh empty host directory Docker just created (root-owned, since Docker
# creates a missing bind-mount source as root), an existing bind mount left
# over from an older root-running build of this image, or a Docker-managed
# volume. Then it drops to the non-root "node" user for the actual server
# process — gosu (not su/sudo) because it execs directly into the target
# process as PID 1, so Docker's SIGTERM on `stop` reaches node itself instead
# of a wrapper shell that may or may not forward it.
DATA_DIR="${SIGNAGE_DATA_DIR:-/app/data}"
mkdir -p "$DATA_DIR"
chown -R node:node "$DATA_DIR"

exec gosu node "$@"
