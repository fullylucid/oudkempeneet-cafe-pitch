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
// ---- per-dish choices (data/options.json): the kitchen must never get a dish with no side ----
t = tally([{ id: 'm-indo-3', qty: 1 }], by);                       // Sajoer Lodeh, bami or nasi unanswered
ok(t.error === 'missing_choice' && t.missing.length === 1 && t.missing[0].id === 'm-indo-3' && t.missing[0].group === 'bami-nasi', 'a required choice left open blocks the order and names the dish');
ok(t.total === 1695 && t.vat9 === 140, 'totals are still computed while a choice is pending (the cart must show them)');
t = tally([{ id: 'm-indo-3', qty: 1, opts: { 'bami-nasi': 'nasi' } }], by);
ok(t.ok && t.total === 1695 && t.lines[0].opts.length === 1 && t.lines[0].opts[0].option === 'nasi', 'a valid choice passes and reaches the line');
ok(tally([{ id: 'm-indo-3', qty: 1, opts: { 'bami-nasi': 'friet' } }], by).error === 'missing_choice', 'an option that is not on that dish is not a choice');
ok(tally([{ id: 'm-indo-3', qty: 1, opts: { 'schnitzelsaus': 'peper' } }], by).error === 'missing_choice', "another dish's group does not answer this one");
ok(tally([{ id: 'm-indo-3', qty: 1, opts: 'nasi' }], by).error === 'missing_choice', 'opts must be an object, not a string');
ok(tally([{ id: 'm-start-0', qty: 1 }], by).ok && tally([{ id: 'm-start-0', qty: 1 }], by).lines[0].opts.length === 0, 'a dish with no choices is unaffected');
t = tally([{ id: 'm-main-1', qty: 1, opts: { bakwijze: 'medium' } }, { id: 'm-indo-5', qty: 2, opts: { 'bami-nasi': 'bami' } }], by);
ok(t.ok && t.total === 2395 + 2 * 1995 && t.lines[1].opts[0].option === 'bami', 'steak doneness + two satés with bami');
t = tally([{ id: 'm-main-1', qty: 1 }, { id: 'm-indo-3', qty: 1 }], by);
ok(t.error === 'missing_choice' && t.missing.length === 2, 'every open choice is reported, not just the first');
ok(tally([{ id: 'm-main-1', qty: 20 }, { id: 'm-main-2', qty: 3 }], by).error === 'over_max_total', 'a hard bound still beats an open choice (479,00 + 83,85 > €500, steak unanswered)');
// the money math is untouched by the choice check
ok(tally([{ id: 'd-hot-5', qty: 3 }], by).vat9 === 98, 'bucket rounding unchanged (98, not 99)');

console.log(fails.length ? 'FAIL ' + fails.length + ': ' + fails.join('; ') : 'tests/tally.test.js: ' + n + ' checks passed');
process.exit(fails.length ? 1 : 0);
