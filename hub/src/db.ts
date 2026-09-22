import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.SIGNAGE_DATA_DIR ?? path.resolve(__dirname, '../data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'signage.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS library (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    size TEXT,
    duration TEXT,
    durationSec INTEGER,
    thumb TEXT,
    text TEXT,
    pageCount INTEGER,
    createdAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS groups_ (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    defaultPlaylist TEXT NOT NULL DEFAULT '[]',
    forcedContentId TEXT,
    forcedAnnouncementId TEXT
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    groupId TEXT NOT NULL REFERENCES groups_(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    start TEXT NOT NULL,
    end TEXT NOT NULL,
    libIds TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS announcement_schedules (
    id TEXT PRIMARY KEY,
    groupId TEXT NOT NULL REFERENCES groups_(id) ON DELETE CASCADE,
    announcementId TEXT NOT NULL,
    startDate TEXT NOT NULL,
    endDate TEXT NOT NULL,
    startTime TEXT NOT NULL,
    endTime TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    ip TEXT NOT NULL,
    mac TEXT,
    groupId TEXT NOT NULL REFERENCES groups_(id) ON DELETE CASCADE,
    announcementId TEXT,
    announcementOn INTEGER NOT NULL DEFAULT 0,
    lastSeenAt INTEGER
  );

  CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parentId TEXT,
    createdAt INTEGER
  );

  CREATE TABLE IF NOT EXISTS locations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sortOrder INTEGER
  );
`);

// Migration for hubs deployed before durationSec existed: CREATE TABLE IF NOT EXISTS
// above is a no-op on an existing database, so the column has to be added separately.
const hasDurationSec = (db.prepare("PRAGMA table_info(library)").all() as { name: string }[]).some((c) => c.name === 'durationSec');
if (!hasDurationSec) db.exec('ALTER TABLE library ADD COLUMN durationSec INTEGER');

// Same reasoning, for hubs deployed before forcedAnnouncementId existed.
const hasForcedAnnouncementId = (db.prepare("PRAGMA table_info(groups_)").all() as { name: string }[]).some((c) => c.name === 'forcedAnnouncementId');
if (!hasForcedAnnouncementId) db.exec('ALTER TABLE groups_ ADD COLUMN forcedAnnouncementId TEXT');

// Same reasoning, for hubs deployed before mac existed — captured once at pairing
// time from the Pi's own /identify response (see piAgent.ts), never null for a
// screen paired after this shipped, always null for one paired before it (and for
// every device in standalone/localStorage mode, which has no real Pi to ask).
const hasMac = (db.prepare("PRAGMA table_info(devices)").all() as { name: string }[]).some((c) => c.name === 'mac');
if (!hasMac) db.exec('ALTER TABLE devices ADD COLUMN mac TEXT');

// Same reasoning, for hubs deployed before video resolution capping ran in the
// background — fullUrl is the untouched original upload, transcodeStatus tracks
// whether a capped copy exists yet (see videoTranscode.ts and routes/library.ts).
const libraryCols = (db.prepare("PRAGMA table_info(library)").all() as { name: string }[]).map((c) => c.name);
if (!libraryCols.includes('fullUrl')) db.exec('ALTER TABLE library ADD COLUMN fullUrl TEXT');
if (!libraryCols.includes('transcodeStatus')) db.exec('ALTER TABLE library ADD COLUMN transcodeStatus TEXT');

// Same reasoning, for hubs deployed before per-screen video quality existed — every
// existing screen defaults to 'auto' (the capped copy), matching this project's
// prior behavior of always serving a capped video to every screen.
const hasVideoQuality = (db.prepare("PRAGMA table_info(devices)").all() as { name: string }[]).some((c) => c.name === 'videoQuality');
if (!hasVideoQuality) db.exec("ALTER TABLE devices ADD COLUMN videoQuality TEXT NOT NULL DEFAULT 'auto'");

// Same reasoning, for hubs deployed before the Library screen supported drag-to-reorder
// — every existing row gets seeded with its current createdAt-based position so
// nothing visibly reshuffles the first time this runs; new rows get one past the
// current max (see store.ts's addLibraryItem).
const hasSortOrder = (db.prepare("PRAGMA table_info(library)").all() as { name: string }[]).some((c) => c.name === 'sortOrder');
if (!hasSortOrder) {
  db.exec('ALTER TABLE library ADD COLUMN sortOrder INTEGER');
  const rows = db.prepare('SELECT id FROM library ORDER BY createdAt ASC').all() as { id: string }[];
  const setOrder = db.prepare('UPDATE library SET sortOrder = ? WHERE id = ?');
  rows.forEach((r, i) => setOrder.run(i, r.id));
}

// Same reasoning, for hubs deployed before per-heartbeat diagnostics existed —
// reported by the Pi's own poller (see pi-player/src/diagnostics.ts) alongside every
// heartbeat; null for a device that's never sent one yet (old firmware, or offline
// since before this shipped).
const deviceCols = (db.prepare("PRAGMA table_info(devices)").all() as { name: string }[]).map((c) => c.name);
if (!deviceCols.includes('tempC')) db.exec('ALTER TABLE devices ADD COLUMN tempC REAL');
if (!deviceCols.includes('throttled')) db.exec('ALTER TABLE devices ADD COLUMN throttled TEXT');
if (!deviceCols.includes('uptimeSec')) db.exec('ALTER TABLE devices ADD COLUMN uptimeSec INTEGER');
if (!deviceCols.includes('diskFreeMb')) db.exec('ALTER TABLE devices ADD COLUMN diskFreeMb INTEGER');
if (!deviceCols.includes('diskTotalMb')) db.exec('ALTER TABLE devices ADD COLUMN diskTotalMb INTEGER');

// Same reasoning, for hubs deployed before Library tags existed — a JSON string
// array, same encoding as defaultPlaylist/libIds elsewhere in this file. Empty for
// every existing row until someone tags something.
if (!(db.prepare("PRAGMA table_info(library)").all() as { name: string }[]).some((c) => c.name === 'tags')) {
  db.exec("ALTER TABLE library ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'");
}

// Same reasoning, for hubs deployed before groups supported drag-to-reorder on
// the Home screen — every existing row keeps its current rowid-based (insertion)
// order so nothing visibly reshuffles the first time this runs; new rows get one
// past the current max (see store.ts's addGroup).
// Same reasoning, for hubs deployed before NDI-source library items existed — the
// NDI network name to receive at playback time (see types.ts's LibraryItem.ndiSourceName
// and pi-player/src/ndiPlayer.ts), null for every non-'ndi' item.
if (!(db.prepare("PRAGMA table_info(library)").all() as { name: string }[]).some((c) => c.name === 'ndiSourceName')) {
  db.exec('ALTER TABLE library ADD COLUMN ndiSourceName TEXT');
}

// Same reasoning, for hubs deployed before 'tfl-status' library items existed — a
// JSON string array of TfL mode names (see types.ts's LibraryItem.tflModes and
// tflStatus.ts), null for every non-'tfl-status' item.
if (!(db.prepare("PRAGMA table_info(library)").all() as { name: string }[]).some((c) => c.name === 'tflModes')) {
  db.exec('ALTER TABLE library ADD COLUMN tflModes TEXT');
}

// Same reasoning, for hubs deployed before 'tfl-arrivals' library items existed —
// tflStopPointId/tflStopPointName identify the real, queryable TfL StopPoint
// (already resolved from any hub/interchange at add-time — see tflArrivals.ts's
// searchStations()), tflArrivalLines is a JSON string array of line ids to filter
// to (see types.ts's LibraryItem fields), all null for every non-'tfl-arrivals' item.
const libraryColsTflArrivals = (db.prepare("PRAGMA table_info(library)").all() as { name: string }[]).map((c) => c.name);
if (!libraryColsTflArrivals.includes('tflStopPointId')) db.exec('ALTER TABLE library ADD COLUMN tflStopPointId TEXT');
if (!libraryColsTflArrivals.includes('tflStopPointName')) db.exec('ALTER TABLE library ADD COLUMN tflStopPointName TEXT');
if (!libraryColsTflArrivals.includes('tflArrivalLines')) db.exec('ALTER TABLE library ADD COLUMN tflArrivalLines TEXT');

// Same reasoning, for hubs deployed before a 'tfl-arrivals' item could show more
// than one station on the same board — a JSON array of {stopPointId,
// stopPointName, lines} (see types.ts's TflStationConfig/LibraryItem.tflStations),
// superseding the three single-station columns just above. Those older columns
// are kept rather than dropped (SQLite ALTER TABLE DROP COLUMN on a live
// production DB is more risk than a few permanently-unused columns are worth) —
// store.ts's rowToLibraryItem synthesizes a one-element tflStations array from
// them on read for any row saved before this column existed, so an existing
// single-station item keeps working with no manual migration.
if (!libraryColsTflArrivals.includes('tflStations')) db.exec('ALTER TABLE library ADD COLUMN tflStations TEXT');

// Same reasoning, for hubs deployed before the Library screen supported organizing
// items into folders — null for every existing item, meaning "library root," exactly
// matching where it already visually was. No FK on folders.parentId (self-referencing)
// or library.folderId, matching this file's existing "application code manages the
// relationship" pattern for cross-table references elsewhere (e.g. groups_.forcedContentId) —
// deleting a folder needs to reassign its contents before removing the row (see
// store.ts's removeFolder), which a plain ON DELETE CASCADE/SET NULL couldn't express.
if (!libraryColsTflArrivals.includes('folderId')) db.exec('ALTER TABLE library ADD COLUMN folderId TEXT');

const groupCols = (db.prepare("PRAGMA table_info(groups_)").all() as { name: string }[]).map((c) => c.name);
if (!groupCols.includes('sortOrder')) {
  db.exec('ALTER TABLE groups_ ADD COLUMN sortOrder INTEGER');
  const rows = db.prepare('SELECT id FROM groups_ ORDER BY rowid ASC').all() as { id: string }[];
  const setOrder = db.prepare('UPDATE groups_ SET sortOrder = ? WHERE id = ?');
  rows.forEach((r, i) => setOrder.run(i, r.id));
}

// Same reasoning, for hubs deployed before the emergency "blackout" override
// existed — see activeContentIds' highest-priority check in store.ts. Defaults to
// off for every existing group.
if (!groupCols.includes('blackout')) db.exec('ALTER TABLE groups_ ADD COLUMN blackout INTEGER NOT NULL DEFAULT 0');

// Same reasoning, for hubs deployed before events supported a daily time window —
// nullable (not NOT NULL DEFAULT), since null on both means "runs all day," matching
// every existing event's actual behavior exactly, not just a same-looking default.
const eventCols = (db.prepare("PRAGMA table_info(events)").all() as { name: string }[]).map((c) => c.name);
if (!eventCols.includes('startTime')) db.exec('ALTER TABLE events ADD COLUMN startTime TEXT');
if (!eventCols.includes('endTime')) db.exec('ALTER TABLE events ADD COLUMN endTime TEXT');

// Same reasoning, for hubs deployed before a screen could be paired without a
// group ("standalone" screens, assignable later) — devices.groupId was NOT NULL from
// launch, and CREATE TABLE IF NOT EXISTS above is a no-op on an existing database,
// so every database (including a brand-new one, since that CREATE TABLE still
// declares it NOT NULL) needs this rebuilt once. SQLite has no ALTER COLUMN to just
// drop a NOT NULL constraint, so the whole table is recreated — the notnull check
// below makes this run exactly once per database. ON DELETE SET NULL (was CASCADE)
// as part of the same rebuild means deleting a group un-assigns its screens
// instead of deleting them.
const devicesGroupIdCol = (db.prepare("PRAGMA table_info(devices)").all() as { name: string; notnull: number }[]).find((c) => c.name === 'groupId');
if (devicesGroupIdCol?.notnull === 1) {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE devices_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        ip TEXT NOT NULL,
        mac TEXT,
        groupId TEXT REFERENCES groups_(id) ON DELETE SET NULL,
        announcementId TEXT,
        announcementOn INTEGER NOT NULL DEFAULT 0,
        lastSeenAt INTEGER,
        videoQuality TEXT NOT NULL DEFAULT 'auto',
        tempC REAL,
        throttled TEXT,
        uptimeSec INTEGER,
        diskFreeMb INTEGER,
        diskTotalMb INTEGER
      );
      INSERT INTO devices_new (id, name, ip, mac, groupId, announcementId, announcementOn, lastSeenAt, videoQuality, tempC, throttled, uptimeSec, diskFreeMb, diskTotalMb)
        SELECT id, name, ip, mac, groupId, announcementId, announcementOn, lastSeenAt, videoQuality, tempC, throttled, uptimeSec, diskFreeMb, diskTotalMb FROM devices;
      DROP TABLE devices;
      ALTER TABLE devices_new RENAME TO devices;
    `);
  })();
}

