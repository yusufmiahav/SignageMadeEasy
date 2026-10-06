import type { ActionEvent, AnnouncementSchedule, Backup, Device, DeviceStatus, Folder, Group, LibraryItem, Location, SavedHubNetwork, ScheduleEvent, TflStationConfig, TflStationResult, UpdateEvent } from './types';
import { localStoreClient } from './localStore';
import { httpClient } from './httpClient';

export interface DiscoveredDevice {
  id: string;
  name: string;
  ip: string;
}

/** previewDevice's result — see its own comment below for what stale/capturedAt mean. */
export interface DevicePreview {
  url: string;
  stale: boolean;
  /** ISO timestamp the stale frame was captured at; null when stale is false (it's live, so "now"), or when a device has never been successfully previewed at all. */
  capturedAt: string | null;
}

/**
 * The control app's data contract. Every call is async so this can be pointed at the
 * future hub's REST API (running on the NAS, polled by every paired Pi) by swapping
 * the implementation below — no component using `api` needs to change.
 */
export interface SignageApiClient {
  // Library
  listLibrary(): Promise<LibraryItem[]>;
  /** `onProgress` (0-100), where supported, reports the raw upload transfer — not the hub's own post-upload processing (e.g. video capping), which is tracked separately via the returned item's transcodeStatus. */
  addImage(file: File, onProgress?: (pct: number) => void): Promise<LibraryItem>;
  addVideo(file: File, onProgress?: (pct: number) => void): Promise<LibraryItem>;
  addPdf(file: File, onProgress?: (pct: number) => void): Promise<LibraryItem>;
  addAnnouncement(name: string, text: string): Promise<LibraryItem>;
  /** Current time of day on a black background, rendered live on the Pi — no file involved. */
  addClock(name: string): Promise<LibraryItem>;
  /** No file either — the hub only stores `ndiSourceName`; the actual video flows directly from the NDI source to a Pi 4/5 or x86 device's own receiver, bypassing the hub entirely. */
  addNdiSource(name: string, ndiSourceName: string): Promise<LibraryItem>;
  /** Pi 4/5 or x86 device only — asks the given paired device to run its own NDI discovery for AddNdiSourceDialog's "Scan for sources" button. Empty array (never throws) when the device is unreachable, isn't NDI-capable, or has no discovery helper built yet — the dialog just falls back to manual entry. */
  listNdiSources(deviceId: string): Promise<string[]>;
  /** Reconfigures an existing 'ndi' item's source name — without deleting and re-adding it. */
  setNdiSourceName(id: string, ndiSourceName: string): Promise<void>;
  /** No file either — a live TfL (Transport for London) line status board, e.g. red/amber/green for chosen Tube/Overground/DLR/Elizabeth line(s). `tflModes` are mode names from AddTflStatusDialog's checkboxes; the hub polls TfL centrally and resolves the actual line data at playback time, same "hub owns the live piece" pattern as NDI. */
  addTflStatus(name: string, tflModes: string[]): Promise<LibraryItem>;
  /** Searches TfL stations by name for AddTflArrivalsDialog — the hub resolves any hub/interchange result down to its real, per-mode queryable stations server-side, so every result here is already directly usable. Empty array (never throws) in standalone/localStorage mode (no real hub to query) or if the hub's TfL lookup fails. */
  searchTflStations(query: string): Promise<TflStationResult[]>;
  /** No file either — a live per-station departure board (e.g. "District · Westbound · 3 min, then 5, 8"), distinct from addTflStatus's line-status board. `tflStations` is one or more stations shown together on the same board (searchTflStations results, each with its own line filter — empty/undefined shows every line reported at that station). */
  addTflArrivals(name: string, tflStations: TflStationConfig[]): Promise<LibraryItem>;
  /** Reconfigures an existing 'tfl-status' item's modes — e.g. adding/removing DLR — without deleting and re-adding it. */
  setTflModes(id: string, tflModes: string[]): Promise<void>;
  /** Reconfigures an existing 'tfl-arrivals' item's whole station list (add/remove a station, or change one's line filter) — a full replace, same as at creation time. */
  setTflStations(id: string, tflStations: TflStationConfig[]): Promise<void>;
  removeLibraryItem(id: string): Promise<void>;
  renameLibraryItem(id: string, name: string): Promise<void>;
  /** Persists a drag-and-drop reorder from the Library screen — the complete new display order. */
  reorderLibrary(ids: string[]): Promise<void>;
  /** Images, clocks, and NDI sources only — anything else is a server-side no-op. */
  setItemDuration(id: string, durationSec: number): Promise<void>;
  setLibraryItemTags(id: string, tags: string[]): Promise<void>;
  /** Files a library item under a folder, or `null` to move it back to the library root — via drag-and-drop or the "Move to folder" action. Purely organizational; has no effect on playback. */
  setLibraryItemFolder(id: string, folderId: string | null): Promise<void>;

