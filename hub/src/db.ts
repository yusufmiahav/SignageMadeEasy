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

// No demo/seed data — a fresh hub starts with an empty library, no locations, and
// no paired devices. Everything shown in the control app comes from real use.
