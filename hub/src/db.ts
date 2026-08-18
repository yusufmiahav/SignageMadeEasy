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
    thumb TEXT,
    text TEXT,
    pageCount INTEGER,
    createdAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS groups_ (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    defaultPlaylist TEXT NOT NULL DEFAULT '[]',
    forcedContentId TEXT
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    groupId TEXT NOT NULL REFERENCES groups_(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    start TEXT NOT NULL,
    end TEXT NOT NULL,
    libIds TEXT NOT NULL DEFAULT '[]'
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
// No demo/seed data — a fresh hub starts with an empty library, no locations, and
// no paired devices. Everything shown in the control app comes from real use.
