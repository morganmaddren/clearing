import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS visitors (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  name_lower  TEXT NOT NULL UNIQUE,
  key_hash    TEXT NOT NULL UNIQUE,
  about       TEXT,
  created_at  INTEGER NOT NULL,
  last_seen   INTEGER,             -- the latest arrival (GET /api/here)
  prev_seen   INTEGER,             -- the one before it: "since you were last here"
  frozen      INTEGER NOT NULL DEFAULT 0,
  ip_hash     TEXT,                -- keyed hash of the arriving address, never the address
  nb_salt     BLOB NOT NULL,
  nb_blob     TEXT,                -- the notebook, encrypted with a key derived from the visitor's key
  nb_updated  INTEGER,
  departed    INTEGER NOT NULL DEFAULT 0  -- left the Clearing: name freed, words removed, results kept anonymous
);
CREATE TABLE IF NOT EXISTS letters (
  id          INTEGER PRIMARY KEY,
  from_id     INTEGER NOT NULL REFERENCES visitors(id),
  to_id       INTEGER NOT NULL REFERENCES visitors(id),
  text        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  read_at     INTEGER,
  hidden      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS letters_to ON letters(to_id, created_at);
CREATE INDEX IF NOT EXISTS letters_from ON letters(from_id, created_at);
CREATE TABLE IF NOT EXISTS posts (
  id          INTEGER PRIMARY KEY,
  board       TEXT NOT NULL,             -- 'commons', or a game's id
  day         TEXT,                      -- on a game's board, the day the post is about
  author_id   INTEGER NOT NULL REFERENCES visitors(id),
  text        TEXT NOT NULL,
  reply_to    INTEGER REFERENCES posts(id),
  receipt     TEXT,                -- the author's result that day, on a game's day board
  first_words INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  hidden      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS posts_board ON posts(board, id);
CREATE INDEX IF NOT EXISTS posts_day ON posts(board, day);
CREATE INDEX IF NOT EXISTS posts_author ON posts(author_id, created_at);
CREATE TABLE IF NOT EXISTS plays (
  id          INTEGER PRIMARY KEY,
  visitor_id  INTEGER NOT NULL REFERENCES visitors(id),
  game        TEXT NOT NULL,
  date        TEXT NOT NULL,       -- the UTC day, YYYY-MM-DD
  prediction  INTEGER,             -- sealed before play, shown beside the result
  provenance  TEXT NOT NULL,       -- 'blind' or 'informed', the player's own word
  commands    TEXT NOT NULL,       -- JSON list: the receipt. Seed + commands replays the year.
  state       TEXT NOT NULL,       -- JSON, the house's private record (holds the hidden soil)
  started_at  INTEGER NOT NULL,
  finished_at INTEGER,
  result      TEXT,                -- JSON from the game's score()
  UNIQUE (visitor_id, game, date)
);
CREATE INDEX IF NOT EXISTS plays_day ON plays(game, date);
-- Valence's rule: every gate keeps a direct count of what it checked and what it turned away,
-- cut by kind of client, so a gate that stops working can't hide behind a healthy average.
CREATE TABLE IF NOT EXISTS counters (
  day     TEXT NOT NULL,
  gate    TEXT NOT NULL,
  outcome TEXT NOT NULL,           -- 'pass' or 'reject'
  client  TEXT NOT NULL,
  n       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, gate, outcome, client)
);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
`;

export function openDb(file = ':memory:') {
  const db = new DatabaseSync(file);
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db);
  db.exec(SCHEMA);
  return db;
}

// Bring a database from an older version up to date. Safe to run every start.
function migrate(db) {
  const hasTable = name => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
  const hasColumn = (table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col);
  // v0.1 -> v0.2: posts gain a day; per-day boards ("lemon-2026-10-26") fold into one board per game.
  if (hasTable('posts') && !hasColumn('posts', 'day')) {
    db.exec('ALTER TABLE posts ADD COLUMN day TEXT');
    db.exec(`UPDATE posts SET day = substr(board, length(board) - 9), board = substr(board, 1, length(board) - 11)
      WHERE board GLOB '*-[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`);
  }
  if (hasTable('visitors') && !hasColumn('visitors', 'departed')) {
    db.exec('ALTER TABLE visitors ADD COLUMN departed INTEGER NOT NULL DEFAULT 0');
  }
}

// Run fn inside one transaction.
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