  // Folders (Library screen media organization — see api/types.ts's Folder)
  listFolders(): Promise<Folder[]>;
  /** `parentId: null` creates it at the top level. */
  addFolder(name: string, parentId: string | null): Promise<Folder>;
  renameFolder(id: string, name: string): Promise<void>;
  /** Reparents a folder (`null` = top level). Rejects if this would nest the folder inside its own subtree. */
  moveFolder(id: string, parentId: string | null): Promise<void>;
  /** Deleting a folder never deletes its contents — every subfolder and library item filed directly under it moves up to the deleted folder's own parent (or the root, if it had none). */
  removeFolder(id: string): Promise<void>;

  // Locations — purely organizational, no content of their own. Hold Groups and/or
  // standalone screens (see Group.locationId/Device.locationId).
  listLocations(): Promise<Location[]>;
  addLocation(name: string): Promise<Location>;
  renameLocation(id: string, name: string): Promise<void>;
  /** Never deletes anything filed under it — any Group/screen that referenced it just becomes un-filed (locationId back to null). */
  deleteLocation(id: string): Promise<void>;
  /** Persists a full reorder — `ids` is the complete new display order; any omitted id keeps its relative order, appended after the given ones. */
  reorderLocations(ids: string[]): Promise<void>;

  // Groups — every screen in a Group shows identical content (shared playlist/schedule).
  listGroups(): Promise<Group[]>;
  /** `locationId` files it under a Location for organization; omit/null to leave it un-filed. */
  addGroup(name: string, locationId?: string | null): Promise<Group>;
  renameGroup(id: string, name: string): Promise<void>;
  /** Files an existing group under a Location, or `null` to un-file it — purely organizational, has no effect on its content. */
  setGroupLocation(id: string, locationId: string | null): Promise<void>;
  /** No-op if the group still has devices assigned. Returns whether it deleted. */
  deleteGroup(id: string): Promise<boolean>;
  /** Persists a reorder of groups on the Home screen — the complete new display order. */
  reorderGroups(ids: string[]): Promise<void>;
  setDefaultPlaylist(groupId: string, libIds: string[]): Promise<void>;
  addToDefaultPlaylist(groupId: string, libIds: string[]): Promise<void>;
  removeFromDefaultPlaylist(groupId: string, libId: string): Promise<void>;
  reorderDefaultPlaylist(groupId: string, libId: string, direction: 'up' | 'down'): Promise<void>;
  addEvent(groupId: string, event: Omit<ScheduleEvent, 'id'>): Promise<ScheduleEvent>;
  removeEvent(groupId: string, eventId: string): Promise<void>;
  /** @deprecated Single-item convenience wrapper — sets the forced playlist to `[libId]`, or clears it when `null`. Prefer setForcedPlaylist/addToForcedPlaylist for a multi-item forced sequence. */
  setForcedContent(groupId: string, libId: string | null): Promise<void>;
  /** Replaces the group's forced playlist wholesale — pass `[]` to go back to the rolling schedule. */
  setForcedPlaylist(groupId: string, libIds: string[]): Promise<void>;
  addToForcedPlaylist(groupId: string, libIds: string[]): Promise<void>;
  removeFromForcedPlaylist(groupId: string, libId: string): Promise<void>;
  reorderForcedPlaylist(groupId: string, libId: string, direction: 'up' | 'down'): Promise<void>;
  /** Forces an announcement on for every screen in this group, overriding schedules and each screen's own manual toggle, until cleared with `null`. */
  setForcedAnnouncement(groupId: string, announcementId: string | null): Promise<void>;
  addAnnouncementSchedule(groupId: string, schedule: Omit<AnnouncementSchedule, 'id'>): Promise<AnnouncementSchedule>;
  removeAnnouncementSchedule(groupId: string, scheduleId: string): Promise<void>;
  /** Emergency override: every screen in this group goes to a plain black screen, above even forced content, until cleared with `false`. */
  setGroupBlackout(groupId: string, blackout: boolean): Promise<void>;

