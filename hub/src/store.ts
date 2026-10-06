import { randomUUID } from 'node:crypto';
import { db } from './db.js';
import * as tflStatus from './tflStatus.js';
import * as tflArrivals from './tflArrivals.js';
import type { ActionEvent, AnnouncementSchedule, Device, DeviceStatus, Folder, Group, LibraryItem, Location, PlayerState, ScheduleEvent, TflStationConfig, UpdateEvent } from './types.js';

// The Pi heartbeats every 5s (pi-player/src/poller.ts's POLL_INTERVAL_MS) — this
// window needs to be a few multiples of that so one dropped heartbeat (WiFi jitter)
// doesn't flip a screen to "Offline" and back on its own, but not so wide that a
// real disconnect takes forever to show up. 12s tolerates one missed heartbeat.
const ONLINE_WINDOW_MS = 12_000;

function uid(prefix: string): string {
  return `${prefix}${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

// ---- Library ----

interface LibraryRow {
  id: string; name: string; type: LibraryItem['type']; size: string | null; duration: string | null; durationSec: number | null; thumb: string | null; text: string | null; pageCount: number | null;
  fullUrl: string | null; posterUrl: string | null; transcodeStatus: LibraryItem['transcodeStatus'] | null; tags: string; ndiSourceName: string | null; tflModes: string | null;
  // The three legacy single-station columns are read-only from here on (kept only
  // for rowToLibraryItem's fallback below) — new rows always write tflStations
  // instead. See db.ts's tflStations migration comment for why the old columns
  // aren't dropped.
  tflStopPointId: string | null; tflStopPointName: string | null; tflArrivalLines: string | null;
  tflStations: string | null;
  folderId: string | null;
  createdAt: number | null;
}
const LIBRARY_COLUMNS = 'id, name, type, size, duration, durationSec, thumb, text, pageCount, fullUrl, posterUrl, transcodeStatus, tags, ndiSourceName, tflModes, tflStopPointId, tflStopPointName, tflArrivalLines, tflStations, folderId, createdAt';

function rowToLibraryItem(r: LibraryRow): LibraryItem {
  const item: LibraryItem = { id: r.id, name: r.name, type: r.type, tags: r.tags ? JSON.parse(r.tags) : [] };
  if (r.folderId != null) item.folderId = r.folderId;
  if (r.createdAt != null) item.createdAt = r.createdAt;
  if (r.size != null) item.size = r.size;
  if (r.duration != null) item.duration = r.duration;
  if (r.durationSec != null) item.durationSec = r.durationSec;
  if (r.thumb != null) item.thumb = r.thumb;
  if (r.text != null) item.text = r.text;
  if (r.pageCount != null) item.pageCount = r.pageCount;
  if (r.fullUrl != null) item.fullUrl = r.fullUrl;
  if (r.posterUrl != null) item.posterUrl = r.posterUrl;
  if (r.transcodeStatus != null) item.transcodeStatus = r.transcodeStatus;
  if (r.ndiSourceName != null) item.ndiSourceName = r.ndiSourceName;
  if (r.tflModes != null) item.tflModes = JSON.parse(r.tflModes);
  if (r.tflStations != null) {
    item.tflStations = JSON.parse(r.tflStations);
  } else if (r.tflStopPointId != null) {
    // Pre-multi-station row (see db.ts's tflStations migration comment) — synthesize
    // the one-element array shape on read so an item saved before this feature
    // existed keeps working with no manual migration.
    item.tflStations = [{
      stopPointId: r.tflStopPointId,
      stopPointName: r.tflStopPointName ?? r.tflStopPointId,
      ...(r.tflArrivalLines != null && { lines: JSON.parse(r.tflArrivalLines) }),
    }];
  }
  return item;
}

export function listLibrary(): LibraryItem[] {
  const rows = db.prepare(`SELECT ${LIBRARY_COLUMNS} FROM library ORDER BY sortOrder ASC`).all() as LibraryRow[];
  return rows.map(rowToLibraryItem);
}

export function addLibraryItem(input: {
  name: string; type: LibraryItem['type']; size?: string; duration?: string; thumb?: string; text?: string; pageCount?: number;
  fullUrl?: string; posterUrl?: string; transcodeStatus?: LibraryItem['transcodeStatus']; ndiSourceName?: string; tflModes?: string[];
  tflStations?: TflStationConfig[];
}): LibraryItem {
  const id = uid('l');
  const nextOrder = (db.prepare('SELECT COALESCE(MAX(sortOrder), -1) + 1 as n FROM library').get() as { n: number }).n;
  const createdAt = Date.now();
  db.prepare('INSERT INTO library (id, name, type, size, duration, thumb, text, pageCount, fullUrl, posterUrl, transcodeStatus, ndiSourceName, tflModes, tflStations, sortOrder, createdAt) VALUES (@id,@name,@type,@size,@duration,@thumb,@text,@pageCount,@fullUrl,@posterUrl,@transcodeStatus,@ndiSourceName,@tflModes,@tflStations,@sortOrder,@createdAt)').run({
    id, name: input.name, type: input.type,
    size: input.size ?? null, duration: input.duration ?? null, thumb: input.thumb ?? null, text: input.text ?? null, pageCount: input.pageCount ?? null,
    fullUrl: input.fullUrl ?? null, posterUrl: input.posterUrl ?? null, transcodeStatus: input.transcodeStatus ?? null, ndiSourceName: input.ndiSourceName ?? null,
    tflModes: input.tflModes ? JSON.stringify(input.tflModes) : null,
    tflStations: input.tflStations ? JSON.stringify(input.tflStations) : null,
    sortOrder: nextOrder,
    createdAt,
  });
  return {
    id, name: input.name, type: input.type, tags: [], createdAt,
    ...(input.size && { size: input.size }), ...(input.duration && { duration: input.duration }),
    ...(input.thumb && { thumb: input.thumb }), ...(input.text && { text: input.text }), ...(input.pageCount != null && { pageCount: input.pageCount }),
    ...(input.fullUrl && { fullUrl: input.fullUrl }), ...(input.posterUrl && { posterUrl: input.posterUrl }),
    ...(input.transcodeStatus && { transcodeStatus: input.transcodeStatus }),
    ...(input.ndiSourceName && { ndiSourceName: input.ndiSourceName }),
    ...(input.tflModes && { tflModes: input.tflModes }),
    ...(input.tflStations && { tflStations: input.tflStations }),
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
  const groups = db.prepare('SELECT id, defaultPlaylist, forcedPlaylist, forcedContentId, forcedAnnouncementId FROM groups_').all() as { id: string; defaultPlaylist: string; forcedPlaylist: string | null; forcedContentId: string | null; forcedAnnouncementId: string | null }[];
  const updatePlaylist = db.prepare('UPDATE groups_ SET defaultPlaylist = ? WHERE id = ?');
  const updateForcedPlaylist = db.prepare('UPDATE groups_ SET forcedPlaylist = ?, forcedContentId = ? WHERE id = ?');
  const clearForcedAnnouncement = db.prepare('UPDATE groups_ SET forcedAnnouncementId = NULL WHERE id = ?');
  for (const g of groups) {
    const playlist: string[] = JSON.parse(g.defaultPlaylist);
    if (playlist.includes(id)) updatePlaylist.run(JSON.stringify(playlist.filter((x) => x !== id)), g.id);
    const forced = parseForcedPlaylist(g);
    if (forced.includes(id)) {
      const next = forced.filter((x) => x !== id);
      updateForcedPlaylist.run(JSON.stringify(next), next[0] ?? null, g.id);
    }
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
  const devicesWithPlaylist = db.prepare('SELECT id, defaultPlaylist, forcedPlaylist, forcedContentId FROM devices').all() as { id: string; defaultPlaylist: string; forcedPlaylist: string | null; forcedContentId: string | null }[];
  const updateDevicePlaylist = db.prepare('UPDATE devices SET defaultPlaylist = ? WHERE id = ?');
  const updateDeviceForcedPlaylist = db.prepare('UPDATE devices SET forcedPlaylist = ?, forcedContentId = ? WHERE id = ?');
  for (const d of devicesWithPlaylist) {
    const playlist: string[] = JSON.parse(d.defaultPlaylist);
    if (playlist.includes(id)) updateDevicePlaylist.run(JSON.stringify(playlist.filter((x) => x !== id)), d.id);
    const forced = parseForcedPlaylist(d);
    if (forced.includes(id)) {
      const next = forced.filter((x) => x !== id);
      updateDeviceForcedPlaylist.run(JSON.stringify(next), next[0] ?? null, d.id);
    }
  }
  db.prepare('DELETE FROM library WHERE id = ?').run(id);
}

export function setItemDuration(id: string, durationSec: number): void {
  db.prepare("UPDATE library SET durationSec = ? WHERE id = ? AND type IN ('image', 'clock', 'ndi', 'tfl-status', 'tfl-arrivals')").run(durationSec, id);
}

export function renameLibraryItem(id: string, name: string): void {
  db.prepare('UPDATE library SET name = ? WHERE id = ?').run(name, id);
}

export function setLibraryItemTags(id: string, tags: string[]): void {
  const clean = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
  db.prepare('UPDATE library SET tags = ? WHERE id = ?').run(JSON.stringify(clean), id);
}

/** Reconfigures an existing 'ndi' item's source name — see AddNdiSourceDialog.tsx's edit mode, same "change it in place" reasoning as the two TfL setters below. */
export function setLibraryItemNdiSourceName(id: string, ndiSourceName: string): void {
  db.prepare("UPDATE library SET ndiSourceName = ? WHERE id = ? AND type = 'ndi'").run(ndiSourceName, id);
}

/** Reconfigures an existing 'tfl-status' item's modes — see AddTflStatusDialog.tsx, now reused in an edit mode rather than only at creation time. */
export function setLibraryItemTflModes(id: string, tflModes: string[]): void {
  db.prepare("UPDATE library SET tflModes = ? WHERE id = ? AND type = 'tfl-status'").run(JSON.stringify(tflModes), id);
}

/** Reconfigures an existing 'tfl-arrivals' item's whole station list (add/remove a station, or change one's line filter) — see AddTflArrivalsDialog.tsx's edit mode. A full replace, not a merge, same as setLibraryItemTflModes above. */
export function setLibraryItemTflStations(id: string, tflStations: TflStationConfig[]): void {
  db.prepare("UPDATE library SET tflStations = ? WHERE id = ? AND type = 'tfl-arrivals'").run(JSON.stringify(tflStations), id);
}

/** Files a library item under a folder, or `null` to move it back to the library root — see LibraryScreen.tsx's drag-and-drop and "Move to folder" action. Every item type can be foldered; this is purely organizational and has no effect on playback. */
export function setLibraryItemFolder(id: string, folderId: string | null): void {
  db.prepare('UPDATE library SET folderId = ? WHERE id = ?').run(folderId, id);
}

// ---- Folders ----

interface FolderRow { id: string; name: string; parentId: string | null; createdAt: number | null }
const FOLDER_COLUMNS = 'id, name, parentId, createdAt';

function rowToFolder(r: FolderRow): Folder {
  return { id: r.id, name: r.name, parentId: r.parentId, ...(r.createdAt != null && { createdAt: r.createdAt }) };
}

export function listFolders(): Folder[] {
  const rows = db.prepare(`SELECT ${FOLDER_COLUMNS} FROM folders ORDER BY name COLLATE NOCASE ASC`).all() as FolderRow[];
  return rows.map(rowToFolder);
}

export function addFolder(name: string, parentId: string | null): Folder {
  const id = uid('f');
  const cleanName = name.trim() || 'New folder';
  const createdAt = Date.now();
  db.prepare('INSERT INTO folders (id, name, parentId, createdAt) VALUES (?,?,?,?)').run(id, cleanName, parentId, createdAt);
  return { id, name: cleanName, parentId, createdAt };
}

export function renameFolder(id: string, name: string): void {
  if (!name.trim()) return;
  db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(name.trim(), id);
}

/** True if moving `id` under `newParentId` would nest it inside its own subtree (itself included) — walks newParentId's own ancestor chain looking for `id`. Called before every move so a folder can never become its own descendant. */
function wouldCreateCycle(folders: Folder[], id: string, newParentId: string | null): boolean {
  let current = newParentId;
  while (current != null) {
    if (current === id) return true;
    current = folders.find((f) => f.id === current)?.parentId ?? null;
  }
  return false;
}

/** Moves a folder under a new parent (`null` = top level). Returns false (no-op) rather than throwing if this would create a cycle, since that's an expected, recoverable user action (e.g. a stray drag) — the route layer turns a false into a 409. */
export function moveFolder(id: string, parentId: string | null): boolean {
  if (wouldCreateCycle(listFolders(), id, parentId)) return false;
  db.prepare('UPDATE folders SET parentId = ? WHERE id = ?').run(parentId, id);
  return true;
}

/**
 * Deletes a folder WITHOUT deleting its contents — every subfolder and library item
 * filed directly under it moves up to the deleted folder's own parent (or the root,
 * if it had none), same "flatten up one level" behavior as removing a folder in a
 * normal file browser while keeping the files. A destructive "delete everything
 * inside" was deliberately not built — losing library items (which may still be
 * referenced by a playlist/schedule elsewhere) as a side effect of tidying up folders
 * would be a much worse failure mode than a folder move.
 */
export const removeFolder = db.transaction((id: string): void => {
  const row = db.prepare('SELECT parentId FROM folders WHERE id = ?').get(id) as { parentId: string | null } | undefined;
  if (!row) return;
  db.prepare('UPDATE folders SET parentId = ? WHERE parentId = ?').run(row.parentId, id);
  db.prepare('UPDATE library SET folderId = ? WHERE folderId = ?').run(row.parentId, id);
  db.prepare('DELETE FROM folders WHERE id = ?').run(id);
});

// ---- Locations ----
// Purely organizational — see types.ts's Location. No content/schedule of its own;
// holds Groups and standalone screens for browsing/managing a whole site at once.

interface LocationRow { id: string; name: string }
const LOCATION_COLUMNS = 'id, name';

function rowToLocation(r: LocationRow): Location {
  return { id: r.id, name: r.name };
}

export function listLocations(): Location[] {
  const rows = db.prepare(`SELECT ${LOCATION_COLUMNS} FROM locations ORDER BY sortOrder ASC`).all() as LocationRow[];
  return rows.map(rowToLocation);
}

export function addLocation(name: string): Location {
  const id = uid('loc');
  const cleanName = name.trim() || 'New location';
  const nextOrder = (db.prepare('SELECT COALESCE(MAX(sortOrder), -1) + 1 as n FROM locations').get() as { n: number }).n;
  db.prepare('INSERT INTO locations (id, name, sortOrder) VALUES (?,?,?)').run(id, cleanName, nextOrder);
  return { id, name: cleanName };
}

export function renameLocation(id: string, name: string): void {
  if (!name.trim()) return;
  db.prepare('UPDATE locations SET name = ? WHERE id = ?').run(name.trim(), id);
}

/** Persists a full drag-and-drop/up-down reorder of locations — mirrors reorderGroups. */
export const reorderLocations = db.transaction((ids: string[]): void => {
  const setOrder = db.prepare('UPDATE locations SET sortOrder = ? WHERE id = ?');
  ids.forEach((id, i) => setOrder.run(i, id));
  const rest = db.prepare('SELECT id FROM locations WHERE id NOT IN (SELECT value FROM json_each(?)) ORDER BY sortOrder ASC').all(JSON.stringify(ids)) as { id: string }[];
  rest.forEach((r, i) => setOrder.run(ids.length + i, r.id));
});

/**
 * Deletes a Location WITHOUT touching anything filed under it — every Group and
 * standalone screen that referenced it just becomes un-filed (locationId back to
 * null), same "never destroy content over a tidy-up action" reasoning as
 * removeFolder. Nothing here owns any content for this to lose in the first place,
 * but the "don't cascade-delete real things" principle still applies to the
 * screens/groups themselves.
 */
export const removeLocation = db.transaction((id: string): void => {
  db.prepare('UPDATE groups_ SET locationId = NULL WHERE locationId = ?').run(id);
  db.prepare('UPDATE devices SET locationId = NULL WHERE locationId = ?').run(id);
  db.prepare('DELETE FROM locations WHERE id = ?').run(id);
});

// ---- Groups ----

interface GroupRow { id: string; name: string; locationId: string | null; defaultPlaylist: string; forcedPlaylist: string | null; forcedContentId: string | null; forcedAnnouncementId: string | null; blackout: number }
const GROUP_COLUMNS = 'id, name, locationId, defaultPlaylist, forcedPlaylist, forcedContentId, forcedAnnouncementId, blackout';

// A row saved before forcedPlaylist existed has it NULL — fall back to synthesizing
// a one-element array from the old forcedContentId column (see db.ts's migration
// comment). Once anything writes through setForcedPlaylist, forcedPlaylist is never
// NULL again for that row.
function parseForcedPlaylist(r: { forcedPlaylist: string | null; forcedContentId: string | null }): string[] {
  return r.forcedPlaylist != null ? JSON.parse(r.forcedPlaylist) : r.forcedContentId ? [r.forcedContentId] : [];
}
interface EventRow { id: string; groupId: string | null; deviceId: string | null; name: string; start: string; end: string; libIds: string; startTime: string | null; endTime: string | null; daysOfWeek: string | null }
interface AnnouncementScheduleRow { id: string; groupId: string; announcementId: string; startDate: string; endDate: string; startTime: string; endTime: string }

function eventsForGroup(groupId: string): ScheduleEvent[] {
  const rows = db.prepare('SELECT id, groupId, deviceId, name, start, end, libIds, startTime, endTime, daysOfWeek FROM events WHERE groupId = ? ORDER BY start ASC').all(groupId) as EventRow[];
  return rows.map((r) => ({
    id: r.id, name: r.name, start: r.start, end: r.end, libIds: JSON.parse(r.libIds),
    startTime: r.startTime ?? undefined, endTime: r.endTime ?? undefined,
    daysOfWeek: r.daysOfWeek ? JSON.parse(r.daysOfWeek) : undefined,
  }));
}

/** Mirrors eventsForGroup — see Device.events' comment in types.ts. */
function eventsForDevice(deviceId: string): ScheduleEvent[] {
  const rows = db.prepare('SELECT id, groupId, deviceId, name, start, end, libIds, startTime, endTime, daysOfWeek FROM events WHERE deviceId = ? ORDER BY start ASC').all(deviceId) as EventRow[];
  return rows.map((r) => ({
    id: r.id, name: r.name, start: r.start, end: r.end, libIds: JSON.parse(r.libIds),
    startTime: r.startTime ?? undefined, endTime: r.endTime ?? undefined,
    daysOfWeek: r.daysOfWeek ? JSON.parse(r.daysOfWeek) : undefined,
  }));
}

function announcementSchedulesForGroup(groupId: string): AnnouncementSchedule[] {
  const rows = db.prepare('SELECT id, groupId, announcementId, startDate, endDate, startTime, endTime FROM announcement_schedules WHERE groupId = ? ORDER BY startDate ASC').all(groupId) as AnnouncementScheduleRow[];
  return rows.map((r) => ({ id: r.id, announcementId: r.announcementId, startDate: r.startDate, endDate: r.endDate, startTime: r.startTime, endTime: r.endTime }));
}

function rowToGroup(r: GroupRow): Group {
  const forcedPlaylist = parseForcedPlaylist(r);
  return {
    id: r.id, name: r.name, locationId: r.locationId, defaultPlaylist: JSON.parse(r.defaultPlaylist), events: eventsForGroup(r.id),
    forcedPlaylist, forcedContentId: forcedPlaylist[0] ?? null,
    forcedAnnouncementId: r.forcedAnnouncementId, announcementSchedules: announcementSchedulesForGroup(r.id),
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

export function addGroup(name: string, locationId: string | null = null): Group {
  const id = uid('g');
  const cleanName = name.trim() || 'New group';
  const nextOrder = (db.prepare('SELECT COALESCE(MAX(sortOrder), -1) + 1 as n FROM groups_').get() as { n: number }).n;
  db.prepare('INSERT INTO groups_ (id, name, locationId, defaultPlaylist, forcedPlaylist, forcedContentId, forcedAnnouncementId, sortOrder, blackout) VALUES (?,?,?,?,?,?,?,?,0)').run(id, cleanName, locationId, '[]', '[]', null, null, nextOrder);
  return { id, name: cleanName, locationId, defaultPlaylist: [], events: [], forcedPlaylist: [], forcedContentId: null, forcedAnnouncementId: null, announcementSchedules: [], blackout: false };
}

/** Files an existing group under a Location, or `null` to un-file it — purely organizational, has no effect on its content. */
export function setGroupLocation(groupId: string, locationId: string | null): void {
  db.prepare('UPDATE groups_ SET locationId = ? WHERE id = ?').run(locationId, groupId);
}

/** Persists a full drag-and-drop reorder of groups from the Home screen — mirrors reorderLibrary. */
export const reorderGroups = db.transaction((ids: string[]): void => {
  const setOrder = db.prepare('UPDATE groups_ SET sortOrder = ? WHERE id = ?');
  ids.forEach((id, i) => setOrder.run(i, id));
  const rest = db.prepare('SELECT id FROM groups_ WHERE id NOT IN (SELECT value FROM json_each(?)) ORDER BY sortOrder ASC').all(JSON.stringify(ids)) as { id: string }[];
  rest.forEach((r, i) => setOrder.run(ids.length + i, r.id));
});

export function setGroupBlackout(groupId: string, blackout: boolean): void {
  db.prepare('UPDATE groups_ SET blackout = ? WHERE id = ?').run(blackout ? 1 : 0, groupId);
  const group = getGroup(groupId);
  if (group) recordActionEvent({ scope: 'group', targetId: groupId, targetName: group.name, action: blackout ? 'blackout' : 'clearBlackout', detail: null });
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
  db.prepare('INSERT INTO events (id, groupId, deviceId, name, start, end, libIds, startTime, endTime, daysOfWeek) VALUES (?,?,NULL,?,?,?,?,?,?,?)').run(
    id, groupId, event.name, event.start, event.end, JSON.stringify(event.libIds), event.startTime ?? null, event.endTime ?? null,
    event.daysOfWeek && event.daysOfWeek.length > 0 ? JSON.stringify(event.daysOfWeek) : null,
  );
  return { id, ...event };
}

export function removeEvent(groupId: string, eventId: string): void {
  db.prepare('DELETE FROM events WHERE id = ? AND groupId = ?').run(eventId, groupId);
}

/** Sets the group's full forced playlist, replacing whatever was there — pass `[]` to go back to the rolling schedule. Keeps the deprecated forcedContentId column in sync (its first item, or null when empty) for older API consumers — see types.ts's comment on it. */
export function setForcedPlaylist(groupId: string, libIds: string[]): void {
  db.prepare('UPDATE groups_ SET forcedPlaylist = ?, forcedContentId = ? WHERE id = ?').run(JSON.stringify(libIds), libIds[0] ?? null, groupId);
  const group = getGroup(groupId);
  if (group) {
    recordActionEvent({
      scope: 'group', targetId: groupId, targetName: group.name,
      action: libIds.length > 0 ? 'forceContent' : 'clearForceContent',
      detail: libIds.length > 0 ? forcedPlaylistLabel(libIds) : null,
    });
  }
}

/** @deprecated Single-item convenience wrapper around setForcedPlaylist, kept for the Companion module's existing action — see types.ts's Group.forcedContentId comment. */
export function setForcedContent(groupId: string, libId: string | null): void {
  setForcedPlaylist(groupId, libId ? [libId] : []);
}

export function addToForcedPlaylist(groupId: string, libIds: string[]): void {
  const group = getGroup(groupId);
  if (!group) return;
  const merged = [...group.forcedPlaylist, ...libIds.filter((id) => !group.forcedPlaylist.includes(id))];
  setForcedPlaylist(groupId, merged);
}

export function removeFromForcedPlaylist(groupId: string, libId: string): void {
  const group = getGroup(groupId);
  if (!group) return;
  setForcedPlaylist(groupId, group.forcedPlaylist.filter((id) => id !== libId));
}

export function reorderForcedPlaylist(groupId: string, libId: string, direction: 'up' | 'down'): void {
  const group = getGroup(groupId);
  if (!group) return;
  const idx = group.forcedPlaylist.indexOf(libId);
  const swapWith = direction === 'up' ? idx - 1 : idx + 1;
  if (idx < 0 || swapWith < 0 || swapWith >= group.forcedPlaylist.length) return;
  const list = [...group.forcedPlaylist];
  [list[idx], list[swapWith]] = [list[swapWith], list[idx]];
  setForcedPlaylist(groupId, list);
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
  id: string; name: string; ip: string; mac: string | null; groupId: string | null; locationId: string | null; announcementId: string | null; announcementOn: number;
  videoQuality: Device['videoQuality']; lastSeenAt: number | null;
  tempC: number | null; throttled: string | null; uptimeSec: number | null; baseUptimeSec: number; diskFreeMb: number | null; diskTotalMb: number | null;
  forcedPlaylist: string | null; forcedContentId: string | null; blackout: number; defaultPlaylist: string; usbOverrideActive: number;
  playerStartedAt: number | null; version: string | null; offlineAlertsMuted: number;
}

const DEVICE_COLUMNS = 'id, name, ip, mac, groupId, locationId, announcementId, announcementOn, videoQuality, lastSeenAt, tempC, throttled, uptimeSec, baseUptimeSec, diskFreeMb, diskTotalMb, forcedPlaylist, forcedContentId, blackout, defaultPlaylist, usbOverrideActive, playerStartedAt, version, offlineAlertsMuted';

function statusFor(lastSeenAt: number | null): DeviceStatus {
  return lastSeenAt != null && Date.now() - lastSeenAt < ONLINE_WINDOW_MS ? 'online' : 'offline';
}

// null until the first heartbeat with diagnostics ever arrives (baseUptimeSec is
// still 0 and uptimeSec is still null) — see recordHeartbeat's reboot-detection
// comment for how baseUptimeSec accumulates.
function totalUptimeFor(r: { uptimeSec: number | null; baseUptimeSec: number }): number | null {
  return r.uptimeSec == null && r.baseUptimeSec === 0 ? null : r.baseUptimeSec + (r.uptimeSec ?? 0);
}

// The live "Updating…"/"Done"/"Failed" badge tracked here is in-memory only (not
// persisted — losing track of an in-progress update across a hub restart is an
// acceptable edge case for what's purely a UI progress indicator, not a
// correctness-critical record) and keyed by device id, so there's only ever one
// live badge per device. The *history* of every trigger is separately persisted to
// the update_events table below (see listUpdateEvents) so "what was updated when"
// survives a hub restart and isn't limited to one in-flight entry per device —
// eventId here just ties this tracker to the row it should resolve.
//
// Settings screen's Update/Re-provision buttons previously left a user with no
// way to tell whether anything was still happening, or whether it had finished —
// just an initial toast that faded away (see routes/devices.ts's /update and
// /reprovision, which call markUpdateTriggered on a successful trigger). This
// resolves 'updating' -> 'done' the moment a heartbeat reports a playerStartedAt
// newer than when the update was triggered — proof the player process actually
// restarted — or -> 'failed' once UPDATE_TIMEOUT_MS passes with no such heartbeat
// (self-update.sh/reprovision.sh failing partway through, e.g. a bad git pull or
// npm install, never reaches the restart/reboot at the end). A resolved status
// stays visible for UPDATE_RESOLVED_TTL_MS so the control app's polling (every 4s,
// see useAppState.ts) has a real chance to show it before it disappears.
interface UpdateTracker { status: 'updating' | 'done' | 'failed'; triggeredAt: number; resolvedAt?: number; eventId: string }
const updateTrackers = new Map<string, UpdateTracker>();
const UPDATE_TIMEOUT_MS = 5 * 60 * 1000;
const UPDATE_RESOLVED_TTL_MS = 30 * 1000;

export function markUpdateTriggered(id: string, deviceName: string, action: 'update' | 'reprovision'): void {
  const eventId = uid('ue');
  const triggeredAt = Date.now();
  db.prepare('INSERT INTO update_events (id, deviceId, deviceName, action, outcome, triggeredAt) VALUES (?,?,?,?,?,?)').run(
    eventId, id, deviceName, action, 'updating', triggeredAt,
  );
  updateTrackers.set(id, { status: 'updating', triggeredAt, eventId });
}

function resolveUpdateEvent(eventId: string, outcome: 'done' | 'failed'): void {
  db.prepare('UPDATE update_events SET outcome = ?, resolvedAt = ? WHERE id = ?').run(outcome, Date.now(), eventId);
}

function currentUpdateStatus(id: string): Device['updateStatus'] {
  const t = updateTrackers.get(id);
  if (!t) return undefined;
  if (t.status === 'updating' && Date.now() - t.triggeredAt > UPDATE_TIMEOUT_MS) {
    t.status = 'failed';
    t.resolvedAt = Date.now();
    resolveUpdateEvent(t.eventId, 'failed');
  }
  if (t.resolvedAt != null && Date.now() - t.resolvedAt > UPDATE_RESOLVED_TTL_MS) {
    updateTrackers.delete(id);
    return undefined;
  }
  return t.status;
}

/** Settings screen's "Update log" section — every trigger ever recorded, newest first, capped since this can grow without bound otherwise. Device names are a snapshot from trigger time (see db.ts's update_events comment), so this stays readable even for a since-renamed or since-removed device. */
export function listUpdateEvents(limit = 200): UpdateEvent[] {
  const rows = db.prepare('SELECT id, deviceId, deviceName, action, outcome, triggeredAt, resolvedAt FROM update_events ORDER BY triggeredAt DESC LIMIT ?').all(limit) as UpdateEvent[];
  return rows;
}

/** A short display label for a forced playlist — the one item's name, or "First item +2 more" once there's more than one. Mirrors src/api/resolve.ts's identical frontend helper, which exists purely for the control app's own UI; this copy is for action_events' snapshot, taken at write time so a later library rename/delete doesn't change what the history reads. */
function forcedPlaylistLabel(ids: string[]): string {
  const libraryById = new Map(listLibrary().map((item) => [item.id, item]));
  const items = ids.map((id) => libraryById.get(id)).filter((item): item is LibraryItem => !!item);
  if (items.length === 0) return '—';
  if (items.length === 1) return items[0].name;
  return `${items[0].name} +${items.length - 1} more`;
}

/** Logs one force-content/blackout change to the Settings screen's action history — see db.ts's action_events table comment for why this is called from every low-level setter (setForcedPlaylist/setGroupBlackout/setDeviceForcedPlaylist/setDeviceBlackout) rather than from the routes above them, so it captures a Companion module action the same as one from the control app's own dialogs. */
function recordActionEvent(input: { scope: ActionEvent['scope']; targetId: string; targetName: string; action: ActionEvent['action']; detail: string | null }): void {
  db.prepare('INSERT INTO action_events (id, scope, targetId, targetName, action, detail, triggeredAt) VALUES (?,?,?,?,?,?,?)').run(
    uid('ae'), input.scope, input.targetId, input.targetName, input.action, input.detail, Date.now(),
  );
}

/** Settings screen's action history — every force-content/blackout change ever recorded, newest first, capped like listUpdateEvents. targetName is a snapshot (see db.ts's action_events comment), so this stays readable for a since-renamed or since-deleted group/device. */
export function listActionEvents(limit = 200): ActionEvent[] {
  return db.prepare('SELECT id, scope, targetId, targetName, action, detail, triggeredAt FROM action_events ORDER BY triggeredAt DESC LIMIT ?').all(limit) as ActionEvent[];
}

function rowToDevice(r: DeviceRow): Device {
  const forcedPlaylist = parseForcedPlaylist(r);
  return {
    id: r.id, name: r.name, ip: r.ip, mac: r.mac, groupId: r.groupId, locationId: r.locationId,
    announcementId: r.announcementId, announcementOn: !!r.announcementOn, videoQuality: r.videoQuality,
    status: statusFor(r.lastSeenAt), lastSeenAt: r.lastSeenAt ?? undefined,
    tempC: r.tempC, throttled: r.throttled, uptimeSec: r.uptimeSec, totalUptimeSec: totalUptimeFor(r), diskFreeMb: r.diskFreeMb, diskTotalMb: r.diskTotalMb,
    forcedPlaylist, forcedContentId: forcedPlaylist[0] ?? null, blackout: !!r.blackout,
    defaultPlaylist: JSON.parse(r.defaultPlaylist), events: eventsForDevice(r.id),
    usbOverrideActive: !!r.usbOverrideActive, updateStatus: currentUpdateStatus(r.id), version: r.version,
    offlineAlertsMuted: !!r.offlineAlertsMuted,
  };
}

/** Settings/Home's "Mute offline alerts" action for a single screen — see types.ts's Device.offlineAlertsMuted. */
export function setDeviceOfflineAlertsMuted(id: string, muted: boolean): void {
  db.prepare('UPDATE devices SET offlineAlertsMuted = ? WHERE id = ?').run(muted ? 1 : 0, id);
}

export function listDevices(): Device[] {
  const rows = db.prepare(`SELECT ${DEVICE_COLUMNS} FROM devices ORDER BY sortOrder ASC, rowid ASC`).all() as DeviceRow[];
  return rows.map(rowToDevice);
}

export function getDevice(id: string): Device | null {
  const row = db.prepare(`SELECT ${DEVICE_COLUMNS} FROM devices WHERE id = ?`).get(id) as DeviceRow | undefined;
  return row ? rowToDevice(row) : null;
}

export function pairDevice(input: { name: string; ip: string; mac?: string | null; groupId: string | null; locationId?: string | null; status?: DeviceStatus }): Device {
  const id = uid('d');
  const lastSeenAt = input.status === 'offline' ? null : Date.now();
  const mac = input.mac ?? null;
  const locationId = input.locationId ?? null;
  // Scoped to this device's own group (or the standalone/no-group bucket, via IS —
  // SQLite's null-safe equality — for a null groupId) since sortOrder is only ever
  // compared within that scope; MAX ignores other groups' devices entirely, so a
  // new screen always lands last in ITS list, not last globally.
  const nextOrder = (db.prepare('SELECT COALESCE(MAX(sortOrder), -1) + 1 as n FROM devices WHERE groupId IS ?').get(input.groupId) as { n: number }).n;
  db.prepare('INSERT INTO devices (id, name, ip, mac, groupId, locationId, announcementId, announcementOn, videoQuality, lastSeenAt, sortOrder) VALUES (?,?,?,?,?,?,?,0,?,?,?)').run(id, input.name, input.ip, mac, input.groupId, locationId, null, 'auto', lastSeenAt, nextOrder);
  return {
    id, name: input.name, ip: input.ip, mac, groupId: input.groupId, locationId, announcementId: null, announcementOn: false,
    videoQuality: 'auto', status: statusFor(lastSeenAt), forcedPlaylist: [], forcedContentId: null, blackout: false,
    defaultPlaylist: [], events: [], offlineAlertsMuted: false,
  };
}

/** Sets the device's full forced playlist, replacing whatever was there — mirrors setForcedPlaylist, see its comment. Effective regardless of groupId: a grouped device's own forcedPlaylist overrides its group's (see getPlayerState's activeContentIdsForGroupedDevice). */
export function setDeviceForcedPlaylist(id: string, libIds: string[]): void {
  db.prepare('UPDATE devices SET forcedPlaylist = ?, forcedContentId = ? WHERE id = ?').run(JSON.stringify(libIds), libIds[0] ?? null, id);
  const device = getDevice(id);
  if (device) {
    recordActionEvent({
      scope: 'device', targetId: id, targetName: device.name,
      action: libIds.length > 0 ? 'forceContent' : 'clearForceContent',
      detail: libIds.length > 0 ? forcedPlaylistLabel(libIds) : null,
    });
  }
}

/** @deprecated Single-item convenience wrapper around setDeviceForcedPlaylist — see setForcedContent's comment. */
export function setDeviceForcedContent(id: string, libId: string | null): void {
  setDeviceForcedPlaylist(id, libId ? [libId] : []);
}

export function addToDeviceForcedPlaylist(deviceId: string, libIds: string[]): void {
  const device = getDevice(deviceId);
  if (!device) return;
  const merged = [...device.forcedPlaylist, ...libIds.filter((id) => !device.forcedPlaylist.includes(id))];
  setDeviceForcedPlaylist(deviceId, merged);
}

export function removeFromDeviceForcedPlaylist(deviceId: string, libId: string): void {
  const device = getDevice(deviceId);
  if (!device) return;
  setDeviceForcedPlaylist(deviceId, device.forcedPlaylist.filter((id) => id !== libId));
}

export function reorderDeviceForcedPlaylist(deviceId: string, libId: string, direction: 'up' | 'down'): void {
  const device = getDevice(deviceId);
  if (!device) return;
  const idx = device.forcedPlaylist.indexOf(libId);
  const swapWith = direction === 'up' ? idx - 1 : idx + 1;
  if (idx < 0 || swapWith < 0 || swapWith >= device.forcedPlaylist.length) return;
  const list = [...device.forcedPlaylist];
  [list[idx], list[swapWith]] = [list[swapWith], list[idx]];
  setDeviceForcedPlaylist(deviceId, list);
}

export function setDeviceBlackout(id: string, blackout: boolean): void {
  db.prepare('UPDATE devices SET blackout = ? WHERE id = ?').run(blackout ? 1 : 0, id);
  const device = getDevice(id);
  if (device) recordActionEvent({ scope: 'device', targetId: id, targetName: device.name, action: blackout ? 'blackout' : 'clearBlackout', detail: null });
}

// Normally set purely by recordHeartbeat above, straight from what the Pi reports.
// This direct setter exists only for routes/devices.ts's clear-usb-override, so a
// hub-initiated clear shows as cleared immediately rather than waiting up to one
// heartbeat interval for the Pi to report it — the next heartbeat will confirm (or
// correct) it either way.
export function setDeviceUsbOverrideActive(id: string, active: boolean): void {
  db.prepare('UPDATE devices SET usbOverrideActive = ? WHERE id = ?').run(active ? 1 : 0, id);
}

export function setDeviceDefaultPlaylist(deviceId: string, libIds: string[]): void {
  db.prepare('UPDATE devices SET defaultPlaylist = ? WHERE id = ?').run(JSON.stringify(libIds), deviceId);
}

export function addToDeviceDefaultPlaylist(deviceId: string, libIds: string[]): void {
  const device = getDevice(deviceId);
  if (!device) return;
  const merged = [...device.defaultPlaylist, ...libIds.filter((id) => !device.defaultPlaylist.includes(id))];
  setDeviceDefaultPlaylist(deviceId, merged);
}

export function removeFromDeviceDefaultPlaylist(deviceId: string, libId: string): void {
  const device = getDevice(deviceId);
  if (!device) return;
  setDeviceDefaultPlaylist(deviceId, device.defaultPlaylist.filter((id) => id !== libId));
}

export function reorderDeviceDefaultPlaylist(deviceId: string, libId: string, direction: 'up' | 'down'): void {
  const device = getDevice(deviceId);
  if (!device) return;
  const idx = device.defaultPlaylist.indexOf(libId);
  const swapWith = direction === 'up' ? idx - 1 : idx + 1;
  if (idx < 0 || swapWith < 0 || swapWith >= device.defaultPlaylist.length) return;
  const list = [...device.defaultPlaylist];
  [list[idx], list[swapWith]] = [list[swapWith], list[idx]];
  setDeviceDefaultPlaylist(deviceId, list);
}

/** Mirrors addEvent/removeEvent — see Device.events' comment in types.ts. */
export function addDeviceEvent(deviceId: string, event: Omit<ScheduleEvent, 'id'>): ScheduleEvent {
  const id = uid('e');
  db.prepare('INSERT INTO events (id, groupId, deviceId, name, start, end, libIds, startTime, endTime, daysOfWeek) VALUES (?,NULL,?,?,?,?,?,?,?,?)').run(
    id, deviceId, event.name, event.start, event.end, JSON.stringify(event.libIds), event.startTime ?? null, event.endTime ?? null,
    event.daysOfWeek && event.daysOfWeek.length > 0 ? JSON.stringify(event.daysOfWeek) : null,
  );
  return { id, ...event };
}

export function removeDeviceEvent(deviceId: string, eventId: string): void {
  db.prepare('DELETE FROM events WHERE id = ? AND deviceId = ?').run(eventId, deviceId);
}

export function setDeviceVideoQuality(id: string, videoQuality: Device['videoQuality']): void {
  db.prepare('UPDATE devices SET videoQuality = ? WHERE id = ?').run(videoQuality, id);
}

/**
 * Persists a reorder of screens shown under one group (or the standalone/no-group
 * list) on Settings/Home — unlike reorderLibrary/reorderGroups, `ids` is expected to
 * already be the complete set of devices in that one scope, not a global list, so
 * there's no "remaining" bucket to append: sortOrder only ever gets compared within
 * a single groupId anyway (see listDevices' ORDER BY), so devices outside `ids`
 * belong to a different scope entirely and must not be touched here.
 */
export const reorderDevices = db.transaction((ids: string[]): void => {
  const setOrder = db.prepare('UPDATE devices SET sortOrder = ? WHERE id = ?');
  ids.forEach((id, i) => setOrder.run(i, id));
});

export function renameDevice(id: string, name: string): void {
  if (!name.trim()) return;
  db.prepare('UPDATE devices SET name = ? WHERE id = ?').run(name.trim(), id);
}

/** Repoints an existing device record at a different IP — see routes/devices.ts's PATCH /:id, which also pushes a /configure call to whatever Pi is actually at the new address so it adopts this device's identity. Purely the DB update; the push is the caller's job (needs piAgent, which store.ts doesn't import — same circular-import avoidance as tflArrivals.ts's callback pattern). */
export function setDeviceIp(id: string, ip: string): void {
  if (!ip.trim()) return;
  db.prepare('UPDATE devices SET ip = ? WHERE id = ?').run(ip.trim(), id);
}

export function moveDevice(id: string, groupId: string | null): void {
  // Lands last in the target group's (or standalone list's) own order, same
  // reasoning as pairDevice's nextOrder — its old sortOrder value is meaningless
  // once it's scoped to a different groupId bucket.
  const nextOrder = (db.prepare('SELECT COALESCE(MAX(sortOrder), -1) + 1 as n FROM devices WHERE groupId IS ?').get(groupId) as { n: number }).n;
  db.prepare('UPDATE devices SET groupId = ?, sortOrder = ? WHERE id = ?').run(groupId, nextOrder, id);
}

/** Files a standalone screen under a Location, or `null` to un-file it — purely organizational, meaningless while the screen is in a group (its Location comes from the group instead). */
export function setDeviceLocation(id: string, locationId: string | null): void {
  db.prepare('UPDATE devices SET locationId = ? WHERE id = ?').run(locationId, id);
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
  /** See pi-player/src/usbOverride.ts. */
  usbOverrideActive?: boolean;
  /** See pi-player/src/diagnostics.ts's PROCESS_STARTED_AT and this file's markUpdateTriggered. */
  playerStartedAt?: number;
  /** See pi-player/src/diagnostics.ts's VERSION and version.ts's HUB_VERSION. */
  version?: string | null;
}

export function recordHeartbeat(id: string, ip: string, diag?: HeartbeatDiagnostics): void {
  const newUptime = diag?.uptimeSec ?? null;
  // Heartbeats arrive every few seconds (pi-player/src/poller.ts) reporting raw
  // os.uptime() — a reboot shows up here as the new value going BACKWARDS relative
  // to the last one we saw. When that happens, bank the prior session's uptime into
  // baseUptimeSec before it's overwritten, so Device.totalUptimeSec keeps
  // accumulating across the reboot instead of losing everything before it.
  if (newUptime != null) {
    const prev = db.prepare('SELECT uptimeSec FROM devices WHERE id = ?').get(id) as { uptimeSec: number | null } | undefined;
    if (prev?.uptimeSec != null && newUptime < prev.uptimeSec) {
      db.prepare('UPDATE devices SET baseUptimeSec = baseUptimeSec + ? WHERE id = ?').run(prev.uptimeSec, id);
    }
  }
  db.prepare('UPDATE devices SET lastSeenAt = ?, ip = ?, tempC = ?, throttled = ?, uptimeSec = ?, diskFreeMb = ?, diskTotalMb = ?, usbOverrideActive = ?, playerStartedAt = ?, version = ? WHERE id = ?').run(
    Date.now(), ip,
    diag?.tempC ?? null, diag?.throttled ?? null, newUptime, diag?.diskFreeMb ?? null, diag?.diskTotalMb ?? null, diag?.usbOverrideActive ? 1 : 0, diag?.playerStartedAt ?? null, diag?.version ?? null,
    id,
  );
  // Resolves an in-progress Update/Re-provision — see markUpdateTriggered's comment.
  // A newer playerStartedAt than when it was triggered is proof the player process
  // actually restarted, regardless of how long that took.
  const tracker = updateTrackers.get(id);
  if (tracker?.status === 'updating' && diag?.playerStartedAt != null && diag.playerStartedAt > tracker.triggeredAt) {
    tracker.status = 'done';
    tracker.resolvedAt = Date.now();
    resolveUpdateEvent(tracker.eventId, 'done');
  }
}

// ---- Settings (hub-wide, readable by both the control app and every Pi) ----

function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function setSetting(key: string, value: string): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

// Defaults to true — matches this project's original, always-on behavior (a Pi
// already caches its last-resolved content and keeps showing it through a
// disconnect) for every hub that predates this being a toggle at all.
export function getSafetyHold(): boolean {
  return getSetting('safetyHold') !== '0';
}

export function setSafetyHold(enabled: boolean): void {
  setSetting('safetyHold', enabled ? '1' : '0');
}

// Settings screen's "Alert when offline for more than N minutes" — purely a control
// app notification threshold (see OfflineAlertBanner.tsx), never read by a Pi. Hub-wide
// (not a per-browser localStorage preference) so everyone looking at the same hub
// sees the same alerting policy, same reasoning as safetyHold above. Defaults to 15:
// long enough that a routine reboot/update cycle (~1-2 min) never falsely alerts, short
// enough to catch a real outage the same day. 0 disables alerting entirely.
export function getOfflineAlertMinutes(): number {
  const raw = getSetting('offlineAlertMinutes');
  const n = raw != null ? Number(raw) : 15;
  return Number.isFinite(n) && n >= 0 ? n : 15;
}

export function setOfflineAlertMinutes(minutes: number): void {
  setSetting('offlineAlertMinutes', String(Math.max(0, Math.round(minutes))));
}

export interface SavedHubNetwork {
  id: string;
  name: string;
  url: string;
}

// Named hub addresses for pairing across more than one network (a multi-homed hub,
// or pairing remotely) — surfaced as a dropdown on the "Add a screen" hub-address
// field instead of a plain text box once at least one exists. Stored as a single
// JSON blob under the generic settings table rather than its own table: this is a
// short, hand-maintained list (a handful of entries at most), not a growing
// collection that ever needs its own id-based lookups/joins.
export function listSavedHubNetworks(): SavedHubNetwork[] {
  const raw = getSetting('savedHubNetworks');
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as SavedHubNetwork[]) : [];
  } catch {
    return [];
  }
}

export function setSavedHubNetworks(networks: SavedHubNetwork[]): void {
  setSetting('savedHubNetworks', JSON.stringify(networks));
}

// ---- Content resolution (mirrors src/api/resolve.ts) ----

function toISODate(d: Date): string {
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Shared by activeContentIds/activeContentIdsForDevice below — an event with no
// startTime/endTime runs all day (the original behavior); one with both set only
// replaces the default playlist during that daily window, same "doesn't span
// midnight" string-compare caveat as activeAnnouncementId's schedules further down.
// daysOfWeek (0=Sun..6=Sat, unset/empty meaning "every day") narrows [start, end]
// down to specific weekdays within it, independently of any time window — e.g. a
// long/open-ended range plus [1,2,3,4,5] for "every weekday."
function eventMatchesNow(e: ScheduleEvent, today: string, hhmm: string, dayOfWeek: number): boolean {
  if (today < e.start || today > e.end) return false;
  if (e.daysOfWeek && e.daysOfWeek.length > 0 && !e.daysOfWeek.includes(dayOfWeek)) return false;
  if (e.startTime && e.endTime) return hhmm >= e.startTime && hhmm <= e.endTime;
  return true;
}

export function activeContentIds(group: Group, now: Date = new Date()): { ids: string[]; kind: 'blackout' | 'forced' | 'event' | 'default'; label: string } {
  // Highest priority, above even forced content — an emergency override meant to
  // win regardless of anything else configured for this group.
  if (group.blackout) return { ids: [], kind: 'blackout', label: 'Blackout' };
  if (group.forcedPlaylist.length > 0) return { ids: group.forcedPlaylist, kind: 'forced', label: 'Forced' };
  const today = toISODate(now);
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const event = group.events.find((e) => eventMatchesNow(e, today, hhmm, now.getDay()));
  if (event) return { ids: event.libIds, kind: 'event', label: event.name };
  return { ids: group.defaultPlaylist, kind: 'default', label: 'Default playlist' };
}

// Resolution order, highest priority first: (1) forcedAnnouncementId — manually forced
// on for every screen in this group, same "until cleared" model as forced content;
// (2) an announcement schedule whose date range AND time-of-day window both cover
// `now` (string-compared "HH:MM" sorts the same as numeric comparison since it's
// always zero-padded 24h — doesn't handle a window that spans midnight, e.g.
// 22:00-02:00, by design: not a case this project's signage use targets); (3) null,
// meaning each device's own manual announcementId/announcementOn toggle applies
// instead (see getPlayerState below) — this group-level resolution only ever
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

// A screen not assigned to any group has no group-level schedule to fall back on,
// but does have its own — forcedPlaylist/blackout (the standalone-screen
// equivalents of a group's controls, see Device.forcedPlaylist's comment in
// types.ts), then its own events/defaultPlaylist, same priority order and
// time-window matching as activeContentIds above.
function activeContentIdsForDevice(device: Device, now: Date = new Date()): { ids: string[]; kind: 'blackout' | 'forced' | 'event' | 'default'; label: string } {
  if (device.blackout) return { ids: [], kind: 'blackout', label: 'Blackout' };
  if (device.forcedPlaylist.length > 0) return { ids: device.forcedPlaylist, kind: 'forced', label: 'Forced' };
  const today = toISODate(now);
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const event = device.events.find((e) => eventMatchesNow(e, today, hhmm, now.getDay()));
  if (event) return { ids: event.libIds, kind: 'event', label: event.name };
  if (device.defaultPlaylist.length > 0) return { ids: device.defaultPlaylist, kind: 'default', label: 'Default playlist' };
  return { ids: [], kind: 'default', label: 'No content' };
}

// A device inside a group normally shows whatever the group resolves to — but its
// own forcedPlaylist/blackout (the same fields activeContentIdsForDevice above uses
// for a standalone screen) take priority when set, letting one screen in a group
// show something different without pulling it out of the group. Falls straight
// through to the group's own activeContentIds the moment both are unset, which is
// every existing grouped device's state (empty forcedPlaylist, blackout false) —
// this is purely additive, not a behavior change for a device that's never set an
// override of its own.
function activeContentIdsForGroupedDevice(device: Device, group: Group, now: Date = new Date()): { ids: string[]; kind: 'blackout' | 'forced' | 'event' | 'default'; label: string } {
  if (device.blackout) return { ids: [], kind: 'blackout', label: 'Blackout' };
  if (device.forcedPlaylist.length > 0) return { ids: device.forcedPlaylist, kind: 'forced', label: 'Forced' };
  return activeContentIds(group, now);
}

export function getPlayerState(deviceId: string): PlayerState | null {
  const device = getDevice(deviceId);
  if (!device) return null;
  const group = device.groupId ? getGroup(device.groupId) : null;
  if (device.groupId && !group) return null;

  const active = group ? activeContentIdsForGroupedDevice(device, group) : activeContentIdsForDevice(device);
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
      duration: item.type === 'video' ? null : item.type === 'image' || item.type === 'clock' || item.type === 'ndi' || item.type === 'tfl-status' || item.type === 'tfl-arrivals' ? (item.durationSec ?? 8) : 8,
      ...(item.type === 'pdf' && { pageCount: item.pageCount ?? 1 }),
      ...(item.type === 'ndi' && { ndiSourceName: item.ndiSourceName ?? '' }),
      // Resolved fresh from tflStatus.ts's cache on every poll, not stored on the
      // library item — this is what makes the board feel "live" without the device
      // needing any TfL-specific polling of its own (see tflStatus.ts's header comment).
      ...(item.type === 'tfl-status' && { tflLines: tflStatus.getLinesForModes(item.tflModes ?? []) }),
      // Same reasoning, resolved fresh from tflArrivals.ts's per-station cache — see
      // its header comment and getPlayerState's tflArrivals.startPolling wiring in
      // index.ts (which decides which stations are "needed" from these same items).
      // One entry per configured station, in order, so a multi-station board (see
      // types.ts's LibraryItem.tflStations) can render each as its own panel.
      ...(item.type === 'tfl-arrivals' && item.tflStations && {
        tflStationBoards: item.tflStations.map((station) => ({
          stopPointName: station.stopPointName,
          boards: tflArrivals.getBoardForStop(station.stopPointId, station.lines),
        })),
      }),
    }));

  const safetyHold = getSafetyHold();

  // Blackout means a genuinely blank screen — even the announcement ticker goes
  // dark, since the whole point is an emergency "nothing shows here" state, not
  // just swapping out the main content.
  if (active.kind === 'blackout') {
    return { kind: 'blackout', label: active.label, items: [], announcement: { on: false, text: null }, safetyHold };
  }

  // Group-level forced/scheduled announcement overrides this device's own manual
  // toggle when active; otherwise the device's own announcementId/announcementOn
  // applies exactly as before. No group at all means there's nothing to override
  // with — the device's own toggle is the only source.
  const groupAnnouncementId = group ? activeAnnouncementId(group) : null;
  const announcementId = groupAnnouncementId ?? device.announcementId;
  const announcementOn = groupAnnouncementId != null || device.announcementOn;
  const announcement = announcementId ? libraryById.get(announcementId) : undefined;
  return {
    kind: active.kind,
    label: active.label,
    items,
    announcement: { on: announcementOn && !!announcement, text: announcement?.text ?? null },
    safetyHold,
  };
}

// ---- Backup / restore ----

export interface Backup {
  version: 1;
  exportedAt: string;
  library: LibraryItem[];
  groups: Group[];
  devices: Device[];
  folders: Folder[];
  locations: Location[];
}

/** Full snapshot of everything the control app manages — content metadata, groups/playlists/schedules, Locations, paired screens (name, IP, MAC, settings), and the Library screen's folder tree. Uploaded media files themselves aren't included (they're not JSON-portable); back up hub/data/uploads separately if you need those too. */
export function exportBackup(): Backup {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    library: listLibrary(),
    groups: listGroups(),
    devices: listDevices(),
    folders: listFolders(),
    locations: listLocations(),
  };
}

/**
 * Wipes and replaces every table from a previously exported backup, preserving every
 * id exactly — library items, groups, events, announcement schedules, and devices
 * all cross-reference each other by id (a group's defaultPlaylist/forcedPlaylist
 * point at library ids, a device's groupId points at a group), and a fresh uid() per
 * row the way addLibraryItem/addGroup/pairDevice normally generate one would
 * silently break every one of those references. Restored devices come back offline
 * (lastSeenAt cleared) until each Pi's own poller heartbeats again, rather than
 * presenting stale liveness state as current.
 */
export const restoreBackup = db.transaction((backup: Pick<Backup, 'library' | 'groups' | 'devices'> & { folders?: Folder[]; locations?: Location[] }): void => {
  db.prepare('DELETE FROM events').run();
  db.prepare('DELETE FROM announcement_schedules').run();
  db.prepare('DELETE FROM devices').run();
  db.prepare('DELETE FROM groups_').run();
  db.prepare('DELETE FROM library').run();
  db.prepare('DELETE FROM folders').run();
  db.prepare('DELETE FROM locations').run();

  const insertLocation = db.prepare('INSERT INTO locations (id, name, sortOrder) VALUES (@id,@name,@sortOrder)');
  (backup.locations ?? []).forEach((location, i) => {
    insertLocation.run({ id: location.id, name: location.name, sortOrder: i });
  });

  // folders has no FK to enforce insert order (see db.ts's folderId migration
  // comment), so parents and children can be inserted in whatever order the
  // backup happens to list them in.
  const insertFolder = db.prepare('INSERT INTO folders (id, name, parentId, createdAt) VALUES (@id,@name,@parentId,@createdAt)');
  (backup.folders ?? []).forEach((folder) => {
    // Preserves the original creation date when the backup has one; a backup taken
    // before this field existed has no truthful answer, so "now" is the best guess.
    insertFolder.run({ id: folder.id, name: folder.name, parentId: folder.parentId, createdAt: folder.createdAt ?? Date.now() });
  });

  const insertLibrary = db.prepare(
    'INSERT INTO library (id, name, type, size, duration, durationSec, thumb, text, pageCount, fullUrl, transcodeStatus, tags, ndiSourceName, tflModes, tflStations, folderId, sortOrder, createdAt) ' +
    'VALUES (@id,@name,@type,@size,@duration,@durationSec,@thumb,@text,@pageCount,@fullUrl,@transcodeStatus,@tags,@ndiSourceName,@tflModes,@tflStations,@folderId,@sortOrder,@createdAt)',
  );
  backup.library.forEach((item, i) => {
    insertLibrary.run({
      id: item.id, name: item.name, type: item.type,
      size: item.size ?? null, duration: item.duration ?? null, durationSec: item.durationSec ?? null,
      thumb: item.thumb ?? null, text: item.text ?? null, pageCount: item.pageCount ?? null,
      fullUrl: item.fullUrl ?? null, transcodeStatus: item.transcodeStatus ?? null, tags: JSON.stringify(item.tags ?? []),
      ndiSourceName: item.ndiSourceName ?? null,
      tflModes: item.tflModes ? JSON.stringify(item.tflModes) : null,
      tflStations: item.tflStations ? JSON.stringify(item.tflStations) : null,
      folderId: item.folderId ?? null,
      sortOrder: i,
      // Preserves the original "added on" date when the backup has one; a backup
      // taken before this field existed has no truthful answer, so this falls back
      // to a synthetic one that at least keeps insertion order stable as a tiebreaker.
      createdAt: item.createdAt ?? Date.now() + i,
    });
  });

  const insertGroup = db.prepare(
    'INSERT INTO groups_ (id, name, locationId, defaultPlaylist, forcedPlaylist, forcedContentId, forcedAnnouncementId, sortOrder, blackout) VALUES (@id,@name,@locationId,@defaultPlaylist,@forcedPlaylist,@forcedContentId,@forcedAnnouncementId,@sortOrder,@blackout)',
  );
  const insertEvent = db.prepare(
    'INSERT INTO events (id, groupId, deviceId, name, start, end, libIds, startTime, endTime, daysOfWeek) VALUES (@id,@groupId,@deviceId,@name,@start,@end,@libIds,@startTime,@endTime,@daysOfWeek)',
  );
  const insertAnnSchedule = db.prepare(
    'INSERT INTO announcement_schedules (id, groupId, announcementId, startDate, endDate, startTime, endTime) VALUES (@id,@groupId,@announcementId,@startDate,@endDate,@startTime,@endTime)',
  );
  backup.groups.forEach((group, i) => {
    // A backup taken before forcedPlaylist existed only has the old single-item
    // forcedContentId — synthesize a one-element array from it, same fallback
    // rowToGroup applies when reading a pre-migration row (see parseForcedPlaylist).
    const forcedPlaylist = group.forcedPlaylist ?? (group.forcedContentId ? [group.forcedContentId] : []);
    insertGroup.run({
      id: group.id, name: group.name, locationId: group.locationId ?? null, defaultPlaylist: JSON.stringify(group.defaultPlaylist),
      forcedPlaylist: JSON.stringify(forcedPlaylist), forcedContentId: forcedPlaylist[0] ?? null, forcedAnnouncementId: group.forcedAnnouncementId,
      sortOrder: i, blackout: group.blackout ? 1 : 0,
    });
    for (const event of group.events) {
      insertEvent.run({
        id: event.id, groupId: group.id, deviceId: null, name: event.name, start: event.start, end: event.end, libIds: JSON.stringify(event.libIds),
        startTime: event.startTime ?? null, endTime: event.endTime ?? null,
        daysOfWeek: event.daysOfWeek && event.daysOfWeek.length > 0 ? JSON.stringify(event.daysOfWeek) : null,
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
    'INSERT INTO devices (id, name, ip, mac, groupId, locationId, announcementId, announcementOn, videoQuality, lastSeenAt, forcedPlaylist, forcedContentId, blackout, defaultPlaylist, baseUptimeSec, sortOrder, offlineAlertsMuted) ' +
    'VALUES (@id,@name,@ip,@mac,@groupId,@locationId,@announcementId,@announcementOn,@videoQuality,NULL,@forcedPlaylist,@forcedContentId,@blackout,@defaultPlaylist,@baseUptimeSec,@sortOrder,@offlineAlertsMuted)',
  );
  backup.devices.forEach((device, i) => {
    // Same pre-migration fallback as the group loop above.
    const forcedPlaylist = device.forcedPlaylist ?? (device.forcedContentId ? [device.forcedContentId] : []);
    insertDevice.run({
      id: device.id, name: device.name, ip: device.ip, mac: device.mac, groupId: device.groupId, locationId: device.locationId ?? null,
      announcementId: device.announcementId, announcementOn: device.announcementOn ? 1 : 0, videoQuality: device.videoQuality,
      forcedPlaylist: JSON.stringify(forcedPlaylist), forcedContentId: forcedPlaylist[0] ?? null, blackout: device.blackout ? 1 : 0,
      defaultPlaylist: JSON.stringify(device.defaultPlaylist ?? []),
      offlineAlertsMuted: device.offlineAlertsMuted ? 1 : 0,
      // uptimeSec itself resets to NULL like the rest of this device's live
      // diagnostics (see this function's own doc comment) until its Pi heartbeats
      // again — but the lifetime total leading up to the backup is real history,
      // not stale liveness state, so it's carried forward as the new base instead
      // of being lost. Exact, not an approximation: totalUptimeSec at export time
      // already reflects every prior session plus the live one, so restoring it as
      // the new base and starting uptimeSec fresh from NULL reproduces the exact
      // same total the instant the next heartbeat arrives.
      baseUptimeSec: device.totalUptimeSec ?? 0,
      sortOrder: i,
    });
    for (const event of device.events ?? []) {
      insertEvent.run({
        id: event.id, groupId: null, deviceId: device.id, name: event.name, start: event.start, end: event.end, libIds: JSON.stringify(event.libIds),
        startTime: event.startTime ?? null, endTime: event.endTime ?? null,
        daysOfWeek: event.daysOfWeek && event.daysOfWeek.length > 0 ? JSON.stringify(event.daysOfWeek) : null,
      });
    }
  });
});
