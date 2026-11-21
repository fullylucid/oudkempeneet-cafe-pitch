// Opening hours, server side, because the browser is never the guard (Q8: outside hours the cart
// shows, checkout refuses). Since 0003 the café keeps its own hours in /beheer: a weekly rule plus
// calendar exceptions, read from D1 (db.js loadSchedule). DEFAULT_SCHED is what the site has always
// shown — Mon–Thu 15:00, Fri–Sun 12:30, close 21:00, Europe/Amsterdam — and stays the fallback when
// the tables cannot be read, so a database hiccup never closes the café.
const W = (o, c) => ({ closed: false, open: o, close: c });
export const DEFAULT_SCHED = { week: [W(750, 1260), W(900, 1260), W(900, 1260), W(900, 1260), W(900, 1260), W(750, 1260), W(750, 1260)], ex: {} };   // index = weekday, 0 = Sunday
export function openMinsFor(wd) { return DEFAULT_SCHED.week[wd].open; }
// Takeaway ordering starts at 17:00 every day (Dave, 2026-11-21: "5pm standard for now"). The café
// itself opens earlier: a day's `open` stays the café's opening time (table and fondue reservations
// use it); ordering starts at whichever is later. It becomes a /beheer setting with the settings screen.
export const ORDER_FROM_M = 17 * 60;
export function orderFrom(open) { return Math.max(open, ORDER_FROM_M); }
export function nowAms(date) {
  const d = date || new Date();
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const get = t => p.find(x => x.type === t).value;
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[get('weekday')];
  return { wd, m: parseInt(get('hour'), 10) % 24 * 60 + parseInt(get('minute'), 10), ymd: amsDate(d) };
}
export function amsDate(d) { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(d || new Date()); }   // YYYY-MM-DD
export function addDays(ymd, n) { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export function wdOf(ymd) { return new Date(ymd + 'T12:00:00Z').getUTCDay(); }
export function validYmd(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T12:00:00Z')) && new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s; }
// What one calendar date looks like: the exception if there is one, else the weekday's rule.
export function dayHours(sched, ymd) {
  const s = sched || DEFAULT_SCHED, e = s.ex && s.ex[ymd];
  if (e) return e.closed ? { closed: true, exception: true, note: e.note || null } : { closed: false, open: e.open, close: e.close, exception: true, note: e.note || null };
  const w = s.week[wdOf(ymd)];
  return w.closed ? { closed: true } : { closed: false, open: w.open, close: w.close };
}
// Can an order be placed now? If not: when next. `when` is today | tomorrow | later (with `date`).
export function orderingState(offsetMin, date, sched) {
  const n = nowAms(date), h = dayHours(sched, n.ymd);
  if (!h.closed) {
    const last = h.close - (offsetMin | 0), from = orderFrom(h.open);
    if (n.m >= from && n.m < last) return { open: true, last, close: h.close };
    if (n.m < from && from < last) return { open: false, when: 'today', at: from, date: n.ymd };
  }
  for (let i = 1; i <= 60; i++) {
    const ymd = addDays(n.ymd, i), d = dayHours(sched, ymd);
    if (!d.closed && orderFrom(d.open) < d.close - (offsetMin | 0)) return { open: false, when: i === 1 ? 'tomorrow' : 'later', at: orderFrom(d.open), date: ymd };
  }
  return { open: false, when: 'later', at: null, date: null };
}
export function hhmm(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
export function mins(s) { const m = /^([01]\d|2[0-4]):([0-5]\d)$/.exec(String(s || '')); if (!m) return null; const v = +m[1] * 60 + +m[2]; return v > 1440 ? null : v; }
// "ready at" for the ticket: created + wait, as a clock time in Amsterdam
export function readyAt(createdIso, waitMin) {
  const d = new Date(new Date(createdIso).getTime() + (waitMin | 0) * 60000);
  return new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}
