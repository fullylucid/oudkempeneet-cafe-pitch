-- 0003 — the staff side (/beheer): who may log in, their sessions, the opening hours the café now
-- keeps itself, and a log of every change. 0001 and 0002 are frozen (applied to the café's D1 on
-- 2026-11-12); everything new is a new file. Nothing here touches orders or the menu.

-- Staff are addresses, not passwords: a login is a one-time link mailed to the address. No address
-- is written into this public repository: while the table is empty, the Worker makes the café's
-- verified order inbox the first owner (admin.js, firstOwner).
CREATE TABLE IF NOT EXISTS staff (
  email        TEXT PRIMARY KEY,             -- lower case
  role         TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','staff')),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  disabled_at  TEXT
);

-- One-time login links. Only the SHA-256 of the token is stored: reading this table logs nobody in.
CREATE TABLE IF NOT EXISTS staff_login (
  token_hash   TEXT PRIMARY KEY,
  email        TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,                -- 15 minutes
  used_at      TEXT
);
CREATE INDEX IF NOT EXISTS staff_login_email ON staff_login (email, created_at);

-- Sessions, same rule: the cookie holds the id, the table holds its hash.
CREATE TABLE IF NOT EXISTS staff_sessions (
  id_hash      TEXT PRIMARY KEY,
  email        TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,                -- 30 days, fixed
  last_seen_at TEXT,
  revoked_at   TEXT
);

-- Opening hours. The week is the rule; an exception is one calendar date that differs from it
-- (closed for a holiday, shorter on Christmas Eve). Minutes since midnight, Europe/Amsterdam.
CREATE TABLE IF NOT EXISTS hours_week (
  wd           INTEGER PRIMARY KEY CHECK (wd BETWEEN 0 AND 6),   -- 0 = Sunday
  closed       INTEGER NOT NULL DEFAULT 0 CHECK (closed IN (0,1)),
  open_min     INTEGER NOT NULL CHECK (open_min BETWEEN 0 AND 1439),
  close_min    INTEGER NOT NULL CHECK (close_min BETWEEN 1 AND 1440),
  CHECK (open_min < close_min)
);
-- The hours the site has always shown: Mon–Thu 15:00, Fri–Sun 12:30, closing 21:00.
INSERT OR IGNORE INTO hours_week (wd, closed, open_min, close_min) VALUES
  (0,0,750,1260),(1,0,900,1260),(2,0,900,1260),(3,0,900,1260),(4,0,900,1260),(5,0,750,1260),(6,0,750,1260);

CREATE TABLE IF NOT EXISTS hours_exceptions (
  date         TEXT PRIMARY KEY CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  closed       INTEGER NOT NULL CHECK (closed IN (0,1)),
  open_min     INTEGER,
  close_min    INTEGER,
  note_nl      TEXT, note_en TEXT, note_de TEXT,   -- shown to guests: "Gesloten wegens vakantie"
  updated_at   TEXT NOT NULL,
  updated_by   TEXT NOT NULL,
  CHECK (closed = 1 OR (open_min IS NOT NULL AND close_min IS NOT NULL AND open_min < close_min AND open_min >= 0 AND close_min <= 1440))
);

-- Every change made through /beheer: who, when, what. Read-only from the app.
CREATE TABLE IF NOT EXISTS audit_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  at           TEXT NOT NULL,
  who          TEXT NOT NULL,
  action       TEXT NOT NULL,                -- login | logout | hours_week | hours_day | hours_day_clear
  detail       TEXT
);
