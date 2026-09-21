import type { AnnouncementSchedule, Backup, Device, DeviceStatus, Folder, Group, LibraryItem, Location, ScheduleEvent, TflStationConfig, TflStationResult } from './types';
import { localStoreClient } from './localStore';
import { httpClient } from './httpClient';

export interface DiscoveredDevice {
  id: string;
  name: string;
  ip: string;
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
  setForcedContent(groupId: string, libId: string | null): Promise<void>;
  /** Forces an announcement on for every screen in this group, overriding schedules and each screen's own manual toggle, until cleared with `null`. */
  setForcedAnnouncement(groupId: string, announcementId: string | null): Promise<void>;
  addAnnouncementSchedule(groupId: string, schedule: Omit<AnnouncementSchedule, 'id'>): Promise<AnnouncementSchedule>;
  removeAnnouncementSchedule(groupId: string, scheduleId: string): Promise<void>;
  /** Emergency override: every screen in this group goes to a plain black screen, above even forced content, until cleared with `false`. */
  setGroupBlackout(groupId: string, blackout: boolean): Promise<void>;

  // Devices
  listDevices(): Promise<Device[]>;
  /** `groupId: null` pairs it standalone (no shared content yet, assignable later); `locationId` optionally files a standalone screen under a Location right away. */
  pairDevice(input: { name: string; ip: string; groupId: string | null; locationId?: string | null; status?: DeviceStatus }): Promise<Device>;
  renameDevice(id: string, name: string): Promise<void>;
  /** Persists a reorder of screens shown under one group (or the standalone/no-group list) on Settings/Home/Schedule — the complete new display order for that one scope, not a global list. */
  reorderDevices(ids: string[]): Promise<void>;
  /** `groupId: null` unassigns it — a legitimate end state, not just an intermediate one. */
  moveDevice(id: string, groupId: string | null): Promise<void>;
  /** Files a standalone screen under a Location, or `null` to un-file it — meaningless while the screen belongs to a group (its Location comes from the group instead). */
  setDeviceLocation(id: string, locationId: string | null): Promise<void>;
  removeDevice(id: string): Promise<void>;
  restartDevice(id: string): Promise<void>;
  /** Makes this screen's physical display blink white/black twice — helps identify which real screen an entry in Settings corresponds to. No-op in standalone/localStorage mode (no real Pi to ask). */
  flashDevice(id: string): Promise<void>;
  setDeviceAnnouncement(id: string, announcementId: string | null): Promise<void>;
  toggleDeviceAnnouncement(id: string): Promise<void>;
  setDeviceVideoQuality(id: string, videoQuality: 'auto' | 'full'): Promise<void>;
  /** Misc-screen (no location) equivalent of setForcedContent — only meaningful while the device has no groupId. */
  setDeviceForcedContent(id: string, libId: string | null): Promise<void>;
  /** Misc-screen (no location) equivalent of setGroupBlackout — only meaningful while the device has no groupId. */
  setDeviceBlackout(id: string, blackout: boolean): Promise<void>;
  /** Misc-screen (no location) equivalents of the location-level default-playlist/event methods above — only meaningful while the device has no groupId. */
  setDeviceDefaultPlaylist(deviceId: string, libIds: string[]): Promise<void>;
  addToDeviceDefaultPlaylist(deviceId: string, libIds: string[]): Promise<void>;
  removeFromDeviceDefaultPlaylist(deviceId: string, libId: string): Promise<void>;
  reorderDeviceDefaultPlaylist(deviceId: string, libId: string, direction: 'up' | 'down'): Promise<void>;
  addDeviceEvent(deviceId: string, event: Omit<ScheduleEvent, 'id'>): Promise<ScheduleEvent>;
  removeDeviceEvent(deviceId: string, eventId: string): Promise<void>;

  // Pairing helpers (simulated placeholders until the hub can do a real LAN scan)
  scanNetwork(): Promise<DiscoveredDevice[]>;

  // Backup / restore — everything except the uploaded media files themselves.
  exportBackup(): Promise<Backup>;
  /** Wipes and replaces everything currently saved with the backup's contents. */
  importBackup(backup: Backup): Promise<void>;

  // Hub-wide settings (unlike the frontend's own purely-local Settings toggles —
  // dark mode, advanced device info — these need to be known by every Pi too, so
  // they live on the hub, not localStorage).
  getSettings(): Promise<{ safetyHold: boolean }>;
  /**
   * Defaults to true (see hub/src/store.ts's getSafetyHold): a Pi already caches its
   * last-resolved content and keeps showing it through a disconnect from the hub.
   * Turning this off makes a disconnected screen go blank instead.
   */
  setSafetyHold(enabled: boolean): Promise<void>;
}

// Setting VITE_API_BASE_URL at build time (even to an empty string, for a same-origin
// deployment like the hub's own bundled build — see hub/Dockerfile) switches the whole
// app from its standalone, localStorage-only mode onto a real hub over HTTP. Checked
// against undefined rather than truthiness so an empty string still counts as "set".
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
export const api: SignageApiClient = apiBaseUrl !== undefined ? httpClient : localStoreClient;
