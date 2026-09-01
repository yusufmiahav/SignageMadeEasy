// Mirrors ../../src/api/types.ts exactly — the hub is the source of truth for these
// shapes once deployed, but the control app's local-storage mode needs its own copy
// too, so both are kept in sync by hand (small, stable shapes; not worth a shared
// package for two consumers).

export type LibraryItemType = 'image' | 'video' | 'pdf' | 'announcement' | 'clock';

export interface LibraryItem {
  id: string;
  name: string;
  type: LibraryItemType;
  size?: string;
  duration?: string;
  /** Seconds this item stays on screen before advancing. Images and clocks only; defaults to 8 when unset. */
  durationSec?: number;
  /** URL path (e.g. "/uploads/<id>.jpg"), not a data URL — served statically by the hub. */
  thumb?: string;
  text?: string;
  /** PDFs only — real page count, extracted server-side (the frontend's local-storage mode has no way to do this). */
  pageCount?: number;
  /** Videos only — the original, untouched upload. `thumb` holds the resolution-capped copy once one exists (see transcodeStatus); screens set to "full resolution" (Device.videoQuality) are served this instead. */
  fullUrl?: string;
  /**
   * Videos only. 'processing': capping is running in the background on the hub right
   * now (thumb still points at the original while this is in progress) — 'done': a
   * capped copy exists at `thumb`. 'skipped': the source was already at or under the
   * cap, so there's nothing to wait for. 'failed': capping errored; `thumb` falls back
   * to the original, same as 'skipped' from a playback standpoint.
   */
  transcodeStatus?: 'processing' | 'done' | 'skipped' | 'failed';
}

export interface ScheduleEvent {
  id: string;
  name: string;
  start: string;
  end: string;
  libIds: string[];
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
}

export type DeviceStatus = 'online' | 'offline';

export interface Device {
  id: string;
  name: string;
  ip: string;
  /** Captured once at pairing time from the Pi's own /identify response. Null for a screen paired before this existed, or one paired manually/offline that couldn't be reached to ask. */
  mac: string | null;
  status: DeviceStatus;
  groupId: string;
  announcementId: string | null;
  announcementOn: boolean;
  /**
   * Which copy of a video this screen is served. 'auto' (default): the resolution-capped
   * copy, sized for a Pi 3B+'s hardware decoder — right for most screens. 'full': always
   * the original upload, for a screen on more capable hardware (Pi 4/5) or a lower-res
   * display where the cap buys nothing.
   */
  videoQuality: 'auto' | 'full';
  /** ms since epoch of the last heartbeat received. Not exposed to the control app. */
  lastSeenAt?: number;
}

export interface DiscoveredDevice {
  id: string;
  name: string;
  ip: string;
}

/** One resolved playlist entry, as served to a Pi player. */
export interface PlayerItem {
  id: string;
  type: LibraryItemType;
  url: string;
  /** Seconds this item should stay on screen (images/clocks/PDF pages) or `null` for video (plays to `ended`). */
  duration: number | null;
  /** For PDFs: total page count, each shown for `duration` seconds. */
  pageCount?: number;
}

export interface PlayerState {
  kind: 'forced' | 'event' | 'default';
  label: string;
  items: PlayerItem[];
  announcement: { on: boolean; text: string | null };
}
