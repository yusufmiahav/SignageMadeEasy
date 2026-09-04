export type LibraryItemType = 'image' | 'video' | 'pdf' | 'announcement' | 'clock' | 'ndi';

export interface LibraryItem {
  id: string;
  name: string;
  type: LibraryItemType;
  /** Human-readable file size, e.g. "1.2 MB". Images, videos, PDFs only. */
  size?: string;
  /** Human-readable duration, e.g. "0:42". Videos only. */
  duration?: string;
  /** Seconds this item stays on screen before advancing. Images, clocks, and NDI sources only; defaults to 8 when unset. */
  durationSec?: number;
  /** NDI sources only — the NDI network name of the source to receive, e.g. "DESKTOP-ABC (Camera 1)". Resolved directly by a paired Pi 4/5 or x86 device's own NDI discovery at playback time; the hub never touches the actual video stream. */
  ndiSourceName?: string;
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

export interface Group {
  id: string;
  name: string;
  defaultPlaylist: string[];
  events: ScheduleEvent[];
  forcedContentId: string | null;
  /** This location's announcement forced on for every one of its screens, overriding schedules and each screen's own manual toggle, until cleared. */
  forcedAnnouncementId: string | null;
  /** Date+time windows during which an announcement is shown on every screen at this location, regardless of each screen's own manual toggle. */
  announcementSchedules: AnnouncementSchedule[];
  /** Emergency override: every screen at this location goes to a plain black screen, above even forcedContentId. */
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
  /** Null for a screen not assigned to any location yet ("misc" screens) — see forcedContentId/blackout below, which fill in for the location-level controls it doesn't have. */
  groupId: string | null;
  announcementId: string | null;
  announcementOn: boolean;
  /** Only meaningful/settable while groupId is null — an assigned screen's content comes from its location instead. */
  forcedContentId: string | null;
  /** Same scope as forcedContentId — only meaningful while groupId is null. */
  blackout: boolean;
  /** Same scope as forcedContentId — mirrors Group.defaultPlaylist for a screen with no location. */
  defaultPlaylist: string[];
  /** Same scope as forcedContentId — mirrors Group.events for a screen with no location. */
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

export interface AppData {
  library: LibraryItem[];
  groups: Group[];
  devices: Device[];
}

/** A full config snapshot — everything except the uploaded media files themselves (not JSON-portable). See Settings → Device inventory / backup. */
export interface Backup {
  version: 1;
  exportedAt: string;
  library: LibraryItem[];
  groups: Group[];
  devices: Device[];
}
