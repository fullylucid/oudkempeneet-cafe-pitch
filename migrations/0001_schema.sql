-- Oud-Kempen takeaway ordering — D1 schema (Part One). Gate: merritt 0ae72b4.
-- Money is integer cents. Names/prices on order lines are SNAPSHOTS (a later menu edit never rewrites history).
CREATE TABLE IF NOT EXISTS menu_items (
  id            TEXT PRIMARY KEY,            -- e.g. m-main-1 (from menu.html i18n key)
  kind          TEXT NOT NULL CHECK (kind IN ('food','drink')),
  cat           TEXT NOT NULL,               -- start|main|lunch|snack|indo|veg|kids|pancake|dessert|extra|hot|soft|beer|wine|spirit|cocktail
  pos           INTEGER NOT NULL,            -- order within the category
  name_nl       TEXT NOT NULL,
  name_en       TEXT NOT NULL,
  name_de       TEXT NOT NULL,
  desc_nl       TEXT,
  desc_en       TEXT,
  desc_de       TEXT,
  price_cents   INTEGER NOT NULL CHECK (price_cents > 0),
  vat_rate      INTEGER NOT NULL CHECK (vat_rate IN (9,21)),   -- per item, client-signed (Q17)
  orderable     INTEGER NOT NULL DEFAULT 1 CHECK (orderable IN (0,1)),
  orderable_note TEXT,
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS menu_items_cat ON menu_items (kind, cat, pos);

CREATE TABLE IF NOT EXISTS orders (
  id              TEXT PRIMARY KEY,          -- long random id (status endpoint key — gate cond. 5)
  public_ref      TEXT NOT NULL UNIQUE,      -- 4-char human ref for subjects and staff; NEVER a lookup key
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','paid','failed','expired','cancelled')),
  lang            TEXT NOT NULL CHECK (lang IN ('nl','en','de')),
  currency        TEXT NOT NULL DEFAULT 'EUR',
  subtotal_cents  INTEGER NOT NULL,          -- inclusive
  vat_low_cents   INTEGER NOT NULL,          -- 9% bucket, from that bucket's inclusive subtotal (gate cond. 6)
  vat_high_cents  INTEGER NOT NULL,          -- 21% bucket
  total_cents     INTEGER NOT NULL,
  customer_name   TEXT,                      -- nullable: stripped by the retention sweep (Q15 = b: never, by ruling; the sweep honours the setting)
  customer_email  TEXT,
  customer_phone  TEXT,
  order_note      TEXT,                      -- one note for the whole order (Q23 = a: plus line_note per item)
  pickup_eta_min  INTEGER NOT NULL,          -- standard wait at order time (Q7 = 45)
  msp_order_id    TEXT UNIQUE,               -- webhook idempotency; must match before any write (gate cond. 4)
  msp_status      TEXT,                      -- last raw MultiSafepay status seen
  msp_refund_cents INTEGER NOT NULL DEFAULT 0, -- recorded only; no state change in Part One
  alert_sent_at   TEXT,
  confirm_sent_at TEXT,
  alert_attempts  INTEGER NOT NULL DEFAULT 0,
  contact_stripped_at TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  paid_at         TEXT
);
CREATE INDEX IF NOT EXISTS orders_status_created ON orders (status, created_at);
CREATE INDEX IF NOT EXISTS orders_unsent ON orders (status, alert_sent_at);

CREATE TABLE IF NOT EXISTS order_items (
  order_id        TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  line            INTEGER NOT NULL,
  item_id         TEXT NOT NULL,             -- reference only; the snapshot below is authoritative
  qty             INTEGER NOT NULL CHECK (qty BETWEEN 1 AND 20),   -- gate cond. 6
  unit_price_cents INTEGER NOT NULL,
  vat_rate        INTEGER NOT NULL CHECK (vat_rate IN (9,21)),
  name_snapshot   TEXT NOT NULL,             -- in the order's language
  line_note       TEXT,                      -- per-item request (Q23 = a, ruled 2026-09-05)
  PRIMARY KEY (order_id, line)
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Values the rulings change without code (gate: Q37/Q38 are settings); hours per Q6/Q7/Q9.
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('last_orders_offset_min', '30'),
  ('standard_wait_min', '45'),
  ('min_order_cents', '0'),
  ('strip_contact_after_days', '0'),          -- 0 = never (Q15 = b, ruled 2026-09-05; AVG exposure flagged in RULINGS.md)
  ('cart_max_lines', '50'),
  ('cart_max_qty_per_line', '20'),
  ('cart_max_total_cents', '50000'),
  ('msp_seconds_active', '1800');
