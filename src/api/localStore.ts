import type { AnnouncementSchedule, AppData, Backup, Device, DeviceStatus, Group, LibraryItem, ScheduleEvent } from './types';
import type { DiscoveredDevice, SignageApiClient } from './client';

const STORAGE_KEY = 'signagemadeeasy.data.v1';

function uid(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

function emptyData(): AppData {
  return { library: [], groups: [], devices: [] };
}

function load(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyData();
    return JSON.parse(raw) as AppData;
  } catch {
    return emptyData();
  }
}

function save(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// Kept as its own localStorage entry rather than a field on AppData — a hub-wide
// setting like this isn't user content, so it has no business in a Backup
// export/import any more than the hub's own SIGNAGE_PIN would. Standalone mode has
// no real Pi to actually apply this to; the toggle still works (and persists) for
// UI consistency with the hub-backed client.
const SETTINGS_KEY = 'signagemadeeasy.settings.v1';

function loadSettings(): { safetyHold: boolean } {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw) as { safetyHold: boolean };
  } catch {
    // Fall through to the default below.
  }
  return { safetyHold: true };
}

function saveSettings(settings: { safetyHold: boolean }): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function readImageThumb(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function readVideoDuration(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(formatDuration(video.duration));
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read video metadata'));
    };
    video.src = url;
  });
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class LocalStoreClient implements SignageApiClient {
  private data: AppData = load();

  private persist() {
    save(this.data);
  }

  // ---- Library ----
  async listLibrary(): Promise<LibraryItem[]> {
    // A fresh array reference every call, even though internal mutations happen in
    // place — otherwise React's setState bails out on reference equality and a
    // refresh silently no-ops when nothing else happens to trigger a re-render.
    return [...this.data.library];
  }

  async addImage(file: File): Promise<LibraryItem> {
    const thumb = await readImageThumb(file);
    const item: LibraryItem = { id: uid('l'), name: file.name, type: 'image', size: formatBytes(file.size), thumb, tags: [] };
    this.data.library.push(item);
    this.persist();
    return item;
  }

  async addVideo(file: File): Promise<LibraryItem> {
    const duration = await readVideoDuration(file);
    const item: LibraryItem = { id: uid('l'), name: file.name, type: 'video', size: formatBytes(file.size), duration, tags: [] };
    this.data.library.push(item);
    this.persist();
    return item;
  }

  async addPdf(file: File): Promise<LibraryItem> {
    const item: LibraryItem = { id: uid('l'), name: file.name, type: 'pdf', size: formatBytes(file.size), tags: [] };
    this.data.library.push(item);
    this.persist();
    return item;
  }

  async addAnnouncement(name: string, text: string): Promise<LibraryItem> {
    const item: LibraryItem = { id: uid('l'), name: name.trim() || 'Announcement', type: 'announcement', text, tags: [] };
    this.data.library.push(item);
    this.persist();
    return item;
  }

  async addClock(name: string): Promise<LibraryItem> {
    const item: LibraryItem = { id: uid('l'), name: name.trim() || 'Clock', type: 'clock', tags: [] };
    this.data.library.push(item);
    this.persist();
    return item;
  }

  async addNdiSource(name: string, ndiSourceName: string): Promise<LibraryItem> {
    const item: LibraryItem = { id: uid('l'), name: name.trim() || ndiSourceName.trim(), type: 'ndi', ndiSourceName: ndiSourceName.trim(), tags: [] };
    this.data.library.push(item);
    this.persist();
    return item;
  }

  // No real Pi to ask in standalone/localStorage mode — same "nothing to discover"
  // answer as every other Pi-only capability this client fakes.
  async listNdiSources(): Promise<string[]> {
    return [];
  }

  async setLibraryItemTags(id: string, tags: string[]): Promise<void> {
    const item = this.data.library.find((i) => i.id === id);
    if (item) item.tags = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
    this.persist();
  }

  async setItemDuration(id: string, durationSec: number): Promise<void> {
    const item = this.data.library.find((i) => i.id === id && (i.type === 'image' || i.type === 'clock' || i.type === 'ndi'));
    if (item && Number.isFinite(durationSec) && durationSec >= 1) item.durationSec = Math.round(durationSec);
    this.persist();
  }

  async renameLibraryItem(id: string, name: string): Promise<void> {
    const item = this.data.library.find((i) => i.id === id);
    if (item && name.trim()) item.name = name.trim();
    this.persist();
  }

  async reorderLibrary(ids: string[]): Promise<void> {
    const byId = new Map(this.data.library.map((item) => [item.id, item]));
    const reordered = ids.map((id) => byId.get(id)).filter((i): i is LibraryItem => !!i);
    const remaining = this.data.library.filter((item) => !ids.includes(item.id));
    this.data.library = [...reordered, ...remaining];
    this.persist();
  }

  async removeLibraryItem(id: string): Promise<void> {
    this.data.library = this.data.library.filter((i) => i.id !== id);
    for (const g of this.data.groups) {
      g.defaultPlaylist = g.defaultPlaylist.filter((libId) => libId !== id);
      g.events.forEach((e) => (e.libIds = e.libIds.filter((libId) => libId !== id)));
      if (g.forcedContentId === id) g.forcedContentId = null;
      if (g.forcedAnnouncementId === id) g.forcedAnnouncementId = null;
      g.announcementSchedules = g.announcementSchedules.filter((s) => s.announcementId !== id);
    }
    for (const d of this.data.devices) {
      if (d.announcementId === id) {
        d.announcementId = null;
        d.announcementOn = false;
      }
    }
    this.persist();
  }

  // ---- Groups / locations ----
  async listGroups(): Promise<Group[]> {
    return [...this.data.groups];
  }

  async addGroup(name: string): Promise<Group> {
    const group: Group = {
      id: uid('g'), name: name.trim() || 'New location', defaultPlaylist: [], events: [],
      forcedContentId: null, forcedAnnouncementId: null, announcementSchedules: [], blackout: false,
    };
    this.data.groups.push(group);
    this.persist();
    return group;
  }

  async renameGroup(id: string, name: string): Promise<void> {
    const group = this.data.groups.find((g) => g.id === id);
    if (group && name.trim()) group.name = name.trim();
    this.persist();
  }

  async deleteGroup(id: string): Promise<boolean> {
    if (this.data.devices.some((d) => d.groupId === id)) return false;
    this.data.groups = this.data.groups.filter((g) => g.id !== id);
    this.persist();
    return true;
  }

  async reorderGroups(ids: string[]): Promise<void> {
    const byId = new Map(this.data.groups.map((g) => [g.id, g]));
    const reordered = ids.map((id) => byId.get(id)).filter((g): g is Group => !!g);
    const remaining = this.data.groups.filter((g) => !ids.includes(g.id));
    this.data.groups = [...reordered, ...remaining];
    this.persist();
  }

  async setGroupBlackout(groupId: string, blackout: boolean): Promise<void> {
    const group = this.data.groups.find((g) => g.id === groupId);
    if (group) group.blackout = blackout;
    this.persist();
  }

  async setDefaultPlaylist(groupId: string, libIds: string[]): Promise<void> {
    const group = this.data.groups.find((g) => g.id === groupId);
    if (group) group.defaultPlaylist = libIds;
    this.persist();
  }

  async addToDefaultPlaylist(groupId: string, libIds: string[]): Promise<void> {
    const group = this.data.groups.find((g) => g.id === groupId);
    if (group) group.defaultPlaylist = [...group.defaultPlaylist, ...libIds.filter((id) => !group.defaultPlaylist.includes(id))];
    this.persist();
  }

  async removeFromDefaultPlaylist(groupId: string, libId: string): Promise<void> {
    const group = this.data.groups.find((g) => g.id === groupId);
    if (group) group.defaultPlaylist = group.defaultPlaylist.filter((id) => id !== libId);
    this.persist();
  }

  async reorderDefaultPlaylist(groupId: string, libId: string, direction: 'up' | 'down'): Promise<void> {
    const group = this.data.groups.find((g) => g.id === groupId);
    if (!group) return;
    const idx = group.defaultPlaylist.indexOf(libId);
    const swapWith = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || swapWith < 0 || swapWith >= group.defaultPlaylist.length) return;
    const list = [...group.defaultPlaylist];
    [list[idx], list[swapWith]] = [list[swapWith], list[idx]];
    group.defaultPlaylist = list;
    this.persist();
  }

  async addEvent(groupId: string, event: Omit<ScheduleEvent, 'id'>): Promise<ScheduleEvent> {
    const group = this.data.groups.find((g) => g.id === groupId);
    const ev: ScheduleEvent = { id: uid('e'), ...event };
    if (group) group.events.push(ev);
    this.persist();
    return ev;
  }

  async removeEvent(groupId: string, eventId: string): Promise<void> {
    const group = this.data.groups.find((g) => g.id === groupId);
    if (group) group.events = group.events.filter((e) => e.id !== eventId);
    this.persist();
  }

  async setForcedContent(groupId: string, libId: string | null): Promise<void> {
    const group = this.data.groups.find((g) => g.id === groupId);
    if (group) group.forcedContentId = libId;
    this.persist();
  }

  async setForcedAnnouncement(groupId: string, announcementId: string | null): Promise<void> {
    const group = this.data.groups.find((g) => g.id === groupId);
    if (group) group.forcedAnnouncementId = announcementId;
    this.persist();
  }

  async addAnnouncementSchedule(groupId: string, schedule: Omit<AnnouncementSchedule, 'id'>): Promise<AnnouncementSchedule> {
    const group = this.data.groups.find((g) => g.id === groupId);
    const s: AnnouncementSchedule = { id: uid('as'), ...schedule };
    if (group) group.announcementSchedules.push(s);
    this.persist();
    return s;
  }

  async removeAnnouncementSchedule(groupId: string, scheduleId: string): Promise<void> {
    const group = this.data.groups.find((g) => g.id === groupId);
    if (group) group.announcementSchedules = group.announcementSchedules.filter((s) => s.id !== scheduleId);
    this.persist();
  }

  // ---- Devices ----
  async listDevices(): Promise<Device[]> {
    return [...this.data.devices];
  }

  async pairDevice(input: { name: string; ip: string; groupId: string | null; status?: DeviceStatus }): Promise<Device> {
    if (this.data.devices.some((d) => d.ip === input.ip)) {
      throw new Error(`A screen is already paired at ${input.ip}`);
    }
    const device: Device = {
      id: uid('d'),
      name: input.name,
      ip: input.ip,
      mac: null,
      status: input.status ?? 'online',
      groupId: input.groupId,
      announcementId: null,
      announcementOn: false,
      videoQuality: 'auto',
      forcedContentId: null,
      blackout: false,
      defaultPlaylist: [],
      events: [],
    };
    this.data.devices.push(device);
    this.persist();
    return device;
  }

  async renameDevice(id: string, name: string): Promise<void> {
    const device = this.data.devices.find((d) => d.id === id);
    if (device && name.trim()) device.name = name.trim();
    this.persist();
  }

  async moveDevice(id: string, groupId: string | null): Promise<void> {
    const device = this.data.devices.find((d) => d.id === id);
    if (device) device.groupId = groupId;
    this.persist();
  }

  // `ids` is expected to be the complete set of devices in one scope (one location, or
  // the misc/no-location list) — same contract as the hub's store.reorderDevices. Slot
  // each id from the reorder into that device's old array position so devices outside
  // this scope (a different location entirely) keep their own position untouched.
  async reorderDevices(ids: string[]): Promise<void> {
    const byId = new Map(this.data.devices.map((d) => [d.id, d]));
    const idSet = new Set(ids);
    const reordered = ids.map((id) => byId.get(id)).filter((d): d is Device => !!d);
    let cursor = 0;
    this.data.devices = this.data.devices.map((d) => (idSet.has(d.id) ? reordered[cursor++] : d));
    this.persist();
  }

  async setDeviceForcedContent(id: string, libId: string | null): Promise<void> {
    const device = this.data.devices.find((d) => d.id === id);
    if (device) device.forcedContentId = libId;
    this.persist();
  }

  async setDeviceBlackout(id: string, blackout: boolean): Promise<void> {
    const device = this.data.devices.find((d) => d.id === id);
    if (device) device.blackout = blackout;
    this.persist();
  }

  async setDeviceDefaultPlaylist(deviceId: string, libIds: string[]): Promise<void> {
    const device = this.data.devices.find((d) => d.id === deviceId);
    if (device) device.defaultPlaylist = libIds;
    this.persist();
  }

  async addToDeviceDefaultPlaylist(deviceId: string, libIds: string[]): Promise<void> {
    const device = this.data.devices.find((d) => d.id === deviceId);
    if (device) device.defaultPlaylist = [...device.defaultPlaylist, ...libIds.filter((id) => !device.defaultPlaylist.includes(id))];
    this.persist();
  }

  async removeFromDeviceDefaultPlaylist(deviceId: string, libId: string): Promise<void> {
    const device = this.data.devices.find((d) => d.id === deviceId);
    if (device) device.defaultPlaylist = device.defaultPlaylist.filter((id) => id !== libId);
    this.persist();
  }

  async reorderDeviceDefaultPlaylist(deviceId: string, libId: string, direction: 'up' | 'down'): Promise<void> {
    const device = this.data.devices.find((d) => d.id === deviceId);
    if (!device) return;
    const idx = device.defaultPlaylist.indexOf(libId);
    const swapWith = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || swapWith < 0 || swapWith >= device.defaultPlaylist.length) return;
    const list = [...device.defaultPlaylist];
    [list[idx], list[swapWith]] = [list[swapWith], list[idx]];
    device.defaultPlaylist = list;
    this.persist();
  }

  async addDeviceEvent(deviceId: string, event: Omit<ScheduleEvent, 'id'>): Promise<ScheduleEvent> {
    const device = this.data.devices.find((d) => d.id === deviceId);
    const ev: ScheduleEvent = { id: uid('e'), ...event };
    if (device) device.events.push(ev);
    this.persist();
    return ev;
  }

  async removeDeviceEvent(deviceId: string, eventId: string): Promise<void> {
    const device = this.data.devices.find((d) => d.id === deviceId);
    if (device) device.events = device.events.filter((e) => e.id !== eventId);
    this.persist();
  }

  async removeDevice(id: string): Promise<void> {
    this.data.devices = this.data.devices.filter((d) => d.id !== id);
    this.persist();
  }

  async restartDevice(): Promise<void> {
    // No real Pi to restart yet — the future hub API will proxy this to the device.
  }

  async setDeviceAnnouncement(id: string, announcementId: string | null): Promise<void> {
    const device = this.data.devices.find((d) => d.id === id);
    if (device) {
      device.announcementId = announcementId;
      device.announcementOn = !!announcementId;
    }
    this.persist();
  }

  async toggleDeviceAnnouncement(id: string): Promise<void> {
    const device = this.data.devices.find((d) => d.id === id);
    if (device && device.announcementId) device.announcementOn = !device.announcementOn;
    this.persist();
  }

  async setDeviceVideoQuality(id: string, videoQuality: 'auto' | 'full'): Promise<void> {
    const device = this.data.devices.find((d) => d.id === id);
    if (device) device.videoQuality = videoQuality;
    this.persist();
  }

  // ---- Backup / restore ----
  async exportBackup(): Promise<Backup> {
    return { version: 1, exportedAt: new Date().toISOString(), library: [...this.data.library], groups: [...this.data.groups], devices: [...this.data.devices] };
  }

  async importBackup(backup: Backup): Promise<void> {
    this.data = { library: backup.library, groups: backup.groups, devices: backup.devices };
    this.persist();
  }

  // ---- Settings ----
  async getSettings(): Promise<{ safetyHold: boolean }> {
    return loadSettings();
  }

  async setSafetyHold(enabled: boolean): Promise<void> {
    saveSettings({ safetyHold: enabled });
  }

  // ---- Pairing helpers ----
  async scanNetwork(): Promise<DiscoveredDevice[]> {
    await delay(1300);
    const randOctet = () => 20 + Math.floor(Math.random() * 200);
    return [
      { id: uid('n'), name: 'New Display', ip: `192.168.1.${randOctet()}` },
      { id: uid('n'), name: 'New Display', ip: `192.168.1.${randOctet()}` },
    ];
  }
}

export const localStoreClient: SignageApiClient = new LocalStoreClient();
