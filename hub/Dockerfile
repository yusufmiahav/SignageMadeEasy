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
# ffmpeg provides ffprobe, used to read real video durations on upload.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY hub/package.json hub/package-lock.json* ./
RUN npm install --omit=dev
COPY --from=hub-build --chown=node:node /hub/dist ./dist
COPY --from=web-build --chown=node:node /web/dist ./web-dist

ENV PORT=4000
ENV SIGNAGE_DATA_DIR=/app/data

# Runs as the image's built-in non-root "node" user (uid/gid 1000) instead of
# root. Chowning /app/data here only covers a Docker-managed named/anonymous
# volume, which Docker seeds from the image's own copy on first use — it does
# NOT cover docker-compose.yml's host bind mount (./data:/app/data), whose
# ownership Docker never touches; that needs fixing on the host once instead
# — see docker-compose.yml's comment above the volumes: line.
RUN mkdir -p /app/data && chown -R node:node /app
USER node

VOLUME ["/app/data"]
EXPOSE 4000

# hub/src/app.ts exposes GET /api/health -> { ok: true } for exactly this — lets
# `docker ps` / `docker compose ps` and orchestrators see a wedged process (vs.
# merely "the container didn't exit") without needing curl/wget in the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/index.js"]
