// node tests/menu.test.js — the menu manager's server side (ordering/worker/src/menu.js), pure parts:
// what an operation may do, what it may never do, who may do it, and what a customer's page is told.
// The batch itself (D1) is run on `wrangler dev --local` before a deploy (DEPLOY.md, "Back office").
const fs = require('fs');
let n = 0; const fails = [];
const ok = (c, m) => { n++; if (!c) fails.push(m); };
(async () => {
  const menu = await import('../ordering/worker/src/menu.js');
  const NOW = '2026-11-21T18:00:00.000Z', owner = () => true, staff = a => a === 'menu_soldout', nobody = () => false;
  const rows = () => ({
    items: [
      { id: 'pizza-margherita', kind: 'food', cat: 'pizza', pos: 0, name_nl: 'Margherita', name_en: 'Margherita', name_de: 'Margherita', desc_nl: 'Tomatensaus en kaas.', desc_en: null, desc_de: null, price_cents: 1250, vat_rate: 9, orderable: 1, orderable_note: null, prep_minutes: null, sold_out_at: null },
      { id: 'pizza-funghi', kind: 'food', cat: 'pizza', pos: 1, name_nl: 'Funghi', name_en: 'Funghi', name_de: 'Funghi', price_cents: 1350, vat_rate: 9, orderable: 1, sold_out_at: '2026-11-20T18:00:00.000Z' },
      { id: 'friet-normaal', kind: 'food', cat: 'friet', pos: 0, name_nl: 'Friet', name_en: 'Fries', name_de: 'Pommes', price_cents: 350, vat_rate: 9, orderable: 1 },
      { id: 'saus-mayonaise', kind: 'food', cat: 'saus', pos: 0, name_nl: 'Mayonaise', name_en: 'Mayonnaise', name_de: 'Mayonnaise', price_cents: 100, vat_rate: 9, orderable: 0, orderable_note: 'sauce' },
      { id: 'los-ding', kind: 'food', cat: 'vergeten', pos: 0, name_nl: 'Los', name_en: 'Los', name_de: 'Los', price_cents: 500, vat_rate: 9, orderable: 1 }],
    opts: [{ item_id: 'friet-normaal', group_id: 'saus', option_id: 'mayo', required: 0, source: 'menu', group_nl: 'Saus', group_en: 'Sauce', group_de: 'Soße', label_nl: 'Mayonaise', label_en: 'Mayonnaise', label_de: 'Mayonnaise', price_cents: 100 }],
    cats: [{ id: 'pizza', pos: 0, label_nl: "Pizza's", label_en: 'Pizzas', label_de: 'Pizzen' }, { id: 'friet', pos: 1, label_nl: 'Friet', label_en: 'French fries', label_de: 'Pommes frites' }, { id: 'saus', pos: 2, label_nl: 'Sauzen', label_en: 'Sauces', label_de: 'Soßen', note_nl: 'Max 2', note_en: 'Max 2', note_de: 'Max 2' }],
  });
  const M = () => { const r = rows(); return menu.shape(r.items, r.opts, r.cats); };
  const plan = (ops, may) => menu.planOps(ops, M(), may || owner, NOW);

  // ---- reading
  const m = M();
  ok(m.items.length === 5 && m.items[0].name.nl === 'Margherita' && m.items[0].desc.en === '' && m.items[2].options[0].options[0].price_cents === 100, 'rows become the shape both pages use: trilingual names, option groups');
  ok(m.cats.map(c => c.id).join() === 'pizza,friet,saus,vergeten' && m.cats[2].note.nl === 'Max 2' && m.cats[0].note === null, 'categories in order with their note; a dish in a category with no row still gets one, last');
  ok(menu.soldOutToday('2026-11-21T10:00:00Z', '2026-11-21') && !menu.soldOutToday('2026-11-20T18:00:00Z', '2026-11-21') && !menu.soldOutToday(null, '2026-11-21') && !menu.soldOutToday('rubbish', '2026-11-21'), 'sold out lasts for the day it was set on');
  ok(menu.soldOutToday('2026-11-21T23:30:00Z', '2026-11-22'), 'the day is Amsterdam\'s: 23:30 UTC belongs to the 22nd');
  const pub = menu.forCustomers(M(), '2026-11-20'), pf = pub.items.find(x => x.id === 'pizza-funghi');
  ok(pf.orderable === false && pf.orderable_note === 'sold_out', 'customers on the 20th: Funghi is not orderable, reason sold_out');
  ok(menu.forCustomers(M(), '2026-11-21').items.find(x => x.id === 'pizza-funghi').orderable === true, 'customers on the 21st: it is back by itself');
  ok(pub.items.find(x => x.id === 'saus-mayonaise').orderable === false && pub.items.find(x => x.id === 'saus-mayonaise').orderable_note === 'sauce', 'never-for-takeaway keeps its own reason');
  ok(!('sold_out_at' in pf) && !('prep_minutes' in pf) && !('pos' in pf), 'the public menu carries no staff-only fields');

  // ---- updates
  let p = plan([{ op: 'update', id: 'pizza-margherita', fields: { price_cents: 1295, name: { en: '  Margherita   classic ' }, prep_minutes: 12 } }]);
  ok(p.ok && p.statements.length === 1 && /^update menu_items set price_cents=\?,name_en=\?,prep_minutes=\?,updated_at=\? where id=\? and archived_at is null$/.test(p.statements[0].sql) && JSON.stringify(p.statements[0].args) === JSON.stringify([1295, 'Margherita classic', 12, NOW, 'pizza-margherita']), 'an update writes exactly the named fields, values bound, text tidied');
  ok(plan([{ op: 'update', id: 'pizza-margherita', fields: { orderable: true } }]).error === 'field:orderable', '`orderable` is refused, not ignored: it is not a daily switch');
  ok(plan([{ op: 'update', id: 'pizza-margherita', fields: { archived_at: null } }]).error === 'field:archived_at' && plan([{ op: 'update', id: 'pizza-margherita', fields: { id: 'x' } }]).error === 'field:id', 'unknown or structural fields are refused');
  for (const bad of [0, -5, 12.5, '1295', 50001, null]) ok(plan([{ op: 'update', id: 'pizza-margherita', fields: { price_cents: bad } }]).error === 'price', 'price ' + JSON.stringify(bad) + ' is refused (whole cents, 1 to 50000)');
  ok(plan([{ op: 'update', id: 'pizza-margherita', fields: { vat_rate: 6 } }]).error === 'vat' && plan([{ op: 'update', id: 'pizza-margherita', fields: { vat_rate: 21 } }]).ok, 'VAT is 9 or 21');
  ok(plan([{ op: 'update', id: 'pizza-margherita', fields: { name: { nl: '   ' } } }]).error === 'name' && plan([{ op: 'update', id: 'pizza-margherita', fields: { name: 'Pizza' } }]).error === 'name', 'the Dutch name cannot be emptied; a name must be per language');
  ok(plan([{ op: 'update', id: 'pizza-margherita', fields: { desc: { nl: '' } } }]).statements[0].args[0] === null, 'an emptied description is stored as NULL');
  ok(plan([{ op: 'update', id: 'pizza-margherita', fields: { cat: 'bestaat-niet' } }]).error === 'cat' && plan([{ op: 'update', id: 'pizza-margherita', fields: { cat: 'friet' } }]).ok, 'a dish can only move to a category that exists');
  ok(plan([{ op: 'update', id: 'nope', fields: { price_cents: 100 } }]).error === 'unknown_item' && plan([{ op: 'update', id: 'pizza-margherita', fields: {} }]).error === 'fields', 'unknown dish; empty update');
  p = plan([{ op: 'update', id: 'pizza-margherita', fields: { sold_out_at: '1999-01-01T00:00:00Z' } }]);
  ok(p.ok && p.statements[0].args[0] === NOW, 'sold out is stamped with the SERVER\'s clock, whatever the tablet sent');
  ok(plan([{ op: 'update', id: 'pizza-margherita', fields: { sold_out_at: null } }]).statements[0].args[0] === null, 'un-marking stores NULL');

  // ---- roles
  ok(plan([{ op: 'update', id: 'pizza-margherita', fields: { sold_out_at: NOW } }], staff).ok, 'staff may mark a dish sold out');
  ok(plan([{ op: 'update', id: 'pizza-margherita', fields: { sold_out_at: NOW, price_cents: 1 } }], staff).error === 'role', 'staff may not smuggle a price into the same update');
  for (const op of [{ op: 'update', id: 'pizza-margherita', fields: { price_cents: 100 } }, { op: 'option_price', item_id: 'friet-normaal', group_id: 'saus', option_id: 'mayo', price_cents: 0 }, { op: 'archive', id: 'pizza-margherita' }, { op: 'reorder', cat: 'pizza', ids: ['pizza-funghi', 'pizza-margherita'] }, { op: 'create', item: { kind: 'food', cat: 'pizza', name: { nl: 'Nieuw' }, price_cents: 100, vat_rate: 9 } }])
    ok(plan([op], staff).error === 'role' && plan([op], nobody).error === 'role' && plan([op], owner).ok, op.op + ': owner only');
  ok(plan([{ op: 'update', id: 'pizza-margherita', fields: { sold_out_at: NOW } }], nobody).error === 'role', 'no rights: not even sold out');

  // ---- options, archive, reorder, create
  p = plan([{ op: 'option_price', item_id: 'friet-normaal', group_id: 'saus', option_id: 'mayo', price_cents: 125 }]);
  ok(p.ok && JSON.stringify(p.statements[0].args) === JSON.stringify([125, 'friet-normaal', 'saus', 'mayo']), 'a choice gets its price');
  ok(plan([{ op: 'option_price', item_id: 'friet-normaal', group_id: 'saus', option_id: 'ketchup', price_cents: 1 }]).error === 'unknown_option' && plan([{ op: 'option_price', item_id: 'friet-normaal', group_id: 'saus', option_id: 'mayo', price_cents: -1 }]).error === 'price', 'unknown choice; negative price');
  p = plan([{ op: 'archive', id: 'pizza-funghi' }]);
  ok(p.ok && /^update menu_items set archived_at=\?/.test(p.statements[0].sql) && !/delete/i.test(JSON.stringify(p.statements)), 'removing a dish archives it; nothing is ever deleted');
  ok(plan([{ op: 'archive', id: 'pizza-funghi' }, { op: 'update', id: 'pizza-funghi', fields: { price_cents: 100 } }]).error === 'unknown_item', 'a dish archived earlier in the batch cannot be edited later in it');
  p = plan([{ op: 'reorder', cat: 'pizza', ids: ['pizza-funghi', 'pizza-margherita'] }]);
  ok(p.ok && p.statements.length === 1 && p.statements[0].args[0] === '["pizza-funghi","pizza-margherita"]', 'a reorder is ONE statement, whatever the length of the category');
  ok(plan([{ op: 'reorder', cat: 'pizza', ids: ['pizza-funghi', 'friet-normaal'] }]).error === 'reorder' && plan([{ op: 'reorder', cat: 'pizza', ids: ['pizza-funghi', 'pizza-funghi'] }]).error === 'reorder' && plan([{ op: 'reorder', cat: 'nope', ids: [] }]).error === 'reorder', 'reorder refuses a dish from another category, a duplicate, an unknown category');
  p = plan([{ op: 'create', item: { id: 'nieuw-1-ab12', kind: 'food', cat: 'pizza', pos: 2, name: { nl: 'Quattro Formaggi', en: '', de: '' }, desc: { nl: 'Vier kazen.' }, price_cents: 1495, vat_rate: 9, orderable: false, orderable_note: 'x', options: [{ id: 'evil' }] } }, { op: 'reorder', cat: 'pizza', ids: ['nieuw-1-ab12', 'pizza-margherita', 'pizza-funghi'] }]);
  const ins = p.ok && p.statements[0];
  ok(p.ok && ins.args[0] === 'pizza-quattro-formaggi' && ins.args[4] === 'Quattro Formaggi' && ins.args[5] === 'Quattro Formaggi' && ins.args[10] === 1495, 'a new dish gets its id from the SERVER (category + name); missing translations fall back to Dutch');
  ok(/,1,\?,\?\)$/.test(ins.sql) && !JSON.stringify(ins.args).includes('evil'), 'a new dish is always orderable=1 and carries no options from the page');
  ok(ins.args[3] === 0 && p.statements.length === 2 && p.statements[1].args[2] === '["nieuw-1-ab12"]', 'reordering a batch with a new dish: its position goes into the insert, the others into the one update');
  ok(plan([{ op: 'create', item: { kind: 'food', cat: 'pizza', name: { nl: 'Margherita' }, price_cents: 100, vat_rate: 9 } }]).statements[0].args[0] === 'pizza-margherita-2', 'a name that already exists gets a numbered id, never an overwrite');
  ok(plan([{ op: 'create', item: { kind: 'food', cat: 'pizza', name: { nl: '' }, price_cents: 100, vat_rate: 9 } }]).error === 'name' && plan([{ op: 'create', item: { kind: 'food', cat: 'pizza', name: { nl: 'X' }, price_cents: 0, vat_rate: 9 } }]).error === 'price' && plan([{ op: 'create', item: { kind: 'robot', cat: 'pizza', name: { nl: 'X' }, price_cents: 1, vat_rate: 9 } }]).error === 'kind' && plan([{ op: 'create', item: { kind: 'food', cat: 'x', name: { nl: 'X' }, price_cents: 1, vat_rate: 9 } }]).error === 'cat', 'a new dish needs a Dutch name, a price, a known kind and category');

  // ---- the batch as a whole
  p = plan([{ op: 'update', id: 'pizza-margherita', fields: { price_cents: 1295 } }, { op: 'update', id: 'nope', fields: { price_cents: 1 } }]);
  ok(p.error === 'unknown_item' && p.at === 1 && !p.statements, 'one bad operation refuses the whole batch and names its position; no statement is planned');
  ok(plan([]).error === 'empty' && plan(null).error === 'empty' && plan(Array(201).fill({ op: 'archive', id: 'x' })).error === 'too_many' && plan([{ op: 'drop table' }]).error === 'op' && plan(['x']).error === 'op', 'empty, oversized and unknown batches are refused');
  ok(p = plan([{ op: 'update', id: 'pizza-margherita', fields: { name: { nl: "Robert'); DROP TABLE menu_items;--" } } }]), 'hostile text plans');
  ok(!p.statements[0].sql.includes('DROP') && p.statements[0].args[0].includes('DROP'), 'text never reaches the SQL string, only the bound values');
  ok(plan([{ op: 'update', id: 'pizza-margherita', fields: { price_cents: 1295 } }]).log[0].fields.join() === 'price_cents', 'the log entry names what changed');

  // ---- wiring
  const adm = fs.readFileSync('ordering/worker/src/admin.js', 'utf8'), db = fs.readFileSync('ordering/worker/src/db.js', 'utf8'), ord = fs.readFileSync('ordering/worker/src/orders.js', 'utf8');
  ok(/planOps\(body\.ops, await readMenu\(env\), a => can\(me, a\), nowIso\(\)\)/.test(adm) && /env\.DB\.batch\(plan\.statements/.test(adm) && /dropMenuCache\(\);\n  await audit\(env, me\.email, 'menu'/.test(adm), 'saveMenu: plan with the caller\'s rights, one batch, cache dropped, logged');
  ok(/orderable: !!i\.orderable && !soldOutToday\(i\.sold_out_at, today\)/.test(db), 'the order guard treats sold-out-today as not orderable');
  ok(/Number\.isInteger\(body\.total_cents\) && body\.total_cents !== t\.total\) return json\(\{ error: 'price_changed'/.test(ord), 'an order whose shown total no longer matches is refused before any payment starts');
  const page = fs.readFileSync('ordering/site/index.html', 'utf8');
  ok(/fetch\('\/api\/menu'/.test(page) && /total_cents:t\.total/.test(page) && /price_changed/.test(page), 'the built ordering page asks /api/menu, sends the total it showed and knows price_changed');
  const live = fs.readFileSync('ordering/site/beheer/menu.html', 'utf8'), ljs = fs.readFileSync('ordering/site/beheer/menu.js', 'utf8');
  ok(!/<style|\sstyle=|<script(?![^>]*\bsrc=)/.test(live) && /var LIVE=true;/.test(ljs) && /var MENU=\/\*__MENU__\*\/\[\];/.test(ljs), 'the live manager page has no inline script or style and no menu baked in');
  const tpl = fs.readFileSync('beheer/beheer.template.html', 'utf8'), m1 = /<script>\n?([\s\S]*?)<\/script>/.exec(tpl)[1].replace('/*__LIVE__*/false', 'true');
  ok(m1 === ljs, 'menu.js is the template\'s script, built, not a hand-kept copy (run tools/build-beheer.py --live)');

  console.log(fails.length ? 'tests/menu.test.js: FAIL\n  ' + fails.join('\n  ') : 'tests/menu.test.js: ' + n + ' checks passed');
  process.exit(fails.length ? 1 : 0);
})();
