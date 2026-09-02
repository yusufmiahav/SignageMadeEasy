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

// Same reasoning, for hubs deployed before locations supported drag-to-reorder on
// the Home screen — every existing row keeps its current rowid-based (insertion)
// order so nothing visibly reshuffles the first time this runs; new rows get one
// past the current max (see store.ts's addGroup).
const groupCols = (db.prepare("PRAGMA table_info(groups_)").all() as { name: string }[]).map((c) => c.name);
if (!groupCols.includes('sortOrder')) {
  db.exec('ALTER TABLE groups_ ADD COLUMN sortOrder INTEGER');
  const rows = db.prepare('SELECT id FROM groups_ ORDER BY rowid ASC').all() as { id: string }[];
  const setOrder = db.prepare('UPDATE groups_ SET sortOrder = ? WHERE id = ?');
  rows.forEach((r, i) => setOrder.run(i, r.id));
}

// Same reasoning, for hubs deployed before the emergency "blackout" override
// existed — see activeContentIds' highest-priority check in store.ts. Defaults to
// off for every existing location.
if (!groupCols.includes('blackout')) db.exec('ALTER TABLE groups_ ADD COLUMN blackout INTEGER NOT NULL DEFAULT 0');

// Same reasoning, for hubs deployed before events supported a daily time window —
// nullable (not NOT NULL DEFAULT), since null on both means "runs all day," matching
// every existing event's actual behavior exactly, not just a same-looking default.
const eventCols = (db.prepare("PRAGMA table_info(events)").all() as { name: string }[]).map((c) => c.name);
if (!eventCols.includes('startTime')) db.exec('ALTER TABLE events ADD COLUMN startTime TEXT');
if (!eventCols.includes('endTime')) db.exec('ALTER TABLE events ADD COLUMN endTime TEXT');

// Same reasoning, for hubs deployed before a screen could be paired without a
// location ("misc" screens, assignable later) — devices.groupId was NOT NULL from
// launch, and CREATE TABLE IF NOT EXISTS above is a no-op on an existing database,
// so every database (including a brand-new one, since that CREATE TABLE still
// declares it NOT NULL) needs this rebuilt once. SQLite has no ALTER COLUMN to just
// drop a NOT NULL constraint, so the whole table is recreated — the notnull check
// below makes this run exactly once per database. ON DELETE SET NULL (was CASCADE)
// as part of the same rebuild means deleting a location un-assigns its screens
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

// Same reasoning, for the misc-screen force-content/blackout controls that fill in
// for the location-level ones an ungrouped screen doesn't have (its own manual
// announcementId/announcementOn already covers "force announcement" — see
// activeContentIdsForDevice in store.ts).
const deviceCols2 = (db.prepare("PRAGMA table_info(devices)").all() as { name: string }[]).map((c) => c.name);
if (!deviceCols2.includes('forcedContentId')) db.exec('ALTER TABLE devices ADD COLUMN forcedContentId TEXT');
if (!deviceCols2.includes('blackout')) db.exec('ALTER TABLE devices ADD COLUMN blackout INTEGER NOT NULL DEFAULT 0');

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

// No demo/seed data — a fresh hub starts with an empty library, no locations, and
// no paired devices. Everything shown in the control app comes from real use.
