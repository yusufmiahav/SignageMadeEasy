export type LibraryItemType = 'image' | 'video' | 'pdf' | 'announcement' | 'clock' | 'ndi' | 'tfl-status' | 'tfl-arrivals';

/** One station within a 'tfl-arrivals' item's LibraryItem.tflStations — see its comment. */
export interface TflStationConfig {
  /** The real, queryable TfL StopPoint id (e.g. "940GZZLUWSM"), already resolved server-side from any hub/interchange the user searched for. */
  stopPointId: string;
  /** Display name captured at add-time (e.g. "Westminster Underground Station"). */
  stopPointName: string;
  /** Which line ids (e.g. ['jubilee', 'district']) to show arrivals for at this station; empty/undefined shows every line reported there. */
  lines?: string[];
}

/** A folder in the Library screen's media organization tree — purely organizational, has no effect on playback or on any group/device/schedule reference (those all still address a LibraryItem by its own id, regardless of which folder it's filed under). */
export interface Folder {
  id: string;
  name: string;
  /** null = top level, directly under the library root. Nested arbitrarily deep via chained parentId links, same shape as a normal filesystem tree. */
  parentId: string | null;
  /** ms since epoch. Optional — a folder created before this field existed was backfilled with the migration's own run time, and a restored backup from before this field existed has no better answer than "now" either. */
  createdAt?: number;
}

export interface LibraryItem {
  id: string;
  name: string;
  type: LibraryItemType;
  /** Which folder this item is filed under — omitted means the library root. Set via drag-and-drop or the "Move to folder" action on the Library screen; new items always land at the root regardless of which folder is currently open. */
  folderId?: string;
  /** Human-readable file size, e.g. "1.2 MB". Images, videos, PDFs only. */
  size?: string;
  /** Human-readable duration, e.g. "0:42". Videos only. */
  duration?: string;
  /** Seconds this item stays on screen before advancing. Images, clocks, and NDI sources only; defaults to 8 when unset. */
  durationSec?: number;
  /** NDI sources only — the NDI network name of the source to receive, e.g. "DESKTOP-ABC (Camera 1)". Resolved directly by a paired Pi 4/5 or x86 device's own NDI discovery at playback time; the hub never touches the actual video stream. */
  ndiSourceName?: string;
  /** 'tfl-status' items only — which TfL modes to show (e.g. ['tube', 'overground']). The live line status itself is never stored here; it's resolved fresh from the hub's own TfL poll at playback time. */
  tflModes?: string[];
  /**
   * 'tfl-arrivals' items only — one or more stations shown together on the same
   * board (e.g. 3 stations side by side in landscape, stacked in portrait). A
   * single-station board is just the one-element case, not a separate shape.
   */
  tflStations?: TflStationConfig[];
  /** Data URL thumbnail. Images only. */
  thumb?: string;
  /** Message body. Announcements only. */
  text?: string;
  /** Videos only — the original, untouched upload. `thumb` holds the resolution-capped copy once one exists (see transcodeStatus); screens set to "full resolution" (Device.videoQuality) are served this instead. */
  fullUrl?: string;
  /**
   * Videos only. 'processing': the hub is capping this video in the background right
   * now — 'done': a capped copy exists. 'skipped': the source was already small
   * enough, nothing to wait for. 'failed': capping errored; playback falls back to
   * the original, same as 'skipped'.
   */
  transcodeStatus?: 'processing' | 'done' | 'skipped' | 'failed';
  /** Free-form labels for search/filtering in the Library screen. Empty array, never undefined. */
  tags: string[];
  /** ms since epoch — when this item was added. Optional since a restored backup from before this field existed has nothing truthful to report here. */
  createdAt?: number;
}

export interface ScheduleEvent {
  id: string;
  name: string;
  /** ISO date, e.g. "2026-08-24" */
  start: string;
  /** ISO date, e.g. "2026-08-28" */
  end: string;
  libIds: string[];
  /**
   * 24h "HH:MM", e.g. "09:00". Set together with endTime to restrict this event to a
   * daily time window within [start, end] — outside that window the default playlist
   * plays as usual. Unset on both (the default): the event runs all day, every day in
   * range, same as before this field existed. Doesn't support a window that crosses
   * midnight (e.g. 22:00–02:00).
   */
  startTime?: string;
  /** 24h "HH:MM", e.g. "17:00" — see startTime. */
  endTime?: string;
}

export interface AnnouncementSchedule {
  id: string;
  announcementId: string;
  /** ISO date, e.g. "2026-08-28" */
  startDate: string;
  /** ISO date, e.g. "2026-09-03" */
  endDate: string;
  /** 24h "HH:MM", e.g. "09:00" */
  startTime: string;
  /** 24h "HH:MM", e.g. "17:00" */
  endTime: string;
}

