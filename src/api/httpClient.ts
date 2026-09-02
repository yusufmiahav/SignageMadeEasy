import type { AnnouncementSchedule, Backup, Device, DeviceStatus, Group, LibraryItem, ScheduleEvent } from './types';
import type { DiscoveredDevice, SignageApiClient } from './client';

const BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    // Needed for the session cookie (see hub/src/auth.ts) — the default 'same-origin'
    // credentials mode won't send it in dev, where the control app and hub run on
    // different ports/origins.
    credentials: 'include',
    headers: init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
  });
  if (!res.ok) {
    // Surfaces the hub's own { error: "..." } body (e.g. duplicate-IP pairing)
    // where available, since "POST /api/devices/pair failed: 409" tells a user
    // nothing actionable.
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `${init?.method ?? 'GET'} ${path} failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function json(body: unknown): RequestInit {
  return { body: JSON.stringify(body) };
}

// fetch() has no cross-browser way to observe upload (as opposed to download)
// progress, so a real progress bar needs XMLHttpRequest for this one call.
function uploadFile(path: string, file: File, onProgress?: (pct: number) => void): Promise<LibraryItem> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE_URL}${path}`);
    xhr.withCredentials = true; // send the session cookie — see request()'s credentials: 'include'
    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as LibraryItem);
        return;
      }
      // Mirrors request()'s error handling: surface the hub's own { error: "..." }
      // body where available rather than just a bare status code.
      const body = (() => {
        try { return JSON.parse(xhr.responseText) as { error?: string }; } catch { return null; }
      })();
      reject(new Error(body?.error || `POST ${path} failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error(`POST ${path} failed: network error`));
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}

export const httpClient: SignageApiClient = {
  // Library
  listLibrary: () => request<LibraryItem[]>('/api/library'),
  addImage: (file, onProgress) => uploadFile('/api/library/image', file, onProgress),
  addVideo: (file, onProgress) => uploadFile('/api/library/video', file, onProgress),
  addPdf: (file, onProgress) => uploadFile('/api/library/pdf', file, onProgress),
  addAnnouncement: (name, text) => request<LibraryItem>('/api/library/announcement', { method: 'POST', ...json({ name, text }) }),
  addClock: (name) => request<LibraryItem>('/api/library/clock', { method: 'POST', ...json({ name }) }),
  removeLibraryItem: (id) => request<void>(`/api/library/${id}`, { method: 'DELETE' }),
  reorderLibrary: (ids) => request<void>('/api/library/reorder', { method: 'PUT', ...json({ ids }) }),
  setItemDuration: (id, durationSec) => request<void>(`/api/library/${id}`, { method: 'PATCH', ...json({ durationSec }) }),
  renameLibraryItem: (id, name) => request<void>(`/api/library/${id}`, { method: 'PATCH', ...json({ name }) }),

  // Groups
  listGroups: () => request<Group[]>('/api/groups'),
  addGroup: (name) => request<Group>('/api/groups', { method: 'POST', ...json({ name }) }),
  renameGroup: (id, name) => request<void>(`/api/groups/${id}`, { method: 'PATCH', ...json({ name }) }),
  deleteGroup: async (id) => {
    const res = await fetch(`${BASE_URL}/api/groups/${id}`, { method: 'DELETE', credentials: 'include' });
    if (res.status === 409) return false;
    if (!res.ok) throw new Error(`DELETE /api/groups/${id} failed: ${res.status}`);
    return true;
  },
  setDefaultPlaylist: (groupId, libIds) => request<void>(`/api/groups/${groupId}/playlist`, { method: 'PUT', ...json({ libIds }) }),
  addToDefaultPlaylist: (groupId, libIds) => request<void>(`/api/groups/${groupId}/playlist`, { method: 'POST', ...json({ libIds }) }),
  removeFromDefaultPlaylist: (groupId, libId) => request<void>(`/api/groups/${groupId}/playlist/${libId}`, { method: 'DELETE' }),
  reorderDefaultPlaylist: (groupId, libId, direction) =>
    request<void>(`/api/groups/${groupId}/playlist/${libId}/reorder`, { method: 'POST', ...json({ direction }) }),
  addEvent: (groupId, event) => request<ScheduleEvent>(`/api/groups/${groupId}/events`, { method: 'POST', ...json(event) }),
  removeEvent: (groupId, eventId) => request<void>(`/api/groups/${groupId}/events/${eventId}`, { method: 'DELETE' }),
  setForcedContent: (groupId, libId) => request<void>(`/api/groups/${groupId}/forced`, { method: 'PUT', ...json({ libId }) }),
  setForcedAnnouncement: (groupId, announcementId) => request<void>(`/api/groups/${groupId}/forced-announcement`, { method: 'PUT', ...json({ announcementId }) }),
  addAnnouncementSchedule: (groupId, schedule) =>
    request<AnnouncementSchedule>(`/api/groups/${groupId}/announcement-schedules`, { method: 'POST', ...json(schedule) }),
  removeAnnouncementSchedule: (groupId, scheduleId) => request<void>(`/api/groups/${groupId}/announcement-schedules/${scheduleId}`, { method: 'DELETE' }),

  // Devices
  listDevices: () => request<Device[]>('/api/devices'),
  pairDevice: (input: { name: string; ip: string; groupId: string; status?: DeviceStatus }) =>
    request<Device>('/api/devices/pair', { method: 'POST', ...json(input) }),
  renameDevice: (id, name) => request<void>(`/api/devices/${id}`, { method: 'PATCH', ...json({ name }) }),
  moveDevice: (id, groupId) => request<void>(`/api/devices/${id}`, { method: 'PATCH', ...json({ groupId }) }),
  removeDevice: (id) => request<void>(`/api/devices/${id}`, { method: 'DELETE' }),
  restartDevice: (id) => request<void>(`/api/devices/${id}/restart`, { method: 'POST' }),
  setDeviceAnnouncement: (id, announcementId) => request<void>(`/api/devices/${id}/announcement`, { method: 'PUT', ...json({ announcementId }) }),
  toggleDeviceAnnouncement: (id) => request<void>(`/api/devices/${id}/announcement/toggle`, { method: 'POST' }),
  setDeviceVideoQuality: (id, videoQuality) => request<void>(`/api/devices/${id}`, { method: 'PATCH', ...json({ videoQuality }) }),

  // Pairing helpers
  scanNetwork: () => request<DiscoveredDevice[]>('/api/scan'),

  // Backup / restore
  exportBackup: () => request<Backup>('/api/backup'),
  importBackup: (backup) => request<void>('/api/backup/restore', { method: 'POST', ...json(backup) }),
};
