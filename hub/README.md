# SignageMadeEasy — Hub

The central server every paired Raspberry Pi polls, and the only thing the control
app (`../src`) talks to over the network. One container serves both the REST API
(`/api/*`) and the control app's static build (everything else).

## Deploying on your NAS (Ugreen DXP4800 or similar)

```bash
git clone <this repo>
cd SignageMadeEasy
docker compose -f hub/docker-compose.yml up -d --build
```

Then open `http://<nas-ip>:4000` from any phone or laptop on the same LAN — that's
the control app, now talking to a real hub instead of `localStorage`.

**Networking is not optional here**: the compose file runs the container with
`network_mode: host` on purpose. The hub needs to reach Pi IPs directly (to finish
pairing and to send restart commands) and to scan its own `/24` for unpaired
displays — both require sharing the NAS's actual LAN subnet, which a default Docker
bridge network won't give you. If your platform can't do host networking, use a
macvlan network bound to your LAN interface instead.

Everything persists under `hub/data/` (bind-mounted): `signage.db` (SQLite) and
`uploads/` (the media library). Back that directory up; that's the whole hub's state.

**Multi-homed NAS (more than one network)**: when pairing a screen, the hub tells it
which address to poll based on whatever host the *browser* used to reach the hub —
fine on a single-subnet LAN, but if your NAS has multiple NICs (e.g. one on
`192.168.x`, another on `10.21.x`) and a Pi ends up on a different one than the
browser doing the pairing, the Pi gets handed an address it can't route to and sits
stuck on "waiting for the hub." Set `SIGNAGE_PUBLIC_HUB_URL` (e.g.
`http://10.21.0.5:4000`) as an environment variable on the hub container to always
hand out one specific, known-reachable address regardless of which interface the
pairing request came in on. A screen already paired with the wrong address needs its
`hubUrl` fixed directly in `/opt/signage/config.json` on the Pi (then
`sudo systemctl restart signage-player`) — re-pairing isn't required.

## Pairing a Raspberry Pi

See `../pi-player/README.md` for flashing + provisioning. Once a Pi is running the
player service, pair it from the control app's Settings/Home "Add a screen" dialog —
Scan network, Scan QR, or Enter IP all end up calling this hub's `/api/devices/pair`,
which reaches the Pi directly to complete the handshake.

## API surface

Mirrors `../src/api/client.ts`'s `SignageApiClient` method-for-method under `/api/library`,
`/api/groups`, `/api/devices`, plus two endpoints that only exist for the Pi player:

- `GET /api/player/:deviceId/state` — resolved playlist (forced → event → default),
  each item as a full URL + duration, plus the announcement ticker state.
- `POST /api/devices/:id/heartbeat` — liveness ping; a device goes `offline` after 45s
  without one.

## Local development

```bash
cd hub
npm install
npm run dev     # tsx watch, no Docker, SQLite file under hub/data/
```

The dev server does **not** serve a frontend build (there's no `web-dist` until the
Docker build stage runs it) — point the control app's dev server at it instead via
`VITE_API_BASE_URL=http://localhost:4000 npm run dev` from the repo root.
