-- Oud-Kempen takeaway ordering — D1 schema. Gate: merritt 0ae72b4 (Part One), PR #76 (Part Two).
--
-- PART TWO'S COLUMNS ARE FOLDED IN HERE ON PURPOSE. This file has never been applied — no D1
-- exists on the café's account — so a Part Two column costs one line today and a patch migration
-- tomorrow, and a missed patch is not a conflict anybody notices: it is an environment quietly
-- lacking a column that finds out at the first write. Ruled on PR #76 (P2 = yes).
-- The test used for each one: does its SHAPE depend on an unanswered question, or only its USE?
-- prep_minutes, photo_key, item_options.price_cents and the kitchen columns are all use-questions —
-- if the café says no photos or no priced options, those columns simply sit unused at their
-- defaults. Nothing here waits on an answer. THE MOMENT THIS IS APPLIED IT IS FROZEN and every
-- change after it takes a new migration number (DEPLOY.md says the same).
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
  -- Part Two (folded in before first apply — see the note at the top of this file)
  prep_minutes  INTEGER,                     -- per-item prep time; NULL falls back to settings.standard_wait_min
  -- "Sold out today" is a DIFFERENT fact from `orderable`, which already means "never orderable
  -- online" and is correct for all three rows that carry it (the fondue needs a day's notice; the
  -- two draught beers cannot be carried home). Sharing one column made the fondue display as sold
  -- out in the manager, and one careless click would have put a reservation-only dish on the
  -- takeaway menu. A TIMESTAMP rather than a boolean, deliberately: it expresses both answers to
  -- Q19 without a second column or a clearing job — auto-clear reads it as stale once it predates
  -- today's opening; manual-clear reads it as set until nulled. Q19 stops being a schema question.
  sold_out_at   TEXT,
  photo_key     TEXT,                        -- R2 object key; NULL = no photo, which is the whole menu today
  archived_at   TEXT,                        -- soft delete: order lines snapshot names, so history must stay readable
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS menu_items_cat ON menu_items (kind, cat, pos);

-- Per-dish choices. ROWS, not a JSON column on menu_items: Part Two's whole purpose is a menu
-- manager that edits these, and an editor wants to reorder one option, price one option and later
-- sell one out — all row properties. A blob would also have meant two places holding the same
-- truth the moment the manager could write. Resolved from data/options.json by tools/gen-seed.py.
-- `source` = 'menu' when the café's own printed description states the choice, 'implied' when it
-- does not (today only the steak doneness) — the café must confirm an implied one before go-live.
CREATE TABLE IF NOT EXISTS item_options (
  item_id       TEXT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  group_id      TEXT NOT NULL,               -- e.g. bami-nasi
  option_id     TEXT NOT NULL,               -- e.g. nasi
  group_pos     INTEGER NOT NULL DEFAULT 0,  -- order of the questions on a dish
  option_pos    INTEGER NOT NULL DEFAULT 0,  -- order of the answers within a question
  required      INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0,1)),
  source        TEXT NOT NULL CHECK (source IN ('menu','implied')),
  group_nl      TEXT NOT NULL, group_en TEXT NOT NULL, group_de TEXT NOT NULL,
  label_nl      TEXT NOT NULL, label_en TEXT NOT NULL, label_de TEXT NOT NULL,
  -- The surcharge. Ships at 0 for every option that exists today, so the ordering page is
  -- unchanged whatever Q14 decides; Q14 only decides whether the manager exposes it and whether
  -- tally() sums it. The VAT rate is INHERITED from the parent item and deliberately has no column
  -- here: every option on this menu is food-on-food on a 9% dish (verified against the seed), and
  -- a settable rate is a field the owner can get wrong. When the manager can create options, it
  -- must SHOW the inherited rate at the point of pricing, and a newly priced option re-triggers the
  -- per-item client signature that menu_items.vat_rate already carries.
  price_cents   INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  archived_at   TEXT,
  PRIMARY KEY (item_id, group_id, option_id)
);
CREATE INDEX IF NOT EXISTS item_options_item ON item_options (item_id, group_pos, option_pos);

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
  -- Part Two. The kitchen's state is its OWN column, not more values in `status`: an order is
  -- `paid` AND `accepted` at the same time, and folding two state machines into one field is how
  -- you end up unable to express the truth. Deliberately NO CHECK constraint here, unlike `status`
  -- — MultiSafepay fixes that vocabulary, whereas the café may well want a state we have not
  -- thought of, and widening a CHECK in SQLite is a table rebuild. The Worker is the only writer.
  kitchen_state   TEXT NOT NULL DEFAULT 'new',   -- new | accepted | refused
  accepted_at     TEXT,
  accepted_by     TEXT,                      -- identity from the staff login, for "who took this"
  kitchen_prep_min INTEGER,                  -- what the kitchen actually promised, not the estimate
  refused_at      TEXT,
  refused_reason  TEXT,                      -- shown to staff; the refund itself is done by a human
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
CREATE INDEX IF NOT EXISTS orders_kitchen ON orders (kitchen_state, created_at);

CREATE TABLE IF NOT EXISTS order_items (
  order_id        TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  line            INTEGER NOT NULL,
  item_id         TEXT NOT NULL,             -- reference only; the snapshot below is authoritative
  qty             INTEGER NOT NULL CHECK (qty BETWEEN 1 AND 20),   -- gate cond. 6
  unit_price_cents INTEGER NOT NULL,
  vat_rate        INTEGER NOT NULL CHECK (vat_rate IN (9,21)),
  name_snapshot   TEXT NOT NULL,             -- in the order's language
  options_snapshot TEXT,                     -- the choices the customer made, already in the order's language
                                             -- and readable on the ticket, e.g. 'Bami of nasi: Nasi'
  options_cents   INTEGER NOT NULL DEFAULT 0, -- their surcharge at the time of ordering, snapshotted
                                             -- like the price it rides on. 0 for every order today.
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
  ('msp_seconds_active', '1800'),
  -- Part Two ready-time estimate (P4). A kitchen cooks in parallel, so the estimate is the longest
  -- item's prep time plus a little per extra item — not the sum, not the bare maximum. Numbers, not
  -- code, so the café corrects them from experience without a deploy. Until any item has a prep
  -- time these do nothing and standard_wait_min still answers.
  ('ready_extra_item_min', '3'),
  ('ready_round_to_min', '5'),
  ('ready_floor_min', '15');
