# Build context is the REPO ROOT (not hub/), e.g.:
#   docker build -f hub/Dockerfile -t signagemadeeasy-hub .
# so this can build both the control app (repo root) and the hub (hub/) into one image.

FROM node:20-slim AS web-build
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY public ./public
COPY src ./src
# Empty (not unset) on purpose: the hub serves this build from its own origin, so
# relative /api/... paths are correct — see src/api/client.ts's undefined check.
ENV VITE_API_BASE_URL=""
RUN npm run build

FROM node:20-slim AS hub-build
WORKDIR /hub
COPY hub/package.json hub/package-lock.json* ./
RUN npm install
COPY hub/tsconfig.json ./
COPY hub/src ./src
RUN npm run build

FROM node:20-slim
# ffmpeg provides ffprobe, used to read real video durations on upload. gosu lets
# docker-entrypoint.sh start as root (needed to fix /app/data's ownership no
# matter what it is — see that script) and then safely drop to the non-root
# "node" user for the actual server process; curl is only needed to fetch it and
# isn't kept in the final layer. Pinned to an exact version/binary, not "latest".
# libreoffice-impress (headless, via soffice) converts an uploaded .pptx/.ppt to
# PDF at upload time (see pptxConvert.ts) — --no-install-recommends keeps this to
# just the Impress component's own dependencies rather than the full office suite,
# though it's still a meaningfully larger image than ffmpeg alone.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libreoffice-impress python3-venv curl ca-certificates \
  && curl -fsSL -o /usr/local/bin/gosu "https://github.com/tianon/gosu/releases/download/1.17/gosu-$(dpkg --print-architecture)" \
  && chmod +x /usr/local/bin/gosu \
  && gosu nobody true \
  && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
# python-kasa controls a screen's attached TP-Link Tapo smart plug (see
# hub/src/tapo.ts) — the hub reaches a plug directly over the LAN, the same way it
# already reaches every Pi's own agent directly (network_mode: host — see
# docker-compose.yml), so this installs once here rather than on every single Pi
# (an earlier version of this feature did that instead, which meant a screen that
# hadn't been freshly re-provisioned since had no working Tapo support at all). A
# dedicated venv, not a system-wide pip install — this image's Debian base blocks
# that outright (PEP 668) without --break-system-packages, which risks clashing
# with apt-managed packages. No maintained Node equivalent exists for Tapo's local
# control protocol — see tapo.ts's own comment.
RUN python3 -m venv /opt/kasa-venv && /opt/kasa-venv/bin/pip install --quiet --no-cache-dir python-kasa
WORKDIR /app
COPY hub/package.json hub/package-lock.json* ./
RUN npm install --omit=dev
COPY --from=hub-build --chown=node:node /hub/dist ./dist
# A plain UTC date, not a git commit — stamped fresh on every image build, so it's
# always "when was this hub last deployed," automatically, with nothing to
# remember to bump by hand. hub/src/version.ts reads this to report the running
# hub's own version, compared against each screen's own (see pi-player/
# provision.sh's matching comment). The repo's own /VERSION file used to be COPYd
# in here instead — hand-edited with each meaningful change — but nobody actually
# kept that up, so this never changed no matter how many real updates shipped.
# .git itself stays excluded from the build context (see .dockerignore) — this
# is the container's own build-time clock, not a git lookup, so that's no
# obstacle. Still world-readable by default (same `node` user reads it at
# runtime as before), no explicit --chown needed for a RUN-created file.
RUN date -u +%Y.%m.%d > version.txt
COPY --from=web-build --chown=node:node /web/dist ./web-dist
COPY hub/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV PORT=4000
ENV SIGNAGE_DATA_DIR=/app/data

# No USER line here on purpose — the container starts as root so
# docker-entrypoint.sh can fix /app/data's ownership before dropping to the
# non-root "node" user itself (see that script). This covers a host bind mount
# (docker-compose.yml's ./data:/app/data) automatically, on every start, instead
# of requiring `chown -R 1000:1000 hub/data` on the host before first run and
# after every upgrade from an older, root-running image.
VOLUME ["/app/data"]
EXPOSE 4000

# hub/src/app.ts exposes GET /api/health -> { ok: true } for exactly this — lets
# `docker ps` / `docker compose ps` and orchestrators see a wedged process (vs.
# merely "the container didn't exit") without needing curl/wget in the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
