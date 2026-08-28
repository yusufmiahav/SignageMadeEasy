import type { AnnouncementSchedule, Device, DeviceStatus, Group, LibraryItem, ScheduleEvent } from './types';
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
  addImage(file: File): Promise<LibraryItem>;
  addVideo(file: File): Promise<LibraryItem>;
  addPdf(file: File): Promise<LibraryItem>;
  addAnnouncement(name: string, text: string): Promise<LibraryItem>;
  /** Current time of day on a black background, rendered live on the Pi — no file involved. */
  addClock(name: string): Promise<LibraryItem>;
  removeLibraryItem(id: string): Promise<void>;
  renameLibraryItem(id: string, name: string): Promise<void>;
  /** Images and clocks only — anything else is a server-side no-op. */
  setItemDuration(id: string, durationSec: number): Promise<void>;

  // Locations (groups)
  listGroups(): Promise<Group[]>;
  addGroup(name: string): Promise<Group>;
  renameGroup(id: string, name: string): Promise<void>;
  /** No-op if the location still has devices assigned. Returns whether it deleted. */
  deleteGroup(id: string): Promise<boolean>;
  setDefaultPlaylist(groupId: string, libIds: string[]): Promise<void>;
  addToDefaultPlaylist(groupId: string, libIds: string[]): Promise<void>;
  removeFromDefaultPlaylist(groupId: string, libId: string): Promise<void>;
  reorderDefaultPlaylist(groupId: string, libId: string, direction: 'up' | 'down'): Promise<void>;
  addEvent(groupId: string, event: Omit<ScheduleEvent, 'id'>): Promise<ScheduleEvent>;
  removeEvent(groupId: string, eventId: string): Promise<void>;
  setForcedContent(groupId: string, libId: string | null): Promise<void>;
  /** Forces an announcement on for every screen at this location, overriding schedules and each screen's own manual toggle, until cleared with `null`. */
  setForcedAnnouncement(groupId: string, announcementId: string | null): Promise<void>;
  addAnnouncementSchedule(groupId: string, schedule: Omit<AnnouncementSchedule, 'id'>): Promise<AnnouncementSchedule>;
  removeAnnouncementSchedule(groupId: string, scheduleId: string): Promise<void>;

  // Devices
  listDevices(): Promise<Device[]>;
  pairDevice(input: { name: string; ip: string; groupId: string; status?: DeviceStatus }): Promise<Device>;
  renameDevice(id: string, name: string): Promise<void>;
  moveDevice(id: string, groupId: string): Promise<void>;
  removeDevice(id: string): Promise<void>;
  restartDevice(id: string): Promise<void>;
  setDeviceAnnouncement(id: string, announcementId: string | null): Promise<void>;
  toggleDeviceAnnouncement(id: string): Promise<void>;

  // Pairing helpers (simulated placeholders until the hub can do a real LAN scan)
  scanNetwork(): Promise<DiscoveredDevice[]>;
}

// Setting VITE_API_BASE_URL at build time (even to an empty string, for a same-origin
// deployment like the hub's own bundled build — see hub/Dockerfile) switches the whole
// app from its standalone, localStorage-only mode onto a real hub over HTTP. Checked
// against undefined rather than truthiness so an empty string still counts as "set".
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
export const api: SignageApiClient = apiBaseUrl !== undefined ? httpClient : localStoreClient;