// Same reasoning, for the standalone-screen force-content/blackout controls that
// fill in for the group-level ones an ungrouped screen doesn't have (its own manual
// announcementId/announcementOn already covers "force announcement" — see
// activeContentIdsForDevice in store.ts).
const deviceCols2 = (db.prepare("PRAGMA table_info(devices)").all() as { name: string }[]).map((c) => c.name);
if (!deviceCols2.includes('forcedContentId')) db.exec('ALTER TABLE devices ADD COLUMN forcedContentId TEXT');
if (!deviceCols2.includes('blackout')) db.exec('ALTER TABLE devices ADD COLUMN blackout INTEGER NOT NULL DEFAULT 0');

// Same reasoning, for hubs deployed before screens (within a group, or among
// the standalone/no-group list) supported reordering with up/down arrows on
// Settings/Home — every existing row keeps its current rowid-based (insertion)
// order so nothing visibly reshuffles the first time this runs. Never exposed on
// the Device type itself (same as groups_.sortOrder isn't on Group) — purely an
// internal ordering the API applies via listDevices()'s ORDER BY.
if (!deviceCols2.includes('sortOrder')) {
  db.exec('ALTER TABLE devices ADD COLUMN sortOrder INTEGER');
  const rows = db.prepare('SELECT id FROM devices ORDER BY rowid ASC').all() as { id: string }[];
  const setOrder = db.prepare('UPDATE devices SET sortOrder = ? WHERE id = ?');
  rows.forEach((r, i) => setOrder.run(i, r.id));
}

