// The menu, read and written. D1 is its truth (gate cond. 8). Three readers: the order guard
// (db.js loadMenu, prices only), the ordering page (GET /api/menu, what a customer may see) and the
// menu manager (GET /beheer/api/menu, everything). One writer: the manager's operations
// (POST /beheer/api/menu/ops) — a list of small verbs, validated whole, applied in one batch, logged.
//
// What an operation may NOT do, by design:
//   - touch an order: order lines are snapshots, a price edit never reaches one already placed;
//   - delete a dish: `archive` sets archived_at, history stays readable;
//   - flip `orderable`: that column means "never for takeaway" (sauces on their own, the fondue) and
//     is not a daily switch. Sold out today is `sold_out_at`, its own fact (#12).
import { amsDate } from './hours.js';

const L = ['nl', 'en', 'de'];
const tri = (r, k) => ({ nl: r[k + '_nl'] || '', en: r[k + '_en'] || '', de: r[k + '_de'] || '' });
// Sold out lasts for the Amsterdam calendar day it was set on: tomorrow the dish is back without
// anyone having to remember (Q109 was never answered; this is the default until the café says otherwise).
export function soldOutToday(soldOutAt, today) { if (!soldOutAt) return false; const t = Date.parse(soldOutAt); return !isNaN(t) && amsDate(new Date(t)) === (today || amsDate()); }

export async function readMenu(env) {
  const [items, opts, cats] = await Promise.all([
    env.DB.prepare('select id,kind,cat,pos,name_nl,name_en,name_de,desc_nl,desc_en,desc_de,price_cents,vat_rate,orderable,orderable_note,prep_minutes,sold_out_at from menu_items where archived_at is null order by cat,pos,id').all(),
    env.DB.prepare('select item_id,group_id,option_id,required,source,group_nl,group_en,group_de,label_nl,label_en,label_de,price_cents from item_options where archived_at is null order by item_id,group_pos,option_pos').all(),
    env.DB.prepare('select id,pos,label_nl,label_en,label_de,note_nl,note_en,note_de from menu_cats where archived_at is null order by pos,id').all(),
  ]);
  return shape(items.results, opts.results, cats.results);
}
// Pure: rows → the shape both pages already use (data/menu.json's).
export function shape(items, opts, cats) {
  const by = {}, out = [];
  for (const i of items) { const m = { id: i.id, kind: i.kind, cat: i.cat, pos: i.pos, name: tri(i, 'name'), desc: tri(i, 'desc'), price_cents: i.price_cents, vat_rate: i.vat_rate,
    orderable: !!i.orderable, orderable_note: i.orderable_note || '', prep_minutes: i.prep_minutes === undefined ? null : i.prep_minutes, sold_out_at: i.sold_out_at || null, options: [] }; by[i.id] = m; out.push(m); }
  for (const o of opts) { const m = by[o.item_id]; if (!m) continue;
    let g = m.options.find(x => x.id === o.group_id);
    if (!g) { g = { id: o.group_id, source: o.source, required: !!o.required, label: tri(o, 'group'), options: [] }; m.options.push(g); }
    g.options.push({ id: o.option_id, label: tri(o, 'label'), price_cents: o.price_cents }); }
  const known = new Set(cats.map(c => c.id)), cs = cats.map(c => ({ id: c.id, pos: c.pos, label: tri(c, 'label'), note: (c.note_nl || c.note_en || c.note_de) ? tri(c, 'note') : null }));
  // a dish whose category has no row still has to be visible somewhere: it gets a bare category at the end
  for (const m of out) if (!known.has(m.cat)) { known.add(m.cat); cs.push({ id: m.cat, pos: 1000 + cs.length, label: { nl: m.cat, en: m.cat, de: m.cat }, note: null }); }
  return { cats: cs, items: out };
}
// Pure: what a customer's page gets. Sold out today = not orderable, with a reason the page can show.
export function forCustomers(menu, today) {
  return { cats: menu.cats.map(c => ({ id: c.id, label: c.label, note: c.note })),
    items: menu.items.map(m => { const so = soldOutToday(m.sold_out_at, today);
      return { id: m.id, kind: m.kind, cat: m.cat, name: m.name, desc: m.desc, price_cents: m.price_cents, vat_rate: m.vat_rate, orderable: m.orderable && !so, orderable_note: so ? 'sold_out' : m.orderable_note, options: m.options.map(g => ({ id: g.id, required: g.required, label: g.label, options: g.options })) }; }) };
}

