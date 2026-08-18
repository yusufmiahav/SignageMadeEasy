# SignageMadeEasy — Control App

A responsive web app for managing LAN-based digital signage screens (Raspberry Pi
players driving 1920×1080 HDMI displays) from a phone or a laptop — pair screens,
manage a content library, build per-location playlists and calendar events, and
send announcements, all from one codebase that adapts from a phone-width layout
to a full desktop layout.

This repo currently contains **the control app frontend only**. The Raspberry Pi
player and the central hub backend it will talk to are future work — see
"Architecture" below for how this app is built to slot into that system.

## Stack

- React + TypeScript + Vite
- Plain CSS: the [Modernist](src/styles/modernist.css) design system (tokens +
  component classes) plus [app-level layout CSS](src/styles/app.css) — no CSS
  framework
- No router — navigation is a single `tab` state (`home | library | schedule |
  settings`), matching the single-page app design

## Getting started

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check + production build
npm run lint      # oxlint
```

## Architecture

The app's data layer is a typed async client (`src/api/client.ts`) implemented
today by `src/api/localStore.ts`, which persists everything to `localStorage` and
mirrors the eventual hub's behavior client-side (real image thumbnails via
`FileReader`, real video duration via a temporary `<video>` element).

This is a deliberate seam: the plan is a central hub server (Docker-deployed,
intended to run on a NAS on the same LAN as the Raspberry Pi players) that every
paired Pi polls for its location's playlist, events, and forced content, and that
this control app talks to over HTTP. When that hub exists, swapping `api/client.ts`'s
implementation for one that calls the hub's REST API is a one-file change — no
screen or component needs to change, since they only ever call the typed methods
on `api`.

### Known placeholders (no real hub/Pi to back them yet)

- Device online/offline status, IP, and "Restart" are stored/toggled locally —
  there's no real Pi to ping or restart.
- "Scan network" and "Scan QR code" pairing simulate discovery.
- "Download OS image (.img)" shows a toast rather than serving a real file — the
  Pi OS image doesn't exist yet.

## Project structure

```
src/
  api/        typed client + localStorage-backed implementation + content resolution logic
  hooks/      useAppState — central data + actions used by every screen
  components/ shared UI (cards, calendar, dialogs, icons)
  screens/    Home, Library, Schedule, Settings
  styles/     modernist.css (design system, unmodified) + app.css (layout)
```