/**
 * A purely organizational container for browsing/managing screens as one site/area
 * (e.g. "Warehouse Building", "Reception") — unlike Group below, a Location owns no
 * content of its own: no playlist, no schedule, no forced-content/blackout/
 * announcement controls. It can hold Groups (each still sharing one playlist across
 * its own screens) and/or standalone screens (each with their own independent
 * schedule) side by side — see Group.locationId and Device.locationId.
 */
export interface Location {
  id: string;
  name: string;
}

export interface Group {
  id: string;
  name: string;
  /** Which Location this Group is organized under, for browsing/management — purely organizational, has no effect on content. Null means "not filed under any Location," same standalone-at-the-top-level flexibility a Location's own screens have. */
  locationId: string | null;
  defaultPlaylist: string[];
  events: ScheduleEvent[];
  forcedContentId: string | null;
  /** This group's announcement forced on for every one of its screens, overriding schedules and each screen's own manual toggle, until cleared. */
  forcedAnnouncementId: string | null;
  /** Date+time windows during which an announcement is shown on every screen in this group, regardless of each screen's own manual toggle. */
  announcementSchedules: AnnouncementSchedule[];
  /** Emergency override: every screen in this group goes to a plain black screen, above even forcedContentId. */
  blackout: boolean;
}

export type DeviceStatus = 'online' | 'offline';

export interface Device {
  id: string;
  name: string;
  ip: string;
  /** Captured once at pairing time from the Pi's own agent. Null for a screen paired before this existed, one paired while offline, or any device in standalone/localStorage mode (no real Pi to ask). */
  mac: string | null;
  status: DeviceStatus;
  /** Null for a screen not assigned to any group yet ("standalone" screens, whether or not they're filed under a Location) — see forcedContentId/blackout below, which fill in for the group-level controls it doesn't have. */
  groupId: string | null;
  /** Which Location this screen is filed under when it's standalone (groupId is null) — purely organizational, same as Group.locationId. Meaningless while groupId is set: a grouped screen's Location comes from its Group instead, not set directly here. */
  locationId: string | null;
  announcementId: string | null;
  announcementOn: boolean;
  /** Only meaningful/settable while groupId is null — a grouped screen's content comes from its group instead. */
  forcedContentId: string | null;
  /** Same scope as forcedContentId — only meaningful while groupId is null. */
  blackout: boolean;
  /** Same scope as forcedContentId — mirrors Group.defaultPlaylist for a standalone screen. */
  defaultPlaylist: string[];
  /** Same scope as forcedContentId — mirrors Group.events for a standalone screen. */
  events: ScheduleEvent[];
  /**
   * Which copy of a video this screen is served. 'auto' (default): the resolution-capped
   * copy, sized for a Pi 3B+'s hardware decoder — right for most screens. 'full': always
   * the original upload, for a screen on more capable hardware (Pi 4/5) or a lower-res
   * display where the cap buys nothing.
   */
  videoQuality: 'auto' | 'full';
  /** Reported by the Pi's own poller alongside every heartbeat — undefined for a device that's never sent one yet, or any device in standalone/localStorage mode (no real Pi to ask). */
  tempC?: number | null;
  /** Raw hex string from `vcgencmd get_throttled` — bits 0-3 are current-state (under-voltage/freq-capped/throttled/soft-temp-limit), bits 16-19 are "has happened since boot." */
  throttled?: string | null;
  uptimeSec?: number | null;
  diskFreeMb?: number | null;
  diskTotalMb?: number | null;
}

/** One line serving a searched-for TfL station — see SignageApiClient.searchTflStations. */
export interface TflStationLine {
  id: string;
  name: string;
}

/** One result from AddTflArrivalsDialog's station search — already resolved to a real, queryable StopPoint (never a hub/interchange id) by the hub. */
export interface TflStationResult {
  id: string;
  name: string;
  modes: string[];
  lines: TflStationLine[];
}

export interface AppData {
  library: LibraryItem[];
  groups: Group[];
  devices: Device[];
  folders: Folder[];
  locations: Location[];
}

/** A full config snapshot — everything except the uploaded media files themselves (not JSON-portable). See Settings → Device inventory / backup. `folders`/`locations` are optional so a backup exported before those features existed still imports cleanly (treated as none). */
export interface Backup {
  version: 1;
  exportedAt: string;
  library: LibraryItem[];
  groups: Group[];
  devices: Device[];
  folders?: Folder[];
  locations?: Location[];
}
