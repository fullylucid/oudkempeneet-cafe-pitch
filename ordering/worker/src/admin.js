// /beheer — the café's own back office, on the ordering Worker. Stage 1: staff login and the
// opening hours (weekly rule + calendar exceptions).
//
// Login is a one-time link mailed to a staff address (table `staff`; while it is empty the café's
// verified order inbox becomes the first owner). No passwords exist, so none can leak or be reused. What is stored is only
// the SHA-256 of a link token or session id: a copy of the database logs nobody in. The link is
// opened with a button (a POST), never by the GET alone, because mail scanners follow links and
// would spend a one-time token before its owner sees it.
//
// Roles: an `owner` may do everything; `staff` may change calendar days and read, nothing else
// (CAN below — every new screen adds its actions there, and an action missing from it is owner-only).
//
// Every write needs (1) a live session cookie, (2) an Origin header equal to this origin and
// (3) a JSON body — a form on another site can satisfy none of the three. Every write is logged.
import { loadSettings, loadSchedule, dropScheduleCache } from './db.js';
import { hex2 } from './seal.js';
import { sendMail } from './mail.js';
import { json, CAFE_INBOX } from './orders.js';
import { amsDate, addDays, validYmd, dayHours, orderingState, hhmm, mins, wdOf, ORDER_FROM_M } from './hours.js';
import { parseFondue, FONDUE_ITEM } from './fondue.js';

