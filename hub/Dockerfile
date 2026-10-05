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
# Bakes the commit this image was built from into the image itself, so a running
# container can report "what version am I" (see hub/src/version.ts) without
# needing a .git directory at runtime — the final stage below only copies
# /hub/version.txt out of this stage, never .git itself. node:20-slim has no git
# preinstalled; this is the only stage that needs it. Falls back to "unknown"
# for a build run from something other than a real git checkout (e.g. a source
# tarball) rather than failing the build over a version string.
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
COPY .git ./.git
RUN (git rev-parse --short HEAD || echo unknown) > /hub/version.txt

FROM node:20-slim
# ffmpeg provides ffprobe, used to read real video durations on upload. gosu lets
# docker-entrypoint.sh start as root (needed to fix /app/data's ownership no
# matter what it is — see that script) and then safely drop to the non-root
# "node" user for the actual server process; curl is only needed to fetch it and
# isn't kept in the final layer. Pinned to an exact version/binary, not "latest".
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates \
  && curl -fsSL -o /usr/local/bin/gosu "https://github.com/tianon/gosu/releases/download/1.17/gosu-$(dpkg --print-architecture)" \
  && chmod +x /usr/local/bin/gosu \
  && gosu nobody true \
  && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY hub/package.json hub/package-lock.json* ./
RUN npm install --omit=dev
COPY --from=hub-build --chown=node:node /hub/dist ./dist
COPY --from=hub-build --chown=node:node /hub/version.txt ./version.txt
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