  // Devices
  listDevices(): Promise<Device[]>;
  /**
   * `groupId: null` pairs it standalone (no shared content yet, assignable later);
   * `locationId` optionally files a standalone screen under a Location right away.
   * `hubUrl` overrides which address the hub tells this screen to poll from now on
   * (see hub/src/routes/devices.ts's publicHubUrl) — the hub otherwise guesses from
   * whatever host the browser used to make this very request, which is wrong
   * whenever that's not an address the screen itself can reach (pairing remotely,
   * or a hub with more than one network interface where the screen and the
   * browser doing the pairing sit on different ones).
   */
  pairDevice(input: { name: string; ip: string; groupId: string | null; locationId?: string | null; status?: DeviceStatus; hubUrl?: string }): Promise<Device>;
  renameDevice(id: string, name: string): Promise<void>;
  /** Persists a reorder of screens shown under one group (or the standalone/no-group list) on Settings/Home/Schedule — the complete new display order for that one scope, not a global list. */
  reorderDevices(ids: string[]): Promise<void>;
  /** `groupId: null` unassigns it — a legitimate end state, not just an intermediate one. */
  moveDevice(id: string, groupId: string | null): Promise<void>;
  /** Files a standalone screen under a Location, or `null` to un-file it — meaningless while the screen belongs to a group (its Location comes from the group instead). */
  setDeviceLocation(id: string, locationId: string | null): Promise<void>;
  /**
   * Repoints an existing device at a different IP — e.g. its DHCP lease changed
   * (no reservation), or its SD card was re-flashed/factory-reset and would
   * otherwise re-pair as a brand new device. Pushes a /configure call to
   * whatever Pi is actually at the given address so it adopts THIS device's
   * identity and inherits its full existing configuration (group, schedule,
   * forced content, name, etc.) instead of starting over — same handshake
   * pairDevice's own hubUrl override uses. Always pushes, even when `ip` is the
   * same as the device's current one — real-world case: the screen's IP never
   * changed, but its *hubUrl* went stale (first paired against a different
   * network before being physically moved, or the hub itself changed address),
   * which re-saving the same IP is the way to force-correct without SSHing into
   * the Pi to hand-edit its config.json. `reconfigured: false` isn't an error:
   * the IP is still saved, the Pi just didn't answer there right now (not
   * booted yet, mid-DHCP-renewal, etc.) and will pick this up once it is
   * reachable, the same way initial pairing already degrades gracefully.
   */
  setDeviceIp(id: string, ip: string, hubUrl?: string): Promise<{ reconfigured: boolean }>;
  removeDevice(id: string): Promise<void>;
  restartDevice(id: string): Promise<void>;
  /** Makes this screen's physical display blink white/black twice — helps identify which real screen an entry in Settings corresponds to. No-op in standalone/localStorage mode (no real Pi to ask). */
  flashDevice(id: string): Promise<void>;
  /**
   * Fetches a live screenshot of exactly what's currently rendering on this screen —
   * via the paired Pi's own already-open Chromium DevTools port (see
   * hub/src/piAgent.ts's preview / pi-player/src/preview.ts). `url` is a `blob:` URL
   * ready for an `<img src>`; the caller owns it and must `URL.revokeObjectURL` it
   * once done. If the screen can't be reached right now but answered at least once
   * before, resolves with the hub's cached last-known frame instead (`stale: true`,
   * `capturedAt` set) rather than throwing — see devices.ts's /:id/preview route.
   * Only throws when there's truly nothing to show: never reached, or always in
   * standalone/localStorage mode (no real screen to preview).
   */
  previewDevice(id: string): Promise<DevicePreview>;
  /**
   * Fast path: pulls the latest pi-player code, rebuilds, and restarts the player
   * process on this screen (~10-30s) — for routine app updates, not system-level
   * changes (see reprovisionDevice for those). Needs the Pi to have been
   * re-provisioned at least once after this capability shipped (see
   * pi-player/README.md) — until then this rejects with a specific, actionable
   * message from the Pi's own agent, not a generic failure. No-op in
   * standalone/localStorage mode (no real Pi to ask).
   */
  updateDevice(id: string): Promise<void>;
  /**
   * Full path: re-runs the entire provisioning script fresh from GitHub (system
   * packages, boot config, systemd units, and the app) and reboots — for the rare
   * system-level change updateDevice can't cover. Same one-time bootstrap
   * requirement and no-op-in-standalone-mode behavior as updateDevice above.
   */
  reprovisionDevice(id: string): Promise<void>;
  /**
   * Every Update/Re-provision ever triggered, newest first — Settings screen's
   * "Update log" section, so you can tell at a glance which screens were last
   * touched when, not just whichever one you happen to be looking at right now.
   * Always empty in standalone/localStorage mode (no real Pi to update).
   */
  getUpdateLog(): Promise<UpdateEvent[]>;
  /**
   * Every force-content/blackout change ever made, newest first — Settings screen's
   * "Action history" section. Covers group-scoped and device-scoped changes alike,
   * from any source (the control app's own dialogs, the Bitfocus Companion module).
   * Always empty in standalone/localStorage mode.
   */
  getActionLog(): Promise<ActionEvent[]>;
  /**
   * The hub's own running version (a plain number like "1.0.1", not a git commit
   * hash) — compared against each Device.version to flag a screen that hasn't
   * picked up the hub's current code yet (see Device.version's comment).
   * `hubVersion: null` in standalone/localStorage mode (no real hub), or if a real
   * hub can't read its own /VERSION file (see hub/src/version.ts) — either way,
   * nothing to compare against, so the Settings screen just shows each screen's
   * raw version with no "needs updating" flag.
   */
  getHubVersion(): Promise<{ hubVersion: string | null }>;
  setDeviceAnnouncement(id: string, announcementId: string | null): Promise<void>;
  toggleDeviceAnnouncement(id: string): Promise<void>;
  setDeviceVideoQuality(id: string, videoQuality: 'auto' | 'full'): Promise<void>;
  /** @deprecated Standalone-screen (no group) equivalent of setForcedContent — see its comment. Only meaningful while the device has no groupId. */
  setDeviceForcedContent(id: string, libId: string | null): Promise<void>;
  /** Standalone-screen (no group) equivalents of the group-level forced-playlist methods above — only meaningful while the device has no groupId. */
  setDeviceForcedPlaylist(deviceId: string, libIds: string[]): Promise<void>;
  addToDeviceForcedPlaylist(deviceId: string, libIds: string[]): Promise<void>;
  removeFromDeviceForcedPlaylist(deviceId: string, libId: string): Promise<void>;
  reorderDeviceForcedPlaylist(deviceId: string, libId: string, direction: 'up' | 'down'): Promise<void>;
  /** Standalone-screen (no group) equivalent of setGroupBlackout — only meaningful while the device has no groupId. */
  setDeviceBlackout(id: string, blackout: boolean): Promise<void>;
  /** Clears a USB-stick-forced override on this screen (see Device.usbOverrideActive) — meaningful regardless of groupId, since it's a property of the physical screen, not its group. No-op if nothing's active. */
  clearUsbOverride(id: string): Promise<void>;
  /** Excludes/re-includes this screen in OfflineAlertBanner.tsx's alerting — see Device.offlineAlertsMuted. */
  setDeviceOfflineAlertsMuted(id: string, muted: boolean): Promise<void>;
  /** Standalone-screen (no group) equivalents of the group-level default-playlist/event methods above — only meaningful while the device has no groupId. */
  setDeviceDefaultPlaylist(deviceId: string, libIds: string[]): Promise<void>;
  addToDeviceDefaultPlaylist(deviceId: string, libIds: string[]): Promise<void>;
  removeFromDeviceDefaultPlaylist(deviceId: string, libId: string): Promise<void>;
  reorderDeviceDefaultPlaylist(deviceId: string, libId: string, direction: 'up' | 'down'): Promise<void>;
  addDeviceEvent(deviceId: string, event: Omit<ScheduleEvent, 'id'>): Promise<ScheduleEvent>;
  removeDeviceEvent(deviceId: string, eventId: string): Promise<void>;