const COOKIE = '__Secure-beheer';
const CAN = { staff: ['hours_days'] };
export function can(me, action) { return !!me && (me.role === 'owner' || (CAN[me.role] || []).includes(action)); }
const LINK_MIN = 15, SESSION_DAYS = 30, LINKS_PER_HOUR = 5, LINKS_PER_HOUR_ALL = 30, MAX_RANGE_DAYS = 92;
const nowIso = () => new Date().toISOString();
const plusMin = m => new Date(Date.now() + m * 60000).toISOString();
const notFound = () => new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
const enc = new TextEncoder();
export async function sha256(s) { return hex2(await crypto.subtle.digest('SHA-256', enc.encode(String(s)))); }
export function newToken() { return hex2(crypto.getRandomValues(new Uint8Array(32))); }
export const TOKEN_RE = /^[0-9a-f]{64}$/;
export function normEmail(v) { const s = typeof v === 'string' ? v.trim().toLowerCase() : ''; return s.length <= 120 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? s : ''; }
export function readCookie(request) {
  const c = (request.headers.get('cookie') || '').split(/;\s*/).find(x => x.startsWith(COOKIE + '='));
  const v = c ? c.slice(COOKIE.length + 1) : ''; return TOKEN_RE.test(v) ? v : '';
}
export function sameOrigin(request) { return request.headers.get('origin') === new URL(request.url).origin; }
const SEC = {
  'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};
const j = (o, status = 200, headers = {}) => json(o, status, { ...SEC, ...headers });
async function asset(request, env, path) {
  const r = await env.ASSETS.fetch(new Request(new URL(path, request.url), { method: 'GET' }));
  if (r.status !== 200) return notFound();
  const h = new Headers(SEC); h.set('content-type', r.headers.get('content-type') || 'text/html; charset=utf-8');
  return new Response(r.body, { status: 200, headers: h });
}
async function audit(env, who, action, detail) {
  await env.DB.prepare('insert into audit_log(at,who,action,detail) values(?,?,?,?)').bind(nowIso(), who, action, detail ? JSON.stringify(detail).slice(0, 2000) : null).run();
}
export async function session(request, env) {
  const id = readCookie(request); if (!id) return null;
  const h = await sha256(id), now = nowIso();
  const s = await env.DB.prepare('select s.email,s.expires_at,s.last_seen_at,t.role from staff_sessions s join staff t on t.email=s.email where s.id_hash=? and s.revoked_at is null and s.expires_at>? and t.disabled_at is null').bind(h, now).first();
  if (!s) return null;
  if (!s.last_seen_at || Date.parse(now) - Date.parse(s.last_seen_at) > 3600000) await env.DB.prepare('update staff_sessions set last_seen_at=? where id_hash=?').bind(now, h).run();
  return { email: s.email, role: s.role, hash: h, expires_at: s.expires_at };
}

export async function admin(request, env, p, ctx) {
  const url = new URL(request.url), m = request.method;
  // static pieces of the app: nothing secret in them, the data is behind the API
  if (m === 'GET' && /^\/beheer\/(app|login)\.(js|css)$/.test(p)) return asset(request, env, p);
  if (m === 'GET' && p.startsWith('/beheer/in/')) return TOKEN_RE.test(p.slice(11)) ? asset(request, env, '/beheer/login') : notFound();
  if (p === '/beheer/login' && m === 'POST') return requestLink(request, env, url, ctx);
  if (p === '/beheer/in' && m === 'POST') return enter(request, env);
  const me = await session(request, env);
  if (p === '/beheer' || p === '/beheer/') {
    if (m !== 'GET') return notFound();
    return asset(request, env, me ? '/beheer/app' : '/beheer/login');
  }
  if (!me) return p.startsWith('/beheer/api/') ? j({ error: 'login' }, 401) : notFound();
  if (m !== 'GET' && !sameOrigin(request)) return j({ error: 'origin' }, 403);
  if (p === '/beheer/logout' && m === 'POST') {
    await env.DB.prepare('update staff_sessions set revoked_at=? where id_hash=?').bind(nowIso(), me.hash).run();
    await audit(env, me.email, 'logout');
    return j({ ok: true }, 200, { 'set-cookie': COOKIE + '=; Path=/beheer; HttpOnly; Secure; SameSite=Lax; Max-Age=0' });
  }
  if (p === '/beheer/logout-all' && m === 'POST') {   // a lost phone, a shared tablet: every session of this address ends, this one included
    const r = await env.DB.prepare('update staff_sessions set revoked_at=? where email=? and revoked_at is null').bind(nowIso(), me.email).run();
    await audit(env, me.email, 'logout_all', { sessions: r.meta && r.meta.changes });
    return j({ ok: true }, 200, { 'set-cookie': COOKIE + '=; Path=/beheer; HttpOnly; Secure; SameSite=Lax; Max-Age=0' });
  }
  if (p === '/beheer/api/me' && m === 'GET') return j({ email: me.email, role: me.role, can: { hours_week: can(me, 'hours_week'), hours_days: can(me, 'hours_days') }, cafe: env.CAFE_NAME || '', session_until: me.expires_at });
  if (p === '/beheer/api/hours' && m === 'GET') return j(await hoursForStaff(env));
  if (p === '/beheer/api/log' && m === 'GET') return j({ rows: (await env.DB.prepare('select at,who,action,detail from audit_log order by id desc limit 100').all()).results });
  if (m !== 'PUT') return notFound();
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return j({ error: 'bad_json' }, 400);
  if (p === '/beheer/api/hours/week') return can(me, 'hours_week') ? saveWeek(env, me, body) : j({ error: 'role' }, 403);
  if (p === '/beheer/api/hours/days') return can(me, 'hours_days') ? saveDays(env, me, body) : j({ error: 'role' }, 403);
  return notFound();
}

// POST /beheer/login {email} — the answer is the same whoever asks, so the page cannot be used to
// find out which addresses are staff.
async function requestLink(request, env, url, ctx) {
  if (!sameOrigin(request)) return j({ error: 'origin' }, 403);
  const body = await request.json().catch(() => null), email = normEmail(body && body.email);
  // the lookup and the mail run after the answer has left, so the time it takes says nothing either
  const work = email ? mailLink(env, email, url.origin).catch(e => console.error('beheer login', String(e && e.message || e))) : null;
  if (work) { if (ctx && ctx.waitUntil) ctx.waitUntil(work); else await work; }
  return j({ ok: true });
}
// While nobody is staff yet, the café's order inbox is the first owner — but only once its owner has
// verified it with Cloudflare (the same condition under which order alerts are delivered to it).
async function firstOwner(env) {
  const s = await loadSettings(env);
  if (!s.alert_verified_at) return;
  await env.DB.prepare("insert into staff(email,role) select ?,'owner' where not exists (select 1 from staff)").bind(String(s.alert_to || CAFE_INBOX).trim().toLowerCase()).run();
}
async function mailLink(env, email, origin) {
  await firstOwner(env);
  const staff = await env.DB.prepare('select email from staff where email=? and disabled_at is null').bind(email).first();
  if (!staff) return;
  const n = await env.DB.prepare('select sum(email=?) mine, count(*) everyone from staff_login where created_at>?').bind(email, new Date(Date.now() - 3600000).toISOString()).first();
  if ((n.mine || 0) >= LINKS_PER_HOUR || (n.everyone || 0) >= LINKS_PER_HOUR_ALL) return;
  const token = newToken();
  await env.DB.batch([
    env.DB.prepare('delete from staff_login where expires_at<?').bind(new Date(Date.now() - 86400000).toISOString()),
    env.DB.prepare('insert into staff_login(token_hash,email,created_at,expires_at) values(?,?,?,?)').bind(await sha256(token), email, nowIso(), plusMin(LINK_MIN)),
  ]);
  await sendMail(env, { to: email, subject: 'Inloggen bij het beheer van ' + (env.CAFE_NAME || 'het café'), text: linkMail(env, origin + '/beheer/in/' + token) });
}
export function linkMail(env, link) {
  return ['Iemand vroeg zojuist een inloglink voor het beheer van ' + (env.CAFE_NAME || 'het café') + '.', '',
    'Open deze link en klik op "Inloggen":', link, '',
    'De link werkt ' + LINK_MIN + ' minuten en maar één keer. Heeft u hier niet om gevraagd? Dan hoeft u niets te doen: zonder deze link komt niemand binnen.', '',
    'English: open the link above and press "Log in". It works once, for ' + LINK_MIN + ' minutes.'].join('\n');
}
// POST /beheer/in {token} — spend the link, start the session.
async function enter(request, env) {
  if (!sameOrigin(request)) return j({ error: 'origin' }, 403);
  const body = await request.json().catch(() => null), token = body && typeof body.token === 'string' ? body.token : '';
  if (!TOKEN_RE.test(token)) return j({ error: 'link' }, 400);
  const now = nowIso(), th = await sha256(token);
  // one statement decides it: the row is spent only if it was unspent and unexpired
  const spent = await env.DB.prepare('update staff_login set used_at=? where token_hash=? and used_at is null and expires_at>? returning email').bind(now, th, now).first();
  if (!spent) return j({ error: 'link' }, 400);
  const staff = await env.DB.prepare('select email from staff where email=? and disabled_at is null').bind(spent.email).first();
  if (!staff) return j({ error: 'link' }, 400);
  const id = newToken(), until = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await env.DB.batch([
    env.DB.prepare('delete from staff_sessions where expires_at<?').bind(now),
    env.DB.prepare('insert into staff_sessions(id_hash,email,created_at,expires_at,last_seen_at) values(?,?,?,?,?)').bind(await sha256(id), staff.email, now, until, now),
  ]);
  await audit(env, staff.email, 'login');
  return j({ ok: true }, 200, { 'set-cookie': COOKIE + '=' + id + '; Path=/beheer; HttpOnly; Secure; SameSite=Lax; Max-Age=' + SESSION_DAYS * 86400 });
}

// ---- opening hours
// Paid fondue reservations from today on: the guests a closed day would stand up. A reservation the
// café has refunded in full is no longer one (merritt, review of #36): MultiSafepay's refund total is
// written to the order whenever its status is fetched (orders.js, after a notification). The mark of a
// fondue order is its single server-written line (fondue.js isFondue), never the note alone.
export async function paidFondue(env, today) {
  const rows = (await env.DB.prepare("select o.id,o.public_ref,o.order_note,o.customer_name,o.customer_email,(select count(*) from order_items x where x.order_id=o.id) n from orders o join order_items i on i.order_id=o.id and i.item_id=? where o.status='paid' and o.msp_refund_cents<o.total_cents and o.created_at>?").bind(FONDUE_ITEM, new Date(Date.now() - 400 * 86400000).toISOString()).all()).results;
  const out = [];
  for (const r of rows) { const f = r.n === 1 ? parseFondue(r, [{ item_id: FONDUE_ITEM }]) : null; if (f && f.date >= today) out.push({ date: f.date, time: f.time, guests: f.guests, name: r.customer_name || '', email: r.customer_email || '', ref: r.public_ref }); }
  return out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}
// Pure: is this table inside the café's hours under a schedule? The warnings below are for reservations
// a change NEWLY breaks: one staff already overrode must not nag at every later save.
export function fineUnder(sched, r) { const h = dayHours(sched, r.date), t = mins(r.time); return !h.closed && t >= h.open && t < h.close; }
// Pure: which of those reservations a calendar change would break — the day closes, or its new hours leave the table's time outside them.
export function hitBy(v, reservations) {
  if (v.mode === 'normal') return [];
  return reservations.filter(r => v.dates.includes(r.date) && (v.mode === 'closed' || mins(r.time) < v.open || mins(r.time) >= v.close));
}
const noteOf = r => ({ nl: r.note_nl || '', en: r.note_en || '', de: r.note_de || '' });
async function hoursForStaff(env) {
  const settings = await loadSettings(env), sched = await loadSchedule(env, true), today = amsDate();
  const ex = (await env.DB.prepare('select date,closed,open_min,close_min,note_nl,note_en,note_de,updated_at,updated_by from hours_exceptions where date>=? order by date').bind(addDays(today, -62)).all()).results;
  const offset = parseInt(settings.last_orders_offset_min, 10) || 30;
  return { today, last_orders_offset_min: offset, orders_from: hhmm(ORDER_FROM_M), state: orderingState(offset, null, sched), reservations: await paidFondue(env, today),
    week: sched.week.map((w, wd) => ({ wd, closed: w.closed, open: hhmm(w.open), close: hhmm(w.close) })),
    exceptions: ex.map(r => ({ date: r.date, closed: !!r.closed, open: r.closed ? null : hhmm(r.open_min), close: r.closed ? null : hhmm(r.close_min), note: noteOf(r), updated_at: r.updated_at, updated_by: r.updated_by })) };
}
// Pure: the seven weekday rows as the page sends them → rows to store, or the reason they are refused.
export function validateWeek(body) {
  const w = body && body.week;
  if (!Array.isArray(w) || w.length !== 7) return { error: 'week' };
  const out = [];
  for (let wd = 0; wd < 7; wd++) {
    const r = w[wd] || {}, closed = r.closed === true, o = mins(r.open), c = mins(r.close);
    if (o === null || c === null || o >= c || o > 1439) return { error: 'times', wd };
    out.push({ wd, closed, open: o, close: c });
  }
  if (out.every(r => r.closed)) return { error: 'all_closed' };   // a week with no open day is a mistake, not a schedule; a holiday is a calendar range
  return { ok: true, week: out };
}
// Pure: one calendar change — a date or a range, set to closed / other times / back to normal.
export function validateDays(body, today) {
  const from = body && body.from, to = (body && body.to) || from, mode = body && body.mode;
  if (!validYmd(from) || !validYmd(to) || to < from) return { error: 'dates' };
  if (to < today) return { error: 'past' };
  if (to > addDays(today, 800)) return { error: 'dates' };
  // start at today: a range that began last year must not walk the loop through every day since (gate, #35)
  const dates = []; for (let d = from < today ? today : from; d <= to; d = addDays(d, 1)) { if (dates.length >= MAX_RANGE_DAYS) return { error: 'range' }; dates.push(d); }
  if (!['normal', 'closed', 'times'].includes(mode)) return { error: 'mode' };
  let o = null, c = null;
  if (mode === 'times') { o = mins(body.open); c = mins(body.close); if (o === null || c === null || o >= c || o > 1439) return { error: 'times' }; }
  const n = body.note && typeof body.note === 'object' ? body.note : {}, note = {};
  for (const l of ['nl', 'en', 'de']) note[l] = typeof n[l] === 'string' ? n[l].replace(/\s+/g, ' ').trim().slice(0, 140) : '';
  return { ok: true, dates, mode, open: o, close: c, note };
}
// Pure: which reservations a new weekly rule would break. A date with its own calendar entry keeps
// that entry whatever the week says, so it is not affected.
export function hitByWeek(week, reservations, exDates) {
  return reservations.filter(r => { if (exDates.includes(r.date)) return false; const w = week[wdOf(r.date)]; return w.closed || mins(r.time) < w.open || mins(r.time) >= w.close; });
}
async function saveWeek(env, me, body) {
  const v = validateWeek(body); if (!v.ok) return j(v, 400);
  const today = amsDate(), exDates = (await env.DB.prepare('select date from hours_exceptions where date>=?').bind(today).all()).results.map(r => r.date);
  const cur = await loadSchedule(env, true), hit = hitByWeek(v.week, await paidFondue(env, today), exDates).filter(r => fineUnder(cur, r));
  if (hit.length && body.confirm !== true) return j({ error: 'reservations', reservations: hit }, 409);   // same rule as the calendar (merritt, review of #36)
  await env.DB.batch(v.week.map(r => env.DB.prepare('insert into hours_week(wd,closed,open_min,close_min) values(?,?,?,?) on conflict(wd) do update set closed=excluded.closed, open_min=excluded.open_min, close_min=excluded.close_min').bind(r.wd, r.closed ? 1 : 0, r.open, r.close)));
  dropScheduleCache();
  await audit(env, me.email, 'hours_week', v.week.map(r => r.closed ? 'x' : hhmm(r.open) + '-' + hhmm(r.close)).concat(hit.length ? ['fondue: ' + hit.map(r => r.ref).join(' ')] : []));
  return j({ ok: true, ...(await hoursForStaff(env)) });
}
async function saveDays(env, me, body) {
  const v = validateDays(body, amsDate()); if (!v.ok) return j(v, 400);
  // a guest has paid for a table on one of these dates: say so, and change nothing until staff confirm
  const cur = await loadSchedule(env, true), hit = hitBy(v, await paidFondue(env, amsDate())).filter(r => fineUnder(cur, r));
  if (hit.length && body.confirm !== true) return j({ error: 'reservations', reservations: hit }, 409);
  const now = nowIso();
  const st = v.mode === 'normal'
    ? v.dates.map(d => env.DB.prepare('delete from hours_exceptions where date=?').bind(d))
    : v.dates.map(d => env.DB.prepare('insert into hours_exceptions(date,closed,open_min,close_min,note_nl,note_en,note_de,updated_at,updated_by) values(?,?,?,?,?,?,?,?,?) on conflict(date) do update set closed=excluded.closed, open_min=excluded.open_min, close_min=excluded.close_min, note_nl=excluded.note_nl, note_en=excluded.note_en, note_de=excluded.note_de, updated_at=excluded.updated_at, updated_by=excluded.updated_by')
        .bind(d, v.mode === 'closed' ? 1 : 0, v.open, v.close, v.note.nl || null, v.note.en || null, v.note.de || null, now, me.email));
  await env.DB.batch(st);
  dropScheduleCache();
  await audit(env, me.email, v.mode === 'normal' ? 'hours_day_clear' : 'hours_day', { from: v.dates[0], to: v.dates[v.dates.length - 1], mode: v.mode, open: v.open === null ? null : hhmm(v.open), close: v.close === null ? null : hhmm(v.close), note: v.note.nl, ...(hit.length ? { reservations: hit.map(r => r.ref) } : {}) });
  return j({ ok: true, ...(await hoursForStaff(env)) });
}

// GET /api/hours — public: what the website, the ordering page and anyone's phone may show.
export async function publicHours(env) {
  const settings = await loadSettings(env), sched = await loadSchedule(env), today = amsDate();
  const offset = parseInt(settings.last_orders_offset_min, 10) || 30, days = [];
  for (let i = 0; i < 14; i++) { const d = addDays(today, i), h = dayHours(sched, d); days.push({ date: d, wd: wdOf(d), closed: !!h.closed, open: h.closed ? null : hhmm(h.open), close: h.closed ? null : hhmm(h.close), exception: !!h.exception, note: h.note || null }); }
  const exceptions = Object.keys(sched.ex).filter(d => d >= today).sort().map(d => { const e = sched.ex[d]; return { date: d, closed: e.closed, open: e.closed ? null : hhmm(e.open), close: e.closed ? null : hhmm(e.close), note: e.note }; });
  const st = orderingState(offset, null, sched);
  return json({ tz: 'Europe/Amsterdam', today, last_orders_offset_min: offset, orders_from: hhmm(ORDER_FROM_M),
    ordering: st.open ? { open: true, last: hhmm(st.last) } : { open: false, when: st.when, at: st.at === null ? null : hhmm(st.at), date: st.date },
    week: sched.week.map((w, wd) => ({ wd, closed: w.closed, open: hhmm(w.open), close: hhmm(w.close) })), days, exceptions },
    200, { 'cache-control': 'public, max-age=60', 'access-control-allow-origin': '*' });
}
