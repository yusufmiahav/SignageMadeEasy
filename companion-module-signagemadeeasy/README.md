# companion-module-signagemadeeasy

A [Bitfocus Companion](https://bitfocus.io/companion) module for controlling a
[SignageMadeEasy](../) hub from a Stream Deck / button box — force content, flash a
screen to identify it, blackout, and force/clear announcements, for one screen, one
group, or every screen at once, with live online/offline and forced/blackout feedback.

It talks to the hub's own REST API — the exact same endpoints the hub's web control
app uses — so it needs nothing extra installed or configured on the hub itself.

## Setup

1. **Connection** — in Companion, add a new connection using this module, then set:
   - **Hub host / IP** — the machine running the hub. If Companion runs on the same
     machine as the hub (as this was built for), `127.0.0.1` works.
   - **Hub port** — whatever the hub is listening on (`4000` by default; check your
     hub's `docker-compose.yml`/start command if it's been changed).
   - **Hub PIN** — the same PIN the web control app's login screen uses (`Abc123`
     unless changed via the hub's `SIGNAGE_PIN` environment variable).
   - **Poll interval** — how often the module refreshes screens/groups/content from
     the hub (default 4000ms, matching the web app's own polling cadence).

   The module logs in once with this PIN and reuses the session cookie the hub
   issues (good for 30 days — see `hub/src/auth.ts`), re-logging in automatically if
   a request ever comes back 401.

2. **Actions** — add these to buttons:
   - **Force content** — pick a target (a group, a standalone screen, or "All
     screens") and a content item.
   - **Clear forced content** — same target picker, returns it to its normal
     schedule.
   - **Force announcement on** / **Clear/disable announcement** — same shape, for
     announcements.
   - **Set blackout** — target + On/Off.
   - **Flash screen(s)** — target + briefly flashes the matching screen(s) white to
     help you find them; picking a group flashes every physical screen in it. This
     is a direct, best-effort call to each screen (same as the web app's own
     "Identify" button) — a screen that's briefly unreachable is skipped, not
     retried, and the module logs how many succeeded/failed.

3. **Feedbacks** — color a button based on live state:
   - **Forced content is active** / **Forced announcement is active** /
     **Blackout is active** — pick a group or standalone screen.
   - **Screen is online** — pick one specific screen.

4. **Variables** — `$(signagemadeeasy:online_count)`, `$(signagemadeeasy:offline_count)`,
   `$(signagemadeeasy:total_count)` — updated every poll.

## Notes / limitations

- **Targeting mirrors the hub's own data model**: force-content, force-announcement,
  and blackout apply to a *group* or a *standalone* screen, never to one screen
  inside a group individually — a grouped screen is always controlled through its
  group, exactly like the web app's Home tab. **Flash** is the one exception: it's a
  real per-screen action, so targeting a group flashes every physical screen in it.
- **A standalone screen's "forced announcement" is the same field as its own
  announcement + on/off toggle** — there's no separate "forced" layer for a
  standalone screen the way a group has (see `Device.forcedContentId`'s comment in
  the main repo's `src/api/types.ts`). Forcing/clearing an announcement on a
  standalone screen from this module sets that field directly.
- Action/feedback dropdown choices (which groups/screens/content exist) refresh
  automatically whenever the poll notices something added, renamed, or removed —
  editing a button's saved target *value* is unaffected by this refresh.
- This module was built and its API client integration-tested directly against a
  running hub (login, cookie handling, every action's actual hub call, and the
  401-retry path all verified end-to-end), and its manifest was validated against
  the `@companion-module/base` package's own schema validator. It has **not** been
  loaded inside a real Companion instance, since one isn't available in the
  environment this was built in — if your installed Companion version expects a
  slightly different `companion/manifest.json` shape, that's the first place to
  check.

## Installing as a custom/dev module

This isn't published to Bitfocus's module registry, so install it as a local
module:

1. Run `npm install` inside this folder (installs `@companion-module/base`).
2. In Companion's web UI, open **Settings → Modules** (some versions call this
   **Module Developer**) and point its "developer modules path" at the *parent*
   directory containing this folder (Companion scans subfolders for a
   `companion/manifest.json`).
3. Restart Companion (or use its "rescan" button, if your version has one) — a new
   connection type named **SignageMadeEasy** should appear.
4. Add a connection using it and fill in the config fields above.

If your Companion version instead expects a packaged `.tgz` (via
`@companion-module/tools`'s build step) rather than a raw folder, run that tool's
packaging command against this folder and import the result from Companion's
Connections page instead.
