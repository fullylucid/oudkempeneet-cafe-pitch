// D1 access. D1 is the menu's truth from the first seed onward (gate cond. 8): the Worker never
// reads data/menu.json. The cart page inlines the same menu at build time; both come from one seed.
import { seal, unseal } from './seal.js';
import { DEFAULT_SCHED, amsDate, addDays } from './hours.js';
import { soldOutToday } from './menu.js';

const L = ['nl', 'en', 'de'];
let menuCache = null;   // per isolate, 60 s — a menu edit shows within a minute, a burst of orders reads D1 once
export async function loadMenu(env, force) {
  if (!force && menuCache && Date.now() - menuCache.at < 60000) return menuCache.by;
  const items = (await env.DB.prepare('select id,kind,cat,price_cents,vat_rate,orderable,orderable_note,sold_out_at,name_nl,name_en,name_de from menu_items where archived_at is null').all()).results;
  const opts = (await env.DB.prepare('select item_id,group_id,option_id,required,group_nl,group_en,group_de,label_nl,label_en,label_de,price_cents from item_options where archived_at is null order by item_id,group_pos,option_pos').all()).results;
  const by = {}, today = amsDate();
  for (const i of items) by[i.id] = { id: i.id, kind: i.kind, cat: i.cat, price_cents: i.price_cents, vat_rate: i.vat_rate, orderable: !!i.orderable && !soldOutToday(i.sold_out_at, today),   // sold out today: tally refuses it as not_orderable
    name: { nl: i.name_nl, en: i.name_en, de: i.name_de }, options: [] };
  for (const o of opts) {
    const m = by[o.item_id]; if (!m) continue;
    let g = m.options.find(x => x.id === o.group_id);
    if (!g) { g = { id: o.group_id, required: !!o.required, label: { nl: o.group_nl, en: o.group_en, de: o.group_de }, options: [] }; m.options.push(g); }
    g.options.push({ id: o.option_id, price_cents: o.price_cents, label: { nl: o.label_nl, en: o.label_en, de: o.label_de } });
  }
  menuCache = { at: Date.now(), by };
  return by;
}
// The café's opening hours (0003): the weekly rule and the calendar exceptions from yesterday on.
// 60 s per isolate, like the menu. Any failure — the tables not there yet, a D1 error — falls back
// to the hours the site has always shown, never to "closed".
let schedCache = null;
export async function loadSchedule(env, force) {
  if (!force && schedCache && Date.now() - schedCache.at < 60000) return schedCache.v;
  let v = DEFAULT_SCHED;
  try {
    const wk = (await env.DB.prepare('select wd,closed,open_min,close_min from hours_week').all()).results;
    const ex = (await env.DB.prepare('select date,closed,open_min,close_min,note_nl,note_en,note_de from hours_exceptions where date>=? order by date').bind(addDays(amsDate(), -1)).all()).results;
    if (wk.length === 7) {
      const week = []; for (const r of wk) week[r.wd] = { closed: !!r.closed, open: r.open_min, close: r.close_min };
      const exs = {}; for (const r of ex) exs[r.date] = { closed: !!r.closed, open: r.open_min, close: r.close_min, note: (r.note_nl || r.note_en || r.note_de) ? { nl: r.note_nl || '', en: r.note_en || '', de: r.note_de || '' } : null };
      v = { week, ex: exs };
    }
  } catch (e) { console.error('loadSchedule', String(e && e.message || e)); v = DEFAULT_SCHED; }
  schedCache = { at: Date.now(), v };
  return v;
}
export function dropScheduleCache() { schedCache = null; }
export function dropMenuCache() { menuCache = null; }
export async function loadSettings(env) {
  const rows = (await env.DB.prepare('select key,value from settings').all()).results;
  const s = {}; for (const r of rows) s[r.key] = r.value; return s;
}
export async function setSetting(env, key, value) {
  if (value === null || value === undefined) return env.DB.prepare('delete from settings where key=?').bind(key).run();
  return env.DB.prepare('insert into settings(key,value) values(?,?) on conflict(key) do update set value=excluded.value').bind(key, String(value)).run();
}
// The PSP credential: { mode, key } or null when none is installed yet.
let mspCache = null;
export async function getMsp(env, settings) {
  if (mspCache && Date.now() - mspCache.at < 60000) return mspCache.v;
  const s = settings || await loadSettings(env);
  let v = null;
  if (s.msp_key_sealed && s.msp_mode && env.SEAL_KEY) {
    try { v = { mode: s.msp_mode, key: await unseal(env.SEAL_KEY, s.msp_key_sealed), hint: s.msp_key_hint || '', setAt: s.msp_key_set_at || '' }; }
    catch (e) { v = null; }   // a SEAL_KEY rotation orphans the sealed copy: the page shows "no key", you paste it again
  }
  mspCache = { at: Date.now(), v };
  return v;
}
export async function putMsp(env, key, mode, gateways) {
  await env.DB.batch([
    env.DB.prepare('insert into settings(key,value) values(?,?) on conflict(key) do update set value=excluded.value').bind('msp_key_sealed', await seal(env.SEAL_KEY, key)),
    env.DB.prepare('insert into settings(key,value) values(?,?) on conflict(key) do update set value=excluded.value').bind('msp_mode', mode),
    env.DB.prepare('insert into settings(key,value) values(?,?) on conflict(key) do update set value=excluded.value').bind('msp_key_hint', '…' + key.slice(-4)),
    env.DB.prepare('insert into settings(key,value) values(?,?) on conflict(key) do update set value=excluded.value').bind('msp_key_set_at', new Date().toISOString()),
    env.DB.prepare('insert into settings(key,value) values(?,?) on conflict(key) do update set value=excluded.value').bind('msp_gateways', JSON.stringify(gateways || [])),
  ]);
  mspCache = null;
}
export function nameIn(m, lang) { return (m.name && (m.name[lang] || m.name.nl)) || m.id; }
export function optionsText(m, chosen, lang) {
  // "Saus: Mayonaise; Tweede saus: Ketchup" — readable on the ticket, in the order's language
  const parts = [];
  for (const c of chosen || []) {
    const g = (m.options || []).find(x => x.id === c.group); if (!g) continue;
    const o = g.options.find(x => x.id === c.option); if (!o) continue;
    parts.push((g.label[lang] || g.label.nl) + ': ' + (o.label[lang] || o.label.nl));
  }
  return parts.join('; ');
}
export { L };
