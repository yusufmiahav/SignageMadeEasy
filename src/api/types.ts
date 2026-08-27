export type LibraryItemType = 'image' | 'video' | 'pdf' | 'announcement' | 'clock';

export interface LibraryItem {
  id: string;
  name: string;
  type: LibraryItemType;
  /** Human-readable file size, e.g. "1.2 MB". Images, videos, PDFs only. */
  size?: string;
  /** Human-readable duration, e.g. "0:42". Videos only. */
  duration?: string;
  /** Seconds this item stays on screen before advancing. Images and clocks only; defaults to 8 when unset. */
  durationSec?: number;
  /** Data URL thumbnail. Images only. */
  thumb?: string;
  /** Message body. Announcements only. */
  text?: string;
}

export interface ScheduleEvent {
  id: string;
  name: string;
  /** ISO date, e.g. "2026-08-24" */
  start: string;
  /** ISO date, e.g. "2026-08-28" */
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
  status: DeviceStatus;
  groupId: string;
  announcementId: string | null;
  announcementOn: boolean;
}

export interface AppData {
  library: LibraryItem[];
  groups: Group[];
  devices: Device[];
}
