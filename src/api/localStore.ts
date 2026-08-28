import type { AnnouncementSchedule, AppData, Device, DeviceStatus, Group, LibraryItem, ScheduleEvent } from './types';
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
    const item: LibraryItem = { id: uid('l'), name: file.name, type: 'image', size: formatBytes(file.size), thumb };
    this.data.library.push(item);
    this.persist();
    return item;
  }

  async addVideo(file: File): Promise<LibraryItem> {
    const duration = await readVideoDuration(file);
    const item: LibraryItem = { id: uid('l'), name: file.name, type: 'video', size: formatBytes(file.size), duration };
    this.data.library.push(item);
    this.persist();
    return item;
  }

  async addPdf(file: File): Promise<LibraryItem> {
    const item: LibraryItem = { id: uid('l'), name: file.name, type: 'pdf', size: formatBytes(file.size) };
    this.data.library.push(item);
    this.persist();
    return item;
  }

  async addAnnouncement(name: string, text: string): Promise<LibraryItem> {
    const item: LibraryItem = { id: uid('l'), name: name.trim() || 'Announcement', type: 'announcement', text };
    this.data.library.push(item);
    this.persist();
    return item;
  }

  async addClock(name: string): Promise<LibraryItem> {
    const item: LibraryItem = { id: uid('l'), name: name.trim() || 'Clock', type: 'clock' };
    this.data.library.push(item);
    this.persist();
    return item;
  }

  async setItemDuration(id: string, durationSec: number): Promise<void> {
    const item = this.data.library.find((i) => i.id === id && (i.type === 'image' || i.type === 'clock'));
    if (item && Number.isFinite(durationSec) && durationSec >= 1) item.durationSec = Math.round(durationSec);
    this.persist();
  }

  async renameLibraryItem(id: string, name: string): Promise<void> {
    const item = this.data.library.find((i) => i.id === id);
    if (item && name.trim()) item.name = name.trim();
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
      forcedContentId: null, forcedAnnouncementId: null, announcementSchedules: [],
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

  async pairDevice(input: { name: string; ip: string; groupId: string; status?: DeviceStatus }): Promise<Device> {
    if (this.data.devices.some((d) => d.ip === input.ip)) {
      throw new Error(`A screen is already paired at ${input.ip}`);
    }
    const device: Device = {
      id: uid('d'),
      name: input.name,
      ip: input.ip,
      status: input.status ?? 'online',
      groupId: input.groupId,
      announcementId: null,
      announcementOn: false,
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

  async moveDevice(id: string, groupId: string): Promise<void> {
    const device = this.data.devices.find((d) => d.id === id);
    if (device) device.groupId = groupId;
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
