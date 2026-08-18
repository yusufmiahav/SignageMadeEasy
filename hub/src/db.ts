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

// Seed data on first run only (empty DB), matching the frontend's localStore seed
// so a fresh hub + a fresh browser show the same starting point.
const seeded = db.prepare('SELECT COUNT(*) as n FROM groups_').get() as { n: number };
if (seeded.n === 0) {
  const now = Date.now();
  const insertLib = db.prepare(
    'INSERT INTO library (id, name, type, size, duration, thumb, text, pageCount, createdAt) VALUES (@id,@name,@type,@size,@duration,@thumb,@text,@pageCount,@createdAt)'
  );
  insertLib.run({ id: 'l1', name: 'welcome-banner.jpg', type: 'image', size: '1.2 MB', duration: null, thumb: null, text: null, pageCount: null, createdAt: now });
  insertLib.run({ id: 'l2', name: 'back-to-school.png', type: 'image', size: '2.1 MB', duration: null, thumb: null, text: null, pageCount: null, createdAt: now });
  insertLib.run({ id: 'l3', name: 'promo-reel.mp4', type: 'video', size: '18.4 MB', duration: '0:42', thumb: null, text: null, pageCount: null, createdAt: now });
  insertLib.run({ id: 'l4', name: 'menu-slides.pdf', type: 'pdf', size: '3.4 MB', duration: null, thumb: null, text: null, pageCount: 4, createdAt: now });
  insertLib.run({ id: 'l5', name: 'Closing early Friday', type: 'announcement', size: null, duration: null, thumb: null, text: 'We close at 3pm this Friday for staff training.', pageCount: null, createdAt: now });

  db.prepare('INSERT INTO groups_ (id, name, defaultPlaylist, forcedContentId) VALUES (?,?,?,?)').run('g1', 'Lobby', JSON.stringify(['l1', 'l3']), null);
  db.prepare('INSERT INTO groups_ (id, name, defaultPlaylist, forcedContentId) VALUES (?,?,?,?)').run('g2', 'Cafeteria', JSON.stringify(['l4', 'l5']), null);
}
