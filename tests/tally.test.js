// node tests/tally.test.js — the totals function (gate condition 6). Run from repo root.
const { tally } = require('../src/tally.js');
const fs = require('fs');
const menu = JSON.parse(fs.readFileSync('data/menu.json', 'utf8')).items;
const by = {}; menu.forEach(m => by[m.id] = m);
let n = 0, fails = [];
const ok = (c, m) => { n++; if (!c) fails.push(m); };
let t = tally([{ id: 'm-start-0', qty: 1 }], by);                 // Soep 8,50 @9%
ok(t.ok && t.total === 850 && t.vat9 === 70 && t.vat21 === 0, 'single 9% line: 850 incl → vat 70 (850*9/109=70.18)');
t = tally([{ id: 'd-beer-2', qty: 2 }], by);                       // Heineken 3,40 ×2 @21%
ok(t.ok && t.total === 680 && t.vat21 === 118 && t.alcohol === true, 'two 21% lines: 680 → vat 118 (117.98); alcohol flagged');
t = tally([{ id: 'm-start-0', qty: 1 }, { id: 'd-beer-2', qty: 1 }], by);
ok(t.ok && t.sub9 === 850 && t.sub21 === 340 && t.total === 1190 && t.vat9 === 70 && t.vat21 === 59, 'mixed buckets kept apart');
// bucket rounding ≠ sum of per-line roundings: 3 × 3,95 (Latte @9%): per-line 33 each = 99; bucket 1185*9/109 = 97.84 → 98
t = tally([{ id: 'd-hot-5', qty: 3 }], by);
ok(t.ok && t.total === 1185 && t.vat9 === 98, 'VAT from bucket subtotal (98), not per-line sum (99)');
ok(tally([{ id: 'd-hot-8', qty: 1 }], by).vat21 === 148 && tally([{ id: 'd-hot-8', qty: 1 }], by).alcohol, 'Irish Coffee is 21% + alcohol');
ok(tally([{ id: 'd-beer-13', qty: 1 }], by).alcohol === false, 'Liefmans 0.0 is not alcohol');
ok(tally([], by).error === 'empty', 'empty cart');
ok(tally([{ id: 'nope', qty: 1 }], by).error === 'unknown_item', 'unknown item');
ok(tally([{ id: 'm-main-0', qty: 1 }], by).error === 'not_orderable', 'fondue refused');
ok(tally([{ id: 'd-beer-0', qty: 1 }], by).error === 'not_orderable', 'draught refused');
ok(tally([{ id: 'm-start-0', qty: 21 }], by).error === 'bad_qty', 'qty > 20');
ok(tally([{ id: 'm-start-0', qty: 0 }], by).error === 'bad_qty', 'qty 0');
ok(tally([{ id: 'm-start-0', qty: 1.5 }], by).error === 'bad_qty', 'fractional qty');
ok(tally([{ id: 'm-start-0', qty: '2' }], by).error === 'bad_qty', 'string qty refused');
ok(tally(Array.from({ length: 51 }, () => ({ id: 'm-start-0', qty: 1 })), by).error === 'too_many_lines', '> 50 lines');
ok(tally([{ id: 'm-main-2', qty: 18 }], by).error === 'over_max_total', '18 × 27,95 = 503,10 > €500');
ok(tally([{ id: 'm-start-0', qty: 1 }], by, { minOrderCents: 1000 }).error === 'under_minimum', 'minimum order honoured when set');
ok(tally([{ id: 'm-start-0', qty: 1, note: 'x'.repeat(500) }], by).lines[0].note.length === 200, 'line note capped at 200');
// prices never trusted from the client
t = tally([{ id: 'm-start-0', qty: 1, unit: 1, price_cents: 1 }], by); ok(t.total === 850, 'client-supplied price ignored');
console.log(fails.length ? 'FAIL ' + fails.length + ': ' + fails.join('; ') : 'tests/tally.test.js: ' + n + ' checks passed');
process.exit(fails.length ? 1 : 0);
