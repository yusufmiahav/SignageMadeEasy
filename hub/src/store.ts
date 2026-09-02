import { randomUUID } from 'node:crypto';
import { db } from './db.js';
import type { AnnouncementSchedule, Device, DeviceStatus, Group, LibraryItem, PlayerState, ScheduleEvent } from './types.js';

const ONLINE_WINDOW_MS = 45_000;

function uid(prefix: string): string {
  return `${prefix}${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

// ---- Library ----

interface LibraryRow {
  id: string; name: string; type: LibraryItem['type']; size: string | null; duration: string | null; durationSec: number | null; thumb: string | null; text: string | null; pageCount: number | null;
  fullUrl: string | null; transcodeStatus: LibraryItem['transcodeStatus'] | null; tags: string;
}
const LIBRARY_COLUMNS = 'id, name, type, size, duration, durationSec, thumb, text, pageCount, fullUrl, transcodeStatus, tags';

function rowToLibraryItem(r: LibraryRow): LibraryItem {
  const item: LibraryItem = { id: r.id, name: r.name, type: r.type, tags: r.tags ? JSON.parse(r.tags) : [] };
  if (r.size != null) item.size = r.size;
  if (r.duration != null) item.duration = r.duration;
  if (r.durationSec != null) item.durationSec = r.durationSec;
  if (r.thumb != null) item.thumb = r.thumb;
  if (r.text != null) item.text = r.text;
  if (r.pageCount != null) item.pageCount = r.pageCount;
  if (r.fullUrl != null) item.fullUrl = r.fullUrl;
  if (r.transcodeStatus != null) item.transcodeStatus = r.transcodeStatus;
  return item;
}

export function listLibrary(): LibraryItem[] {
  const rows = db.prepare(`SELECT ${LIBRARY_COLUMNS} FROM library ORDER BY sortOrder ASC`).all() as LibraryRow[];
  return rows.map(rowToLibraryItem);
}

export function addLibraryItem(input: {
  name: string; type: LibraryItem['type']; size?: string; duration?: string; thumb?: string; text?: string; pageCount?: number;
  fullUrl?: string; transcodeStatus?: LibraryItem['transcodeStatus'];
}): LibraryItem {
  const id = uid('l');
  const nextOrder = (db.prepare('SELECT COALESCE(MAX(sortOrder), -1) + 1 as n FROM library').get() as { n: number }).n;
  db.prepare('INSERT INTO library (id, name, type, size, duration, thumb, text, pageCount, fullUrl, transcodeStatus, sortOrder, createdAt) VALUES (@id,@name,@type,@size,@duration,@thumb,@text,@pageCount,@fullUrl,@transcodeStatus,@sortOrder,@createdAt)').run({
    id, name: input.name, type: input.type,
    size: input.size ?? null, duration: input.duration ?? null, thumb: input.thumb ?? null, text: input.text ?? null, pageCount: input.pageCount ?? null,
    fullUrl: input.fullUrl ?? null, transcodeStatus: input.transcodeStatus ?? null,
    sortOrder: nextOrder,
    createdAt: Date.now(),
  });
  return {
    id, name: input.name, type: input.type, tags: [],
    ...(input.size && { size: input.size }), ...(input.duration && { duration: input.duration }),
    ...(input.thumb && { thumb: input.thumb }), ...(input.text && { text: input.text }), ...(input.pageCount != null && { pageCount: input.pageCount }),
    ...(input.fullUrl && { fullUrl: input.fullUrl }), ...(input.transcodeStatus && { transcodeStatus: input.transcodeStatus }),
  };
}

/** Persists a full drag-and-drop reorder from the Library screen — `ids` is the complete new display order. Any existing item not included keeps its relative order, appended after the given ones, so an incomplete list can't silently drop items from view. */
export const reorderLibrary = db.transaction((ids: string[]): void => {
  const setOrder = db.prepare('UPDATE library SET sortOrder = ? WHERE id = ?');
  ids.forEach((id, i) => setOrder.run(i, id));
  const rest = db.prepare('SELECT id FROM library WHERE id NOT IN (SELECT value FROM json_each(?)) ORDER BY sortOrder ASC').all(JSON.stringify(ids)) as { id: string }[];
  rest.forEach((r, i) => setOrder.run(ids.length + i, r.id));
});

/** Called once the background capping job (see routes/library.ts) finishes for a video item. */
export function setVideoTranscodeResult(id: string, status: 'done' | 'failed', cappedUrl?: string): void {
  if (status === 'done' && cappedUrl) {
    db.prepare('UPDATE library SET thumb = ?, transcodeStatus = ? WHERE id = ?').run(cappedUrl, status, id);
  } else {
    db.prepare('UPDATE library SET transcodeStatus = ? WHERE id = ?').run(status, id);
  }
}

export function removeLibraryItem(id: string): void {
  const groups = db.prepare('SELECT id, defaultPlaylist, forcedContentId, forcedAnnouncementId FROM groups_').all() as { id: string; defaultPlaylist: string; forcedContentId: string | null; forcedAnnouncementId: string | null }[];
  const updatePlaylist = db.prepare('UPDATE groups_ SET defaultPlaylist = ? WHERE id = ?');
  const clearForced = db.prepare('UPDATE groups_ SET forcedContentId = NULL WHERE id = ?');
  const clearForcedAnnouncement = db.prepare('UPDATE groups_ SET forcedAnnouncementId = NULL WHERE id = ?');
  for (const g of groups) {
    const playlist: string[] = JSON.parse(g.defaultPlaylist);
    if (playlist.includes(id)) updatePlaylist.run(JSON.stringify(playlist.filter((x) => x !== id)), g.id);
    if (g.forcedContentId === id) clearForced.run(g.id);
    if (g.forcedAnnouncementId === id) clearForcedAnnouncement.run(g.id);
  }
  const events = db.prepare('SELECT id, libIds FROM events').all() as { id: string; libIds: string }[];
  const updateEvent = db.prepare('UPDATE events SET libIds = ? WHERE id = ?');
  for (const e of events) {
    const libIds: string[] = JSON.parse(e.libIds);
    if (libIds.includes(id)) updateEvent.run(JSON.stringify(libIds.filter((x) => x !== id)), e.id);
  }
  db.prepare('DELETE FROM announcement_schedules WHERE announcementId = ?').run(id);
  db.prepare('UPDATE devices SET announcementId = NULL, announcementOn = 0 WHERE announcementId = ?').run(id);
  db.prepare('DELETE FROM library WHERE id = ?').run(id);
}

export function setItemDuration(id: string, durationSec: number): void {
  db.prepare("UPDATE library SET durationSec = ? WHERE id = ? AND type IN ('image', 'clock')").run(durationSec, id);
}

export function renameLibraryItem(id: string, name: string): void {
  db.prepare('UPDATE library SET name = ? WHERE id = ?').run(name, id);
}

export function setLibraryItemTags(id: string, tags: string[]): void {
  const clean = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
  db.prepare('UPDATE library SET tags = ? WHERE id = ?').run(JSON.stringify(clean), id);
}

// ---- Groups ----

interface GroupRow { id: string; name: string; defaultPlaylist: string; forcedContentId: string | null; forcedAnnouncementId: string | null; blackout: number }
const GROUP_COLUMNS = 'id, name, defaultPlaylist, forcedContentId, forcedAnnouncementId, blackout';
interface EventRow { id: string; groupId: string; name: string; start: string; end: string; libIds: string; startTime: string | null; endTime: string | null }
interface AnnouncementScheduleRow { id: string; groupId: string; announcementId: string; startDate: string; endDate: string; startTime: string; endTime: string }

function eventsForGroup(groupId: string): ScheduleEvent[] {
  const rows = db.prepare('SELECT id, groupId, name, start, end, libIds, startTime, endTime FROM events WHERE groupId = ? ORDER BY start ASC').all(groupId) as EventRow[];
  return rows.map((r) => ({
    id: r.id, name: r.name, start: r.start, end: r.end, libIds: JSON.parse(r.libIds),
    startTime: r.startTime ?? undefined, endTime: r.endTime ?? undefined,
  }));
}

function announcementSchedulesForGroup(groupId: string): AnnouncementSchedule[] {
  const rows = db.prepare('SELECT id, groupId, announcementId, startDate, endDate, startTime, endTime FROM announcement_schedules WHERE groupId = ? ORDER BY startDate ASC').all(groupId) as AnnouncementScheduleRow[];
  return rows.map((r) => ({ id: r.id, announcementId: r.announcementId, startDate: r.startDate, endDate: r.endDate, startTime: r.startTime, endTime: r.endTime }));
}

function rowToGroup(r: GroupRow): Group {
  return {
    id: r.id, name: r.name, defaultPlaylist: JSON.parse(r.defaultPlaylist), events: eventsForGroup(r.id),
    forcedContentId: r.forcedContentId, forcedAnnouncementId: r.forcedAnnouncementId, announcementSchedules: announcementSchedulesForGroup(r.id),
    blackout: !!r.blackout,
  };
}

export function listGroups(): Group[] {
  const rows = db.prepare(`SELECT ${GROUP_COLUMNS} FROM groups_ ORDER BY sortOrder ASC`).all() as GroupRow[];
  return rows.map(rowToGroup);
}

export function getGroup(id: string): Group | null {
  const row = db.prepare(`SELECT ${GROUP_COLUMNS} FROM groups_ WHERE id = ?`).get(id) as GroupRow | undefined;
  return row ? rowToGroup(row) : null;
}

export function addGroup(name: string): Group {
  const id = uid('g');
  const cleanName = name.trim() || 'New location';
  const nextOrder = (db.prepare('SELECT COALESCE(MAX(sortOrder), -1) + 1 as n FROM groups_').get() as { n: number }).n;
  db.prepare('INSERT INTO groups_ (id, name, defaultPlaylist, forcedContentId, forcedAnnouncementId, sortOrder, blackout) VALUES (?,?,?,?,?,?,0)').run(id, cleanName, '[]', null, null, nextOrder);
  return { id, name: cleanName, defaultPlaylist: [], events: [], forcedContentId: null, forcedAnnouncementId: null, announcementSchedules: [], blackout: false };
}

/** Persists a full drag-and-drop reorder of locations from the Home screen — mirrors reorderLibrary. */
export const reorderGroups = db.transaction((ids: string[]): void => {
  const setOrder = db.prepare('UPDATE groups_ SET sortOrder = ? WHERE id = ?');
  ids.forEach((id, i) => setOrder.run(i, id));
  const rest = db.prepare('SELECT id FROM groups_ WHERE id NOT IN (SELECT value FROM json_each(?)) ORDER BY sortOrder ASC').all(JSON.stringify(ids)) as { id: string }[];
  rest.forEach((r, i) => setOrder.run(ids.length + i, r.id));
});

export function setGroupBlackout(groupId: string, blackout: boolean): void {
  db.prepare('UPDATE groups_ SET blackout = ? WHERE id = ?').run(blackout ? 1 : 0, groupId);
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
  db.prepare('INSERT INTO events (id, groupId, name, start, end, libIds, startTime, endTime) VALUES (?,?,?,?,?,?,?,?)').run(
    id, groupId, event.name, event.start, event.end, JSON.stringify(event.libIds), event.startTime ?? null, event.endTime ?? null,
  );
  return { id, ...event };
}

export function removeEvent(groupId: string, eventId: string): void {
  db.prepare('DELETE FROM events WHERE id = ? AND groupId = ?').run(eventId, groupId);
}

export function setForcedContent(groupId: string, libId: string | null): void {
  db.prepare('UPDATE groups_ SET forcedContentId = ? WHERE id = ?').run(libId, groupId);
}

export function setForcedAnnouncement(groupId: string, announcementId: string | null): void {
  db.prepare('UPDATE groups_ SET forcedAnnouncementId = ? WHERE id = ?').run(announcementId, groupId);
}

export function addAnnouncementSchedule(groupId: string, input: Omit<AnnouncementSchedule, 'id'>): AnnouncementSchedule {
  const id = uid('as');
  db.prepare('INSERT INTO announcement_schedules (id, groupId, announcementId, startDate, endDate, startTime, endTime) VALUES (?,?,?,?,?,?,?)')
    .run(id, groupId, input.announcementId, input.startDate, input.endDate, input.startTime, input.endTime);
  return { id, ...input };
}

export function removeAnnouncementSchedule(groupId: string, scheduleId: string): void {
  db.prepare('DELETE FROM announcement_schedules WHERE id = ? AND groupId = ?').run(scheduleId, groupId);
}

// ---- Devices ----

interface DeviceRow {
  id: string; name: string; ip: string; mac: string | null; groupId: string | null; announcementId: string | null; announcementOn: number;
  videoQuality: Device['videoQuality']; lastSeenAt: number | null;
  tempC: number | null; throttled: string | null; uptimeSec: number | null; diskFreeMb: number | null; diskTotalMb: number | null;
  forcedContentId: string | null; blackout: number;
}

const DEVICE_COLUMNS = 'id, name, ip, mac, groupId, announcementId, announcementOn, videoQuality, lastSeenAt, tempC, throttled, uptimeSec, diskFreeMb, diskTotalMb, forcedContentId, blackout';

function statusFor(lastSeenAt: number | null): DeviceStatus {
  return lastSeenAt != null && Date.now() - lastSeenAt < ONLINE_WINDOW_MS ? 'online' : 'offline';
}

function rowToDevice(r: DeviceRow): Device {
  return {
    id: r.id, name: r.name, ip: r.ip, mac: r.mac, groupId: r.groupId,
    announcementId: r.announcementId, announcementOn: !!r.announcementOn, videoQuality: r.videoQuality,
    status: statusFor(r.lastSeenAt), lastSeenAt: r.lastSeenAt ?? undefined,
    tempC: r.tempC, throttled: r.throttled, uptimeSec: r.uptimeSec, diskFreeMb: r.diskFreeMb, diskTotalMb: r.diskTotalMb,
    forcedContentId: r.forcedContentId, blackout: !!r.blackout,
  };
}

export function listDevices(): Device[] {
  const rows = db.prepare(`SELECT ${DEVICE_COLUMNS} FROM devices ORDER BY rowid ASC`).all() as DeviceRow[];
  return rows.map(rowToDevice);
}

export function getDevice(id: string): Device | null {
  const row = db.prepare(`SELECT ${DEVICE_COLUMNS} FROM devices WHERE id = ?`).get(id) as DeviceRow | undefined;
  return row ? rowToDevice(row) : null;
}

export function pairDevice(input: { name: string; ip: string; mac?: string | null; groupId: string | null; status?: DeviceStatus }): Device {
  const id = uid('d');
  const lastSeenAt = input.status === 'offline' ? null : Date.now();
  const mac = input.mac ?? null;
  db.prepare('INSERT INTO devices (id, name, ip, mac, groupId, announcementId, announcementOn, videoQuality, lastSeenAt) VALUES (?,?,?,?,?,?,0,?,?)').run(id, input.name, input.ip, mac, input.groupId, null, 'auto', lastSeenAt);
  return {
    id, name: input.name, ip: input.ip, mac, groupId: input.groupId, announcementId: null, announcementOn: false,
    videoQuality: 'auto', status: statusFor(lastSeenAt), forcedContentId: null, blackout: false,
  };
}

export function setDeviceForcedContent(id: string, libId: string | null): void {
  db.prepare('UPDATE devices SET forcedContentId = ? WHERE id = ?').run(libId, id);
}

export function setDeviceBlackout(id: string, blackout: boolean): void {
  db.prepare('UPDATE devices SET blackout = ? WHERE id = ?').run(blackout ? 1 : 0, id);
}

export function setDeviceVideoQuality(id: string, videoQuality: Device['videoQuality']): void {
  db.prepare('UPDATE devices SET videoQuality = ? WHERE id = ?').run(videoQuality, id);
}

export function renameDevice(id: string, name: string): void {
  if (!name.trim()) return;
  db.prepare('UPDATE devices SET name = ? WHERE id = ?').run(name.trim(), id);
}

export function moveDevice(id: string, groupId: string | null): void {
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

export interface HeartbeatDiagnostics {
  tempC?: number | null;
  throttled?: string | null;
  uptimeSec?: number | null;
  diskFreeMb?: number | null;
  diskTotalMb?: number | null;
}

export function recordHeartbeat(id: string, ip: string, diag?: HeartbeatDiagnostics): void {
  db.prepare('UPDATE devices SET lastSeenAt = ?, ip = ?, tempC = ?, throttled = ?, uptimeSec = ?, diskFreeMb = ?, diskTotalMb = ? WHERE id = ?').run(
    Date.now(), ip,
    diag?.tempC ?? null, diag?.throttled ?? null, diag?.uptimeSec ?? null, diag?.diskFreeMb ?? null, diag?.diskTotalMb ?? null,
    id,
  );
}

// ---- Content resolution (mirrors src/api/resolve.ts) ----

function toISODate(d: Date): string {
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function activeContentIds(group: Group, now: Date = new Date()): { ids: string[]; kind: 'blackout' | 'forced' | 'event' | 'default'; label: string } {
  // Highest priority, above even forced content — an emergency override meant to
  // win regardless of anything else configured for this location.
  if (group.blackout) return { ids: [], kind: 'blackout', label: 'Blackout' };
  if (group.forcedContentId) return { ids: [group.forcedContentId], kind: 'forced', label: 'Forced' };
  const today = toISODate(now);
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  // An event with no startTime/endTime runs all day, every day in [start, end] (the
  // original behavior); one with both set only replaces the default playlist during
  // that daily window — same "doesn't span midnight" string-compare caveat as
  // activeAnnouncementId's schedules below.
  const event = group.events.find((e) => {
    if (today < e.start || today > e.end) return false;
    if (e.startTime && e.endTime) return hhmm >= e.startTime && hhmm <= e.endTime;
    return true;
  });
  if (event) return { ids: event.libIds, kind: 'event', label: event.name };
  return { ids: group.defaultPlaylist, kind: 'default', label: 'Default playlist' };
}

// Resolution order, highest priority first: (1) forcedAnnouncementId — manually forced
// on for every screen at this location, same "until cleared" model as forced content;
// (2) an announcement schedule whose date range AND time-of-day window both cover
// `now` (string-compared "HH:MM" sorts the same as numeric comparison since it's
// always zero-padded 24h — doesn't handle a window that spans midnight, e.g.
// 22:00-02:00, by design: not a case this project's signage use targets); (3) null,
// meaning each device's own manual announcementId/announcementOn toggle applies
// instead (see getPlayerState below) — this location-level resolution only ever
// overrides that per-device toggle, never replaces it as the base behavior.
export function activeAnnouncementId(group: Group, now: Date = new Date()): string | null {
  if (group.forcedAnnouncementId) return group.forcedAnnouncementId;
  const today = toISODate(now);
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const active = group.announcementSchedules.find(
    (s) => today >= s.startDate && today <= s.endDate && hhmm >= s.startTime && hhmm <= s.endTime,
  );
  return active?.announcementId ?? null;
}

// A screen not assigned to any location has no schedule/default playlist to fall
// back on — just its own forcedContentId/blackout, the misc-screen equivalents of
// a location's controls (see Device.forcedContentId's comment in types.ts).
function activeContentIdsForDevice(device: Device): { ids: string[]; kind: 'blackout' | 'forced' | 'default'; label: string } {
  if (device.blackout) return { ids: [], kind: 'blackout', label: 'Blackout' };
  if (device.forcedContentId) return { ids: [device.forcedContentId], kind: 'forced', label: 'Forced' };
  return { ids: [], kind: 'default', label: 'No content' };
}

export function getPlayerState(deviceId: string): PlayerState | null {
  const device = getDevice(deviceId);
  if (!device) return null;
  const group = device.groupId ? getGroup(device.groupId) : null;
  if (device.groupId && !group) return null;

  const active = group ? activeContentIds(group) : activeContentIdsForDevice(device);
  const libraryById = new Map(listLibrary().map((item) => [item.id, item]));
  const items = active.ids
    .map((id) => libraryById.get(id))
    .filter((item): item is LibraryItem => !!item)
    .map((item) => ({
      id: item.id,
      type: item.type,
      // This screen's own preference wins for video: 'full' always gets the original
      // upload; otherwise the resolution-capped copy once one exists, falling back to
      // the original while it's still processing or if capping failed outright.
      url: (item.type === 'video' && device.videoQuality === 'full' ? item.fullUrl : undefined) ?? item.thumb ?? item.fullUrl ?? '',
      duration: item.type === 'video' ? null : item.type === 'image' || item.type === 'clock' ? (item.durationSec ?? 8) : 8,
      ...(item.type === 'pdf' && { pageCount: item.pageCount ?? 1 }),
    }));

  // Blackout means a genuinely blank screen — even the announcement ticker goes
  // dark, since the whole point is an emergency "nothing shows here" state, not
  // just swapping out the main content.
  if (active.kind === 'blackout') {
    return { kind: 'blackout', label: active.label, items: [], announcement: { on: false, text: null } };
  }

  // Location-level forced/scheduled announcement overrides this device's own manual
  // toggle when active; otherwise the device's own announcementId/announcementOn
  // applies exactly as before. No location at all (group is null) means there's
  // nothing to override with — the device's own toggle is the only source.
  const locationAnnouncementId = group ? activeAnnouncementId(group) : null;
  const announcementId = locationAnnouncementId ?? device.announcementId;
  const announcementOn = locationAnnouncementId != null || device.announcementOn;
  const announcement = announcementId ? libraryById.get(announcementId) : undefined;
  return {
    kind: active.kind,
    label: active.label,
    items,
    announcement: { on: announcementOn && !!announcement, text: announcement?.text ?? null },
  };
}

// ---- Backup / restore ----

export interface Backup {
  version: 1;
  exportedAt: string;
  library: LibraryItem[];
  groups: Group[];
  devices: Device[];
}

/** Full snapshot of everything the control app manages — content metadata, locations/playlists/schedules, and paired screens (name, IP, MAC, settings). Uploaded media files themselves aren't included (they're not JSON-portable); back up hub/data/uploads separately if you need those too. */
export function exportBackup(): Backup {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    library: listLibrary(),
    groups: listGroups(),
    devices: listDevices(),
  };
}

/**
 * Wipes and replaces every table from a previously exported backup, preserving every
 * id exactly — library items, groups, events, announcement schedules, and devices
 * all cross-reference each other by id (a group's defaultPlaylist/forcedContentId
 * point at library ids, a device's groupId points at a group), and a fresh uid() per
 * row the way addLibraryItem/addGroup/pairDevice normally generate one would
 * silently break every one of those references. Restored devices come back offline
 * (lastSeenAt cleared) until each Pi's own poller heartbeats again, rather than
 * presenting stale liveness state as current.
 */
export const restoreBackup = db.transaction((backup: Pick<Backup, 'library' | 'groups' | 'devices'>): void => {
  db.prepare('DELETE FROM events').run();
  db.prepare('DELETE FROM announcement_schedules').run();
  db.prepare('DELETE FROM devices').run();
  db.prepare('DELETE FROM groups_').run();
  db.prepare('DELETE FROM library').run();

  const insertLibrary = db.prepare(
    'INSERT INTO library (id, name, type, size, duration, durationSec, thumb, text, pageCount, fullUrl, transcodeStatus, tags, sortOrder, createdAt) ' +
    'VALUES (@id,@name,@type,@size,@duration,@durationSec,@thumb,@text,@pageCount,@fullUrl,@transcodeStatus,@tags,@sortOrder,@createdAt)',
  );
  backup.library.forEach((item, i) => {
    insertLibrary.run({
      id: item.id, name: item.name, type: item.type,
      size: item.size ?? null, duration: item.duration ?? null, durationSec: item.durationSec ?? null,
      thumb: item.thumb ?? null, text: item.text ?? null, pageCount: item.pageCount ?? null,
      fullUrl: item.fullUrl ?? null, transcodeStatus: item.transcodeStatus ?? null, tags: JSON.stringify(item.tags ?? []),
      sortOrder: i, createdAt: Date.now() + i, // +i keeps insertion order stable if createdAt is ever read as a tiebreaker
    });
  });

  const insertGroup = db.prepare(
    'INSERT INTO groups_ (id, name, defaultPlaylist, forcedContentId, forcedAnnouncementId, sortOrder, blackout) VALUES (@id,@name,@defaultPlaylist,@forcedContentId,@forcedAnnouncementId,@sortOrder,@blackout)',
  );
  const insertEvent = db.prepare(
    'INSERT INTO events (id, groupId, name, start, end, libIds, startTime, endTime) VALUES (@id,@groupId,@name,@start,@end,@libIds,@startTime,@endTime)',
  );
  const insertAnnSchedule = db.prepare(
    'INSERT INTO announcement_schedules (id, groupId, announcementId, startDate, endDate, startTime, endTime) VALUES (@id,@groupId,@announcementId,@startDate,@endDate,@startTime,@endTime)',
  );
  backup.groups.forEach((group, i) => {
    insertGroup.run({
      id: group.id, name: group.name, defaultPlaylist: JSON.stringify(group.defaultPlaylist),
      forcedContentId: group.forcedContentId, forcedAnnouncementId: group.forcedAnnouncementId,
      sortOrder: i, blackout: group.blackout ? 1 : 0,
    });
    for (const event of group.events) {
      insertEvent.run({
        id: event.id, groupId: group.id, name: event.name, start: event.start, end: event.end, libIds: JSON.stringify(event.libIds),
        startTime: event.startTime ?? null, endTime: event.endTime ?? null,
      });
    }
    for (const s of group.announcementSchedules) {
      insertAnnSchedule.run({
        id: s.id, groupId: group.id, announcementId: s.announcementId,
        startDate: s.startDate, endDate: s.endDate, startTime: s.startTime, endTime: s.endTime,
      });
    }
  });

  const insertDevice = db.prepare(
    'INSERT INTO devices (id, name, ip, mac, groupId, announcementId, announcementOn, videoQuality, lastSeenAt, forcedContentId, blackout) ' +
    'VALUES (@id,@name,@ip,@mac,@groupId,@announcementId,@announcementOn,@videoQuality,NULL,@forcedContentId,@blackout)',
  );
  for (const device of backup.devices) {
    insertDevice.run({
      id: device.id, name: device.name, ip: device.ip, mac: device.mac, groupId: device.groupId,
      announcementId: device.announcementId, announcementOn: device.announcementOn ? 1 : 0, videoQuality: device.videoQuality,
      forcedContentId: device.forcedContentId ?? null, blackout: device.blackout ? 1 : 0,
    });
  }
});
