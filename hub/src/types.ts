// Mirrors ../../src/api/types.ts exactly — the hub is the source of truth for these
// shapes once deployed, but the control app's local-storage mode needs its own copy
// too, so both are kept in sync by hand (small, stable shapes; not worth a shared
// package for two consumers).

export type LibraryItemType = 'image' | 'video' | 'pdf' | 'announcement';

export interface LibraryItem {
  id: string;
  name: string;
  type: LibraryItemType;
  size?: string;
  duration?: string;
  /** URL path (e.g. "/uploads/<id>.jpg"), not a data URL — served statically by the hub. */
  thumb?: string;
  text?: string;
  /** PDFs only — real page count, extracted server-side (the frontend's local-storage mode has no way to do this). */
  pageCount?: number;
}

export interface ScheduleEvent {
  id: string;
  name: string;
  start: string;
  end: string;
  libIds: string[];
}

export interface Group {
  id: string;
  name: string;
  defaultPlaylist: string[];
  events: ScheduleEvent[];
  forcedContentId: string | null;
}

export type DeviceStatus = 'online' | 'offline';

export interface Device {
  id: string;
  name: string;
  ip: string;
  status: DeviceStatus;
  groupId: string;
  announcementId: string | null;
  announcementOn: boolean;
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
  /** Seconds this item should stay on screen (images/PDF pages) or `null` for video (plays to `ended`). */
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
