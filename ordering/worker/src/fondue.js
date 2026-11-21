// Cheese fondue reservations are paid up front (Dave, 2026-11-21: a guest reserved and did not
// come). The table form on www posts here when "kaasfondue" is ticked; the guest pays the full
// amount at MultiSafepay and the café hears about the reservation ONLY once it is paid — an unpaid
// request never reaches the inbox, so it cannot be mistaken for a booking.
//
// It rides on the orders table as it stands (the schema is frozen): one line "Kaasfondue" with
// qty = guests, and an order_note that starts with FONDUE_TAG and carries date, time and guests.
// Dave's rules, from his own card: at least 2 people, at least 1 day ahead.
import { loadSettings, getMsp } from './db.js';
import { openMinsFor } from './hours.js';
import { newOrderId, newPublicRef } from './ids.js';
import { insertOrder, startPayment, json } from './orders.js';

export const FONDUE_TAG = 'KAASFONDUE-RESERVERING';
export const FONDUE_PRICE_CENTS = 2595;          // per person, the price on the card and on the form
const MIN_GUESTS = 2, MAX_GUESTS = 19;           // 19 × € 25,95 stays under the € 500 order cap; larger groups call
const CLOSE_M = 21 * 60, MAX_DAYS_AHEAD = 365;
const NAME = { nl: 'Kaasfondue (reservering, p.p.)', en: 'Cheese fondue (reservation, p.p.)', de: 'Käsefondue (Reservierung, p.P.)' };
const ALLOWED_ORIGINS = ['https://www.oudkempeneetcafe.nl', 'https://oudkempeneetcafe.nl'];
const str = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';

export function isFondue(order) { return !!order && String(order.order_note || '').startsWith(FONDUE_TAG); }
// "KAASFONDUE-RESERVERING 2026-11-25 18:00 · 4 personen[ · opmerking: …]" → its parts
export function parseFondue(order) {
  const m = /^KAASFONDUE-RESERVERING (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) · (\d+) personen(?: · opmerking: ([\s\S]*))?$/.exec(String(order && order.order_note || ''));
  return m ? { date: m[1], time: m[2], guests: +m[3], note: m[4] || '' } : null;
}
export function amsDate(d) { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(d || new Date()); }   // YYYY-MM-DD
function addDays(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export function dateNl(iso) { return new Intl.DateTimeFormat('nl-NL', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso + 'T12:00:00Z')); }

// Pure: what the browser sent → a reservation, or the reason it is refused. The browser is never the guard.
export function validateFondue(body, now) {
  if (!body || typeof body !== 'object') return { error: 'bad_json' };
  const name = str(body.name, 80), email = str(body.email, 120), date = str(body.date, 10), time = str(body.time, 5);
  if (!name || !email) return { error: 'fields' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'email' };
  const guests = Number(body.guests);
  if (!Number.isInteger(guests) || guests < MIN_GUESTS) return { error: 'guests_min' };
  if (guests > MAX_GUESTS) return { error: 'guests_max' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date + 'T12:00:00Z')) || new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) !== date) return { error: 'date' };
  const today = amsDate(now);
  if (date < addDays(today, 1)) return { error: 'too_soon' };                     // at least 1 day ahead, Amsterdam calendar
  if (date > addDays(today, MAX_DAYS_AHEAD)) return { error: 'date' };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { error: 'time' };
  const mins = +time.slice(0, 2) * 60 + +time.slice(3), wd = new Date(date + 'T12:00:00Z').getUTCDay();
  if (mins < openMinsFor(wd) || mins >= CLOSE_M) return { error: 'time' };        // inside the café's opening hours that day
  const lang = ['nl', 'en', 'de'].includes(body.lang) ? body.lang : 'nl';
  return { ok: true, name, email, guests, date, time, lang, note: str(body.note, 400).replace(/\s+/g, ' ') };
}
export function cors(request) {
  const o = request.headers.get('origin') || '';
  return ALLOWED_ORIGINS.includes(o) ? { 'access-control-allow-origin': o, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'origin' } : {};
}
export async function createFondue(request, env) {
  const h = cors(request);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  const v = validateFondue(await request.json().catch(() => null));
  if (!v.ok) return json({ error: v.error }, 400, h);
  const settings = await loadSettings(env), msp = await getMsp(env, settings);
  if (!msp) return json({ error: 'no_psp' }, 503, h);
  const price = parseInt(settings.fondue_price_cents, 10) || FONDUE_PRICE_CENTS, total = price * v.guests;
  const order = { id: newOrderId(), public_ref: newPublicRef(), status: 'pending', lang: v.lang,
    subtotal_cents: total, vat_low_cents: Math.round(total * 9 / 109), vat_high_cents: 0, total_cents: total,
    customer_name: v.name, customer_email: v.email, customer_phone: null,
    order_note: FONDUE_TAG + ' ' + v.date + ' ' + v.time + ' · ' + v.guests + ' personen' + (v.note ? ' · opmerking: ' + v.note : ''),
    pickup_eta_min: 0, created_at: new Date().toISOString() };
  const items = [{ order_id: order.id, line: 1, item_id: 'fondue-reservering', qty: v.guests, unit_price_cents: price, vat_rate: 9,
    name_snapshot: NAME[v.lang], options_snapshot: v.date + ' ' + v.time, options_cents: 0, line_note: null }];
  await insertOrder(env, order, items);
  const r = await startPayment(request, env, settings, msp, order, items);
  return new Response(r.body, { status: r.status, headers: { ...Object.fromEntries(r.headers), ...h } });
}
