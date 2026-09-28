# SignageMadeEasy

Control a [SignageMadeEasy](https://github.com/yusufmiahav/SignageMadeEasy) hub on
your LAN — force content, flash a screen to identify it, blackout, and force/clear
announcements, for one screen, one group, or every screen at once.

## Configuration

- **Hub host / IP** — the machine running the hub (`127.0.0.1` if Companion runs on
  the same machine).
- **Hub port** — `4000` unless you've changed it.
- **Hub PIN** — the same PIN the hub's own web control app uses to log in
  (`Abc123` by default).
- **Poll interval** — how often this module refreshes screens/groups/content from
  the hub.

## Actions

- **Force content** — pick a target (a group, a standalone screen, or "All
  screens") and a content item.
- **Clear forced content** — same target picker, returns it to its normal
  schedule.
- **Force announcement on** / **Clear/disable announcement** — same shape, for
  announcements.
- **Set blackout** — target + On/Off.
- **Flash screen(s)** — target + briefly flashes the matching screen(s) white to
  help you find them; picking a group flashes every physical screen in it.

## Feedbacks

- **Forced content is active** / **Forced announcement is active** / **Blackout
  is active** — pick a group or standalone screen.
- **Screen is online** — pick one specific screen.

## Variables

- `online_count`, `offline_count`, `total_count`

See the module's own README.md for full setup/install details.
