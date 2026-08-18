import type { Device, DeviceStatus, Group, LibraryItem, ScheduleEvent } from './types';
import type { DiscoveredDevice, SignageApiClient } from './client';

const BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
  });
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} failed: ${res.status}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function json(body: unknown): RequestInit {
  return { body: JSON.stringify(body) };
}

async function uploadFile(path: string, file: File): Promise<LibraryItem> {
  const form = new FormData();
  form.append('file', file);
  return request<LibraryItem>(path, { method: 'POST', body: form });
}

export const httpClient: SignageApiClient = {
  // Library
  listLibrary: () => request<LibraryItem[]>('/api/library'),
  addImage: (file) => uploadFile('/api/library/image', file),
  addVideo: (file) => uploadFile('/api/library/video', file),
  addPdf: (file) => uploadFile('/api/library/pdf', file),
  addAnnouncement: (name, text) => request<LibraryItem>('/api/library/announcement', { method: 'POST', ...json({ name, text }) }),
  removeLibraryItem: (id) => request<void>(`/api/library/${id}`, { method: 'DELETE' }),
  setImageDuration: (id, durationSec) => request<void>(`/api/library/${id}`, { method: 'PATCH', ...json({ durationSec }) }),

  // Groups
  listGroups: () => request<Group[]>('/api/groups'),
  addGroup: (name) => request<Group>('/api/groups', { method: 'POST', ...json({ name }) }),
  renameGroup: (id, name) => request<void>(`/api/groups/${id}`, { method: 'PATCH', ...json({ name }) }),
  deleteGroup: async (id) => {
    const res = await fetch(`${BASE_URL}/api/groups/${id}`, { method: 'DELETE' });
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

  // Pairing helpers
  scanNetwork: () => request<DiscoveredDevice[]>('/api/scan'),
};
