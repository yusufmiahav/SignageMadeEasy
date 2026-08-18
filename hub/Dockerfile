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
COPY --from=hub-build /hub/dist ./dist
COPY --from=web-build /web/dist ./web-dist

ENV PORT=4000
ENV SIGNAGE_DATA_DIR=/app/data
VOLUME ["/app/data"]
EXPOSE 4000

CMD ["node", "dist/index.js"]