// ---- writing
const text = (v, max) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : null;
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;
export const MAX_OPS = 200, MAX_PRICE = 50000;   // € 500: the cart's own ceiling
function triIn(v, need, max) {   // {nl,en,de} partial → cleaned partial, or null if malformed / a required nl is emptied
  if (!v || typeof v !== 'object') return null; const o = {};
  for (const l of L) if (v[l] !== undefined) { const s = text(v[l], max); if (s === null) return null; o[l] = s; }
  if (need && o.nl !== undefined && !o.nl) return null;
  return Object.keys(o).length ? o : null;
}
// Pure: the manager's operations against the menu as it stands → SQL to run, or the first refusal.
// `may(action)` says what this staff member is allowed: 'menu_soldout' (the daily switch) or 'menu_edit' (everything).
export function planOps(ops, menu, may, now) {
  if (!Array.isArray(ops) || !ops.length) return { error: 'empty' };
  if (ops.length > MAX_OPS) return { error: 'too_many' };
  const items = new Map(menu.items.map(m => [m.id, m])), cats = new Set(menu.cats.map(c => c.id)), st = [], log = [], fresh = new Set();
  const bad = (i, why) => ({ error: why, at: i });
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i]; if (!o || typeof o !== 'object') return bad(i, 'op');
    if (o.op === 'update') {
      const m = items.get(o.id), f = o.fields; if (!m || fresh.has(o.id)) return bad(i, 'unknown_item'); if (!f || typeof f !== 'object') return bad(i, 'fields');
      const keys = Object.keys(f); if (!keys.length) return bad(i, 'fields');
      if (!may(keys.every(k => k === 'sold_out_at') ? 'menu_soldout' : 'menu_edit')) return bad(i, 'role');
      const set = [], args = [];
      for (const k of keys) {
        if (k === 'name' || k === 'desc') { const t = triIn(f[k], k === 'name', k === 'name' ? 80 : 400); if (!t) return bad(i, k); for (const l of Object.keys(t)) { set.push(k + '_' + l + '=?'); args.push(k === 'desc' && !t[l] ? null : t[l]); } }
        else if (k === 'price_cents') { if (!isInt(f[k], 1, MAX_PRICE)) return bad(i, 'price'); set.push('price_cents=?'); args.push(f[k]); }
        else if (k === 'vat_rate') { if (f[k] !== 9 && f[k] !== 21) return bad(i, 'vat'); set.push('vat_rate=?'); args.push(f[k]); }
        else if (k === 'prep_minutes') { if (f[k] !== null && !isInt(f[k], 0, 180)) return bad(i, 'prep'); set.push('prep_minutes=?'); args.push(f[k]); }
        else if (k === 'sold_out_at') { if (f[k] !== null && typeof f[k] !== 'string') return bad(i, 'sold_out'); set.push('sold_out_at=?'); args.push(f[k] === null ? null : now); }   // the server's clock, not the tablet's
        else if (k === 'cat') { if (!cats.has(f[k])) return bad(i, 'cat'); set.push('cat=?'); args.push(f[k]); m.cat = f[k]; }
        else return bad(i, 'field:' + k);   // `orderable` and anything unknown: refused, never ignored
      }
      st.push({ sql: 'update menu_items set ' + set.join(',') + ',updated_at=? where id=? and archived_at is null', args: [...args, now, o.id] }); log.push({ op: 'update', id: o.id, fields: keys });
    } else if (o.op === 'option_price') {
      if (!may('menu_edit')) return bad(i, 'role');
      const m = items.get(o.item_id), g = m && m.options.find(x => x.id === o.group_id), opt = g && g.options.find(x => x.id === o.option_id);
      if (!opt) return bad(i, 'unknown_option'); if (!isInt(o.price_cents, 0, MAX_PRICE)) return bad(i, 'price');
      st.push({ sql: 'update item_options set price_cents=? where item_id=? and group_id=? and option_id=? and archived_at is null', args: [o.price_cents, o.item_id, o.group_id, o.option_id] }); log.push({ op: 'option_price', id: o.item_id + '/' + o.group_id + '/' + o.option_id, price_cents: o.price_cents });
    } else if (o.op === 'archive') {
      if (!may('menu_edit')) return bad(i, 'role'); if (!items.has(o.id) || fresh.has(o.id)) return bad(i, 'unknown_item');
      st.push({ sql: 'update menu_items set archived_at=?,updated_at=? where id=? and archived_at is null', args: [now, now, o.id] }); log.push({ op: 'archive', id: o.id }); items.delete(o.id);
    } else if (o.op === 'reorder') {
      if (!may('menu_edit')) return bad(i, 'role'); if (!cats.has(o.cat) || !Array.isArray(o.ids) || o.ids.length > 500) return bad(i, 'reorder');
      const seen = new Set(); for (const id of o.ids) { const m = items.get(id); if (typeof id !== 'string' || seen.has(id) || !m || m.cat !== o.cat) return bad(i, 'reorder'); seen.add(id); }
      // one statement however long the category: json_each's key is the array index = the new position
      const old = o.ids.filter(id => !fresh.has(id)), js = JSON.stringify(o.ids);
      o.ids.forEach((id, pos) => { if (fresh.has(id)) st.find(x => x.fresh === id).args[3] = pos; });
      if (old.length) st.push({ sql: 'update menu_items set pos=(select key from json_each(?1) where value=menu_items.id), updated_at=?2 where archived_at is null and id in (select value from json_each(?1)) and id not in (select value from json_each(?3))', args: [js, now, JSON.stringify(o.ids.filter(id => fresh.has(id)))] });
      log.push({ op: 'reorder', cat: o.cat, n: o.ids.length });
    } else if (o.op === 'create') {
      if (!may('menu_edit')) return bad(i, 'role'); const a = o.item; if (!a || typeof a !== 'object') return bad(i, 'item');
      const name = triIn(a.name, true, 80), desc = triIn(a.desc || {}, false, 400) || {};
      if (!name || !name.nl) return bad(i, 'name'); if (!cats.has(a.cat)) return bad(i, 'cat'); if (!isInt(a.price_cents, 1, MAX_PRICE)) return bad(i, 'price'); if (a.vat_rate !== 9 && a.vat_rate !== 21) return bad(i, 'vat');
      if (a.kind !== 'food' && a.kind !== 'drink') return bad(i, 'kind'); if (a.prep_minutes != null && !isInt(a.prep_minutes, 0, 180)) return bad(i, 'prep');
      // the page's draft id is only a handle for this batch (a later reorder names it); the stored id is made here
      const base = (a.cat + '-' + name.nl.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')).slice(0, 48) || a.cat + '-nieuw';
      let id = base, n = 2; while (items.has(id) || !ID_RE.test(id)) { id = base.slice(0, 44) + '-' + n++; if (n > 99) return bad(i, 'name'); }
      const pos = isInt(a.pos, 0, 10000) ? a.pos : 999, handle = typeof a.id === 'string' ? a.id : id;
      st.push({ fresh: handle, sql: 'insert into menu_items(id,kind,cat,pos,name_nl,name_en,name_de,desc_nl,desc_en,desc_de,price_cents,vat_rate,orderable,prep_minutes,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)',
        args: [id, a.kind, a.cat, pos, name.nl, name.en || name.nl, name.de || name.nl, desc.nl || null, desc.en || null, desc.de || null, a.price_cents, a.vat_rate, a.prep_minutes == null ? null : a.prep_minutes, now] });
      items.set(handle, { id: handle, cat: a.cat, options: [] }); fresh.add(handle); log.push({ op: 'create', id, price_cents: a.price_cents, vat_rate: a.vat_rate });
    } else return bad(i, 'op');
  }
  return { ok: true, statements: st.map(s => ({ sql: s.sql, args: s.args })), log };
}
