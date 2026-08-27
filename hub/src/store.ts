import { randomUUID } from 'node:crypto';
import { db } from './db.js';
import type { Device, DeviceStatus, DiscoveredDevice, Group, LibraryItem, PlayerState, ScheduleEvent } from './types.js';

const ONLINE_WINDOW_MS = 45_000;

function uid(prefix: string): string {
  return `${prefix}${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

// ---- Library ----

interface LibraryRow {
  id: string; name: string; type: LibraryItem['type']; size: string | null; duration: string | null; durationSec: number | null; thumb: string | null; text: string | null; pageCount: number | null;
}

function rowToLibraryItem(r: LibraryRow): LibraryItem {
  const item: LibraryItem = { id: r.id, name: r.name, type: r.type };
  if (r.size != null) item.size = r.size;
  if (r.duration != null) item.duration = r.duration;
  if (r.durationSec != null) item.durationSec = r.durationSec;
  if (r.thumb != null) item.thumb = r.thumb;
  if (r.text != null) item.text = r.text;
  if (r.pageCount != null) item.pageCount = r.pageCount;
  return item;
}

export function listLibrary(): LibraryItem[] {
  const rows = db.prepare('SELECT id, name, type, size, duration, durationSec, thumb, text, pageCount FROM library ORDER BY createdAt ASC').all() as LibraryRow[];
  return rows.map(rowToLibraryItem);
}

export function addLibraryItem(input: { name: string; type: LibraryItem['type']; size?: string; duration?: string; thumb?: string; text?: string; pageCount?: number }): LibraryItem {
  const id = uid('l');
  db.prepare('INSERT INTO library (id, name, type, size, duration, thumb, text, pageCount, createdAt) VALUES (@id,@name,@type,@size,@duration,@thumb,@text,@pageCount,@createdAt)').run({
    id, name: input.name, type: input.type,
    size: input.size ?? null, duration: input.duration ?? null, thumb: input.thumb ?? null, text: input.text ?? null, pageCount: input.pageCount ?? null,
    createdAt: Date.now(),
  });
  return {
    id, name: input.name, type: input.type,
    ...(input.size && { size: input.size }), ...(input.duration && { duration: input.duration }),
    ...(input.thumb && { thumb: input.thumb }), ...(input.text && { text: input.text }), ...(input.pageCount != null && { pageCount: input.pageCount }),
  };
}

export function removeLibraryItem(id: string): void {
  const groups = db.prepare('SELECT id, defaultPlaylist, forcedContentId FROM groups_').all() as { id: string; defaultPlaylist: string; forcedContentId: string | null }[];
  const updatePlaylist = db.prepare('UPDATE groups_ SET defaultPlaylist = ? WHERE id = ?');
  const clearForced = db.prepare('UPDATE groups_ SET forcedContentId = NULL WHERE id = ?');
  for (const g of groups) {
    const playlist: string[] = JSON.parse(g.defaultPlaylist);
    if (playlist.includes(id)) updatePlaylist.run(JSON.stringify(playlist.filter((x) => x !== id)), g.id);
    if (g.forcedContentId === id) clearForced.run(g.id);
  }
  const events = db.prepare('SELECT id, libIds FROM events').all() as { id: string; libIds: string }[];
  const updateEvent = db.prepare('UPDATE events SET libIds = ? WHERE id = ?');
  for (const e of events) {
    const libIds: string[] = JSON.parse(e.libIds);
    if (libIds.includes(id)) updateEvent.run(JSON.stringify(libIds.filter((x) => x !== id)), e.id);
  }
  db.prepare('UPDATE devices SET announcementId = NULL, announcementOn = 0 WHERE announcementId = ?').run(id);
  db.prepare('DELETE FROM library WHERE id = ?').run(id);
}

export function setItemDuration(id: string, durationSec: number): void {
  db.prepare("UPDATE library SET durationSec = ? WHERE id = ? AND type IN ('image', 'clock')").run(durationSec, id);
}

// ---- Groups ----

interface GroupRow { id: string; name: string; defaultPlaylist: string; forcedContentId: string | null }
interface EventRow { id: string; groupId: string; name: string; start: string; end: string; libIds: string }

function eventsForGroup(groupId: string): ScheduleEvent[] {
  const rows = db.prepare('SELECT id, groupId, name, start, end, libIds FROM events WHERE groupId = ? ORDER BY start ASC').all(groupId) as EventRow[];
  return rows.map((r) => ({ id: r.id, name: r.name, start: r.start, end: r.end, libIds: JSON.parse(r.libIds) }));
}

function rowToGroup(r: GroupRow): Group {
  return { id: r.id, name: r.name, defaultPlaylist: JSON.parse(r.defaultPlaylist), events: eventsForGroup(r.id), forcedContentId: r.forcedContentId };
}

export function listGroups(): Group[] {
  const rows = db.prepare('SELECT id, name, defaultPlaylist, forcedContentId FROM groups_ ORDER BY rowid ASC').all() as GroupRow[];
  return rows.map(rowToGroup);
}

export function getGroup(id: string): Group | null {
  const row = db.prepare('SELECT id, name, defaultPlaylist, forcedContentId FROM groups_ WHERE id = ?').get(id) as GroupRow | undefined;
  return row ? rowToGroup(row) : null;
}

export function addGroup(name: string): Group {
  const id = uid('g');
  const cleanName = name.trim() || 'New location';
  db.prepare('INSERT INTO groups_ (id, name, defaultPlaylist, forcedContentId) VALUES (?,?,?,?)').run(id, cleanName, '[]', null);
  return { id, name: cleanName, defaultPlaylist: [], events: [], forcedContentId: null };
}

export function renameGroup(id: string, name: string): void {
  if (!name.trim()) return;
  db.prepare('UPDATE groups_ SET name = ? WHERE id = ?').run(name.trim(), id);
}

export function deleteGroup(id: string): boolean {
  const count = (db.prepare('SELECT COUNT(*) as n FROM devices WHERE groupId = ?').get(id) as { n: number }).n;
  if (count > 0) return false;
  db.prepare('DELETE FROM groups_ WHERE id = ?').run(id);
  return true;
}

export function setDefaultPlaylist(groupId: string, libIds: string[]): void {
  db.prepare('UPDATE groups_ SET defaultPlaylist = ? WHERE id = ?').run(JSON.stringify(libIds), groupId);
}

export function addToDefaultPlaylist(groupId: string, libIds: string[]): void {
  const group = getGroup(groupId);
  if (!group) return;
  const merged = [...group.defaultPlaylist, ...libIds.filter((id) => !group.defaultPlaylist.includes(id))];
  setDefaultPlaylist(groupId, merged);
}

export function removeFromDefaultPlaylist(groupId: string, libId: string): void {
  const group = getGroup(groupId);
  if (!group) return;
  setDefaultPlaylist(groupId, group.defaultPlaylist.filter((id) => id !== libId));
}

export function reorderDefaultPlaylist(groupId: string, libId: string, direction: 'up' | 'down'): void {
  const group = getGroup(groupId);
  if (!group) return;
  const idx = group.defaultPlaylist.indexOf(libId);
  const swapWith = direction === 'up' ? idx - 1 : idx + 1;
  if (idx < 0 || swapWith < 0 || swapWith >= group.defaultPlaylist.length) return;
  const list = [...group.defaultPlaylist];
  [list[idx], list[swapWith]] = [list[swapWith], list[idx]];
  setDefaultPlaylist(groupId, list);
}

export function addEvent(groupId: string, event: Omit<ScheduleEvent, 'id'>): ScheduleEvent {
  const id = uid('e');
  db.prepare('INSERT INTO events (id, groupId, name, start, end, libIds) VALUES (?,?,?,?,?,?)').run(id, groupId, event.name, event.start, event.end, JSON.stringify(event.libIds));
  return { id, ...event };
}

export function removeEvent(groupId: string, eventId: string): void {
  db.prepare('DELETE FROM events WHERE id = ? AND groupId = ?').run(eventId, groupId);
}

export function setForcedContent(groupId: string, libId: string | null): void {
  db.prepare('UPDATE groups_ SET forcedContentId = ? WHERE id = ?').run(libId, groupId);
}

// ---- Devices ----

interface DeviceRow { id: string; name: string; ip: string; groupId: string; announcementId: string | null; announcementOn: number; lastSeenAt: number | null }

function statusFor(lastSeenAt: number | null): DeviceStatus {
  return lastSeenAt != null && Date.now() - lastSeenAt < ONLINE_WINDOW_MS ? 'online' : 'offline';
}

function rowToDevice(r: DeviceRow): Device {
  return {
    id: r.id, name: r.name, ip: r.ip, groupId: r.groupId,
    announcementId: r.announcementId, announcementOn: !!r.announcementOn,
    status: statusFor(r.lastSeenAt), lastSeenAt: r.lastSeenAt ?? undefined,
  };
}

export function listDevices(): Device[] {
  const rows = db.prepare('SELECT id, name, ip, groupId, announcementId, announcementOn, lastSeenAt FROM devices ORDER BY rowid ASC').all() as DeviceRow[];
  return rows.map(rowToDevice);
}

export function getDevice(id: string): Device | null {
  const row = db.prepare('SELECT id, name, ip, groupId, announcementId, announcementOn, lastSeenAt FROM devices WHERE id = ?').get(id) as DeviceRow | undefined;
  return row ? rowToDevice(row) : null;
}

export function pairDevice(input: { name: string; ip: string; groupId: string; status?: DeviceStatus }): Device {
  const id = uid('d');
  const lastSeenAt = input.status === 'offline' ? null : Date.now();
  db.prepare('INSERT INTO devices (id, name, ip, groupId, announcementId, announcementOn, lastSeenAt) VALUES (?,?,?,?,?,0,?)').run(id, input.name, input.ip, input.groupId, null, lastSeenAt);
  return { id, name: input.name, ip: input.ip, groupId: input.groupId, announcementId: null, announcementOn: false, status: statusFor(lastSeenAt) };
}

export function renameDevice(id: string, name: string): void {
  if (!name.trim()) return;
  db.prepare('UPDATE devices SET name = ? WHERE id = ?').run(name.trim(), id);
}

export function moveDevice(id: string, groupId: string): void {
  db.prepare('UPDATE devices SET groupId = ? WHERE id = ?').run(groupId, id);
}

export function removeDevice(id: string): void {
  db.prepare('DELETE FROM devices WHERE id = ?').run(id);
}

export function setDeviceAnnouncement(id: string, announcementId: string | null): void {
  db.prepare('UPDATE devices SET announcementId = ?, announcementOn = ? WHERE id = ?').run(announcementId, announcementId ? 1 : 0, id);
}

export function toggleDeviceAnnouncement(id: string): void {
  const device = getDevice(id);
  if (device && device.announcementId) {
    db.prepare('UPDATE devices SET announcementOn = ? WHERE id = ?').run(device.announcementOn ? 0 : 1, id);
  }
}

export function recordHeartbeat(id: string, ip: string): void {
  db.prepare('UPDATE devices SET lastSeenAt = ?, ip = ? WHERE id = ?').run(Date.now(), ip, id);
}

// ---- Pairing helper (simulated placeholder for a real LAN scan) ----

export function scanNetwork(): DiscoveredDevice[] {
  const randOctet = () => 20 + Math.floor(Math.random() * 200);
  return [
    { id: uid('n'), name: 'New Display', ip: `192.168.1.${randOctet()}` },
    { id: uid('n'), name: 'New Display', ip: `192.168.1.${randOctet()}` },
  ];
}

// ---- Content resolution (mirrors src/api/resolve.ts) ----

function toISODate(d: Date): string {
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function activeContentIds(group: Group, today: string = toISODate(new Date())): { ids: string[]; kind: 'forced' | 'event' | 'default'; label: string } {
  if (group.forcedContentId) return { ids: [group.forcedContentId], kind: 'forced', label: 'Forced' };
  const event = group.events.find((e) => today >= e.start && today <= e.end);
  if (event) return { ids: event.libIds, kind: 'event', label: event.name };
  return { ids: group.defaultPlaylist, kind: 'default', label: 'Default playlist' };
}

export function getPlayerState(deviceId: string): PlayerState | null {
  const device = getDevice(deviceId);
  if (!device) return null;
  const group = getGroup(device.groupId);
  if (!group) return null;

  const active = activeContentIds(group);
  const libraryById = new Map(listLibrary().map((item) => [item.id, item]));
  const items = active.ids
    .map((id) => libraryById.get(id))
    .filter((item): item is LibraryItem => !!item)
    .map((item) => ({
      id: item.id,
      type: item.type,
      url: item.thumb ?? '',
      duration: item.type === 'video' ? null : item.type === 'image' || item.type === 'clock' ? (item.durationSec ?? 8) : 8,
      ...(item.type === 'pdf' && { pageCount: item.pageCount ?? 1 }),
    }));

  const announcement = device.announcementId ? libraryById.get(device.announcementId) : undefined;
  return {
    kind: active.kind,
    label: active.label,
    items,
    announcement: { on: device.announcementOn && !!announcement, text: announcement?.text ?? null },
  };
}