// Same reasoning, for hubs deployed before a screen with no group could have its
// own default playlist (standalone-screen scheduling) — every existing screen
// starts with an empty one, same as a brand-new group's defaultPlaylist.
if (!deviceCols2.includes('defaultPlaylist')) db.exec("ALTER TABLE devices ADD COLUMN defaultPlaylist TEXT NOT NULL DEFAULT '[]'");

// Same reasoning, for hubs deployed before Locations existed — a purely
// organizational grouping a Group or a standalone screen can optionally be filed
// under (see types.ts's Location/Group.locationId/Device.locationId). Null for
// every existing group/device until someone files it under one; no FK, same
// "application code manages the relationship" pattern as folders.parentId (deleting
// a Location un-files its contents rather than needing a cascade rule).
if (!groupCols.includes('locationId')) db.exec('ALTER TABLE groups_ ADD COLUMN locationId TEXT');
if (!deviceCols2.includes('locationId')) db.exec('ALTER TABLE devices ADD COLUMN locationId TEXT');

// Same reasoning, for hubs deployed before events could belong to a device instead
// of a group — events.groupId was NOT NULL from launch (same situation as
// devices.groupId's own rebuild above), and a device-scoped event has no groupId at
// all, so this needs the same "rebuild the table, guarded by the notnull flag so it
// runs exactly once" treatment. The CHECK enforces exactly one of groupId/deviceId is
// set — every event belongs to exactly one group or one device, never both, never
// neither.
const eventsGroupIdCol = (db.prepare("PRAGMA table_info(events)").all() as { name: string; notnull: number }[]).find((c) => c.name === 'groupId');
if (eventsGroupIdCol?.notnull === 1) {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE events_new (
        id TEXT PRIMARY KEY,
        groupId TEXT REFERENCES groups_(id) ON DELETE CASCADE,
        deviceId TEXT REFERENCES devices(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        start TEXT NOT NULL,
        end TEXT NOT NULL,
        libIds TEXT NOT NULL DEFAULT '[]',
        startTime TEXT,
        endTime TEXT,
        CHECK ((groupId IS NULL) <> (deviceId IS NULL))
      );
      INSERT INTO events_new (id, groupId, deviceId, name, start, end, libIds, startTime, endTime)
        SELECT id, groupId, NULL, name, start, end, libIds, startTime, endTime FROM events;
      DROP TABLE events;
      ALTER TABLE events_new RENAME TO events;
    `);
  })();
}

// Same reasoning, for hubs deployed before folders tracked when they were created —
// there's no truthful answer for a pre-existing folder's actual creation time, so
// every existing row is backfilled with this migration's own run time (a reasonable
// "at least this old" answer) rather than left null; a brand-new folder gets a real
// timestamp from store.ts's addFolder from here on.
const folderCols = (db.prepare("PRAGMA table_info(folders)").all() as { name: string }[]).map((c) => c.name);
if (!folderCols.includes('createdAt')) {
  db.exec('ALTER TABLE folders ADD COLUMN createdAt INTEGER');
  db.prepare('UPDATE folders SET createdAt = ? WHERE createdAt IS NULL').run(Date.now());
}

// A generic key/value store for hub-wide settings (currently just "safety hold" —
// see store.ts's getSafetyHold/setSafetyHold) that need to be readable by a Pi
// (via GET /api/player/:id/state), not just the control app — unlike the frontend's
// own purely-local, per-browser Settings toggles (dark mode, advanced device info),
// which live in localStorage and never need the hub to know about them at all.
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// No demo/seed data — a fresh hub starts with an empty library, no groups or
// locations, and no paired devices. Everything shown in the control app comes from
// real use.
