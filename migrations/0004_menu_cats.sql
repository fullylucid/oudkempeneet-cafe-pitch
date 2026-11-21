-- 0004 — the menu's categories move into D1. Until now a dish only carried a category id; the
-- category's order, its trilingual label and the note printed under it lived in data/menu.json and
-- were baked into the ordering page at build time. The menu manager (/beheer/menu) and the ordering
-- page now both read them from here, so the café can rename, reorder and add categories itself.
-- Seeded from data/menu.json as it stood on 2026-11-21 (Dave's takeaway card).
CREATE TABLE IF NOT EXISTS menu_cats (
  id          TEXT PRIMARY KEY,              -- what menu_items.cat holds
  pos         INTEGER NOT NULL,
  label_nl    TEXT NOT NULL, label_en TEXT NOT NULL, label_de TEXT NOT NULL,
  note_nl     TEXT, note_en TEXT, note_de TEXT,   -- shown under the category heading on the ordering page
  archived_at TEXT
);
INSERT OR IGNORE INTO menu_cats (id, pos, label_nl, label_en, label_de, note_nl, note_en, note_de) VALUES
  ('pizza',0,'Pizza''s','Pizzas','Pizzen',NULL,NULL,NULL),
  ('indo',1,'Indonesische gerechten','Indonesian dishes','Indonesische Gerichte',NULL,NULL,NULL),
  ('friet',2,'Friet','French fries','Pommes frites',NULL,NULL,NULL),
  ('saus',3,'Sauzen','Sauces','Soßen','Maximaal 2 sauzen per portie. Sauzen worden apart berekend.','Maximum 2 sauces per portion. Sauces are charged separately.','Maximal 2 Soßen pro Portion. Soßen werden extra berechnet.'),
  ('snack',4,'Snacks','Snacks','Snacks','Broodje erbij +€ 1,10. Saus naar keuze volgens de sausprijzen hierboven. Maximaal 2 sauzen per snack. Sauzen worden apart berekend.','Add a bread roll +€ 1.10. Sauce of your choice at the sauce prices above. Maximum 2 sauces per snack. Sauces are charged separately.','Brötchen dazu +€ 1,10. Soße nach Wahl zu den Soßenpreisen oben. Maximal 2 Soßen pro Snack. Soßen werden extra berechnet.'),
  ('borrel',5,'Bittergarnituur & hapjes','Fried snacks & appetizers','Frittierte Snacks & Häppchen','Extra sauzen kunnen worden geselecteerd volgens de bovenstaande sausprijzen, maximaal 2 per product.','Extra sauces can be added at the sauce prices above, maximum 2 per product.','Extra Soßen können zu den Soßenpreisen oben gewählt werden, maximal 2 pro Produkt.');
