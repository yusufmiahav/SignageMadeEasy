import type { Device, DeviceStatus, Group, LibraryItem, ScheduleEvent } from './types';
import { localStoreClient } from './localStore';

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
  removeLibraryItem(id: string): Promise<void>;

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

export const api: SignageApiClient = localStoreClient;
