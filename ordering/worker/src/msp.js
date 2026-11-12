// MultiSafepay, hosted payment page, redirect flow (proposal §3, §8). Facts checked against
// docs.multisafepay.com on 2026-11-11: header `api_key`; POST /orders type redirect; amount in
// cents; shopping-cart unit prices in EUROS EXCLUDING VAT (docs/rounding-rule); tax rate as a
// fraction (0.09); webhook `Auth` header = base64("timestamp:hexhmac"), HMAC-SHA512 over
// "timestamp:rawbody" keyed with the API key, HEX digest; order_id unique per website, max 50;
// payment link expiry via seconds_active; `second_chance.send_email`.
import { hex2, timingSafeEqual } from './seal.js';
const enc = new TextEncoder();
export const HOSTS = { test: 'https://testapi.multisafepay.com/v1/json', live: 'https://api.multisafepay.com/v1/json' };
export const DASHBOARDS = { test: 'https://testmerchant.multisafepay.com', live: 'https://merchant.multisafepay.com' };

export async function api(mode, key, method, path, body) {
  const r = await fetch(HOSTS[mode] + path, {
    method, headers: { api_key: key, 'content-type': 'application/json', accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined });
  let j = {}; try { j = await r.json(); } catch (e) { /* non-JSON body: treated as failure below */ }
  const ok = r.ok && j.success !== false;
  return { ok, status: r.status, data: j.data, error: ok ? null : (j.error_code ? j.error_code + ' ' + (j.error_info || '') : 'http ' + r.status) };
}
// Which environment does this key belong to? A test key is refused by the live host and vice
// versa, so the key itself tells us — nobody has to pick "test" or "live" from a dropdown and get
// it wrong. Returns null when neither host accepts it.
export async function probeKey(key) {
  for (const mode of ['live', 'test']) {
    const r = await api(mode, key, 'GET', '/gateways');
    if (r.ok) return { mode, gateways: (r.data || []).map(g => g.id) };
    if (r.status !== 401 && r.status !== 403 && !/1032|1034|invalid api key/i.test(r.error || '')) {
      /* a network-level failure on one host must not pass as "wrong environment" */
      if (r.status >= 500) throw new Error('MultiSafepay ' + mode + ' unreachable: ' + r.error);
    }
  }
  return null;
}
// MultiSafepay status → ours (gate cond. 4). null = recorded only, no state change.
export const STATUS_MAP = {
  completed: 'paid', shipped: 'paid',
  initialized: 'pending', uncleared: 'pending', reserved: 'pending',
  declined: 'failed', cancelled: 'failed', void: 'failed',
  expired: 'expired',
  refunded: null, partial_refunded: null, chargedback: null,
};
export function mapStatus(s) { return STATUS_MAP[String(s || '').toLowerCase()] === undefined ? 'pending' : STATUS_MAP[String(s).toLowerCase()]; }

const LOCALE = { nl: 'nl_NL', en: 'en_GB', de: 'de_DE' };
// cents incl. VAT → euros excl. VAT, as a string MultiSafepay accepts; 10 decimals so our own
// rounding never shows. `amount` (cents) is what is charged; the cart is what the dashboard shows.
export function exVat(cents, rate) { return (cents / 100 / (1 + rate / 100)).toFixed(10); }
export function buildOrder({ order, items, origin, settings, ip }) {
  const lang = order.lang;
  const [first, ...rest] = String(order.customer_name || '').trim().split(/\s+/);
  return {
    type: 'redirect',
    order_id: order.id,
    currency: 'EUR',
    amount: order.total_cents,
    description: 'Oud-Kempen Eetcafé afhalen ' + order.public_ref,
    payment_options: {
      notification_url: origin + '/api/msp/notify',
      notification_method: 'POST',
      redirect_url: origin + '/klaar/' + order.id,
      cancel_url: origin + '/geannuleerd/' + order.id,
    },
    customer: {
      locale: LOCALE[lang] || 'nl_NL',
      ip_address: ip || undefined,
      first_name: first || undefined, last_name: rest.join(' ') || undefined,
      email: order.customer_email || undefined, phone: order.customer_phone || undefined,
    },
    seconds_active: parseInt(settings.msp_seconds_active, 10) || 1800,
    second_chance: { send_email: false },
    shopping_cart: { items: items.map(l => ({
      name: l.name_snapshot, description: l.options_snapshot || undefined,
      unit_price: exVat(l.unit_price_cents + l.options_cents, l.vat_rate), quantity: l.qty,
      merchant_item_id: l.item_id, currency: 'EUR', tax_table_selector: 'BTW' + l.vat_rate })) },
    checkout_options: { tax_tables: { default: { shipping_taxed: false, rate: 0.09 },
      alternate: [{ name: 'BTW9', rules: [{ rate: 0.09 }] }, { name: 'BTW21', rules: [{ rate: 0.21 }] }] } },
  };
}
// The webhook signature. This is the most important function in Part One: without it, anyone who
// guesses the notification URL eats for free. Window ±15 min (MultiSafepay retries every 15 min
// with a fresh timestamp).
export async function verifyAuth(authHeader, rawBody, key, nowSec) {
  if (!authHeader) return { ok: false, reason: 'no_auth' };
  let decoded; try { decoded = atob(authHeader); } catch (e) { return { ok: false, reason: 'bad_base64' }; }
  const i = decoded.indexOf(':'); if (i < 1) return { ok: false, reason: 'bad_shape' };
  const ts = decoded.slice(0, i), got = decoded.slice(i + 1).toLowerCase();
  if (!/^\d{9,11}$/.test(ts)) return { ok: false, reason: 'bad_timestamp' };
  const now = nowSec || Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(ts, 10)) > 15 * 60) return { ok: false, reason: 'stale' };
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const want = hex2(await crypto.subtle.sign('HMAC', k, enc.encode(ts + ':' + rawBody)));
  return timingSafeEqual(want, got) ? { ok: true, ts } : { ok: false, reason: 'mismatch' };
}
// test helper + the one place the header format is written down
export async function makeAuth(rawBody, key, ts) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  return btoa(ts + ':' + hex2(await crypto.subtle.sign('HMAC', k, enc.encode(ts + ':' + rawBody))));
}