  /**
   * Probes the hub's own LAN subnet(s) for unpaired displays. `subnetHint` — a
   * hub-address URL/IP/prefix, typically whatever's currently in the pairing
   * dialog's "Hub address for this screen" field — adds that address's /24 to the
   * subnets probed, on top of the hub's own auto-detected ones; ignored (and
   * harmless to pass) in standalone/localStorage mode, which has no real LAN to
   * scan at all.
   */
  scanNetwork(subnetHint?: string): Promise<DiscoveredDevice[]>;

  // Backup / restore — everything except the uploaded media files themselves.
  exportBackup(): Promise<Backup>;
  /** Wipes and replaces everything currently saved with the backup's contents. */
  importBackup(backup: Backup): Promise<void>;

  // Hub-wide settings (unlike the frontend's own purely-local Settings toggles —
  // dark mode, advanced device info — these are shared policy, not a per-browser
  // preference: safetyHold needs to be known by every Pi too, and offlineAlertMinutes
  // should alert the same way for everyone looking at this hub, not just whoever
  // configured it).
  getSettings(): Promise<{ safetyHold: boolean; savedHubNetworks: SavedHubNetwork[]; offlineAlertMinutes: number }>;
  /**
   * Defaults to true (see hub/src/store.ts's getSafetyHold): a Pi already caches its
   * last-resolved content and keeps showing it through a disconnect from the hub.
   * Turning this off makes a disconnected screen go blank instead.
   */
  setSafetyHold(enabled: boolean): Promise<void>;
  /** Replaces the whole saved-hub-networks list at once — see SavedHubNetwork. */
  setSavedHubNetworks(networks: SavedHubNetwork[]): Promise<void>;
  /**
   * How long a screen has to stay offline before OfflineAlertBanner.tsx warns about
   * it in the control app — purely a notification threshold, never read by a Pi
   * (unlike safetyHold above). 0 turns alerting off entirely.
   */
  setOfflineAlertMinutes(minutes: number): Promise<void>;
}

// Setting VITE_API_BASE_URL at build time (even to an empty string, for a same-origin
// deployment like the hub's own bundled build — see hub/Dockerfile) switches the whole
// app from its standalone, localStorage-only mode onto a real hub over HTTP. Checked
// against undefined rather than truthiness so an empty string still counts as "set".
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
export const api: SignageApiClient = apiBaseUrl !== undefined ? httpClient : localStoreClient;
