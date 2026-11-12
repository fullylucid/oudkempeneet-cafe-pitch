// Orders: create → pay at MultiSafepay → webhook/poll/cron confirm → alert the café.
// The browser is never trusted (proposal §4): prices come from D1, totals from src/tally.js (the
// ONE totals function, gate cond. 6), status from MultiSafepay's own Get-order (gate cond. 4).
import tallyMod from '../../../src/tally.js';
import { loadMenu, loadSettings, setSetting, getMsp, nameIn, optionsText } from './db.js';
import { orderingState, readyAt } from './hours.js';
import { newOrderId, newPublicRef, ORDER_ID_RE } from './ids.js';
import { api, buildOrder, verifyAuth, mapStatus } from './msp.js';
import { sendMail, alertText, alertSubject } from './mail.js';
const { tally } = tallyMod;

export const json = (o, status = 200, headers = {}) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const text = (s, status = 200) => new Response(s, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
const str = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const nowIso = () => new Date().toISOString();
export const CAFE_INBOX = 'reservationsoke@gmail.com';   // ruling Q1 = a

export async function createOrder(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return json({ error: 'bad_json' }, 400);
  const lang = ['nl', 'en', 'de'].includes(body.lang) ? body.lang : 'nl';
  const settings = await loadSettings(env);
  const st = orderingState(parseInt(settings.last_orders_offset_min, 10) || 30);
  if (!st.open) return json({ error: 'closed' }, 409);
  const msp = await getMsp(env, settings);
  if (!msp) return json({ error: 'no_psp' }, 503);
  const by = await loadMenu(env);
  const limits = { maxLines: +settings.cart_max_lines || 50, maxQty: +settings.cart_max_qty_per_line || 20, maxTotalCents: +settings.cart_max_total_cents || 50000, minOrderCents: +settings.min_order_cents || 0 };
  const lines = Array.isArray(body.lines) ? body.lines.slice(0, limits.maxLines + 1).map(l => ({
    id: String((l && l.id) || ''), qty: l && l.qty, note: str(l && l.note, 200), opts: (l && l.opts && typeof l.opts === 'object') ? l.opts : {} })) : [];
  const t = tally(lines, by, limits);
  if (!t.ok) return json({ error: t.error, missing: t.missing }, 400);
  const c = body.customer || {}, name = str(c.name, 80), email = str(c.email, 120), phone = str(c.phone, 30);
  if (!name || !email || !phone) return json({ error: 'fields' }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'email' }, 400);
  if (t.alcohol && body.age_confirmed !== true) return json({ error: 'age' }, 400);

  const order = { id: newOrderId(), public_ref: newPublicRef(), status: 'pending', lang,
    subtotal_cents: t.total, vat_low_cents: t.vat9, vat_high_cents: t.vat21, total_cents: t.total,
    customer_name: name, customer_email: email, customer_phone: phone, order_note: str(body.order_note, 500) || null,
    pickup_eta_min: parseInt(settings.standard_wait_min, 10) || 45, created_at: nowIso() };
  const items = t.lines.map((l, i) => { const m = by[l.id], optCents = l.opts.reduce((a, o) => a + (o.price || 0), 0);
    return { order_id: order.id, line: i + 1, item_id: l.id, qty: l.qty, unit_price_cents: m.price_cents, vat_rate: l.vat,
      name_snapshot: nameIn(m, lang), options_snapshot: optionsText(m, l.opts, lang) || null, options_cents: optCents, line_note: l.note || null }; });
  await insertOrder(env, order, items);
  return await startPayment(request, env, settings, msp, order, items);
}

export async function insertOrder(env, order, items) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await env.DB.batch([
        env.DB.prepare('insert into orders(id,public_ref,status,lang,subtotal_cents,vat_low_cents,vat_high_cents,total_cents,customer_name,customer_email,customer_phone,order_note,pickup_eta_min,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .bind(order.id, order.public_ref, 'pending', order.lang, order.subtotal_cents, order.vat_low_cents, order.vat_high_cents, order.total_cents, order.customer_name, order.customer_email, order.customer_phone, order.order_note, order.pickup_eta_min, order.created_at, order.created_at),
        ...items.map(l => env.DB.prepare('insert into order_items(order_id,line,item_id,qty,unit_price_cents,vat_rate,name_snapshot,options_snapshot,options_cents,line_note) values(?,?,?,?,?,?,?,?,?,?)')
          .bind(l.order_id, l.line, l.item_id, l.qty, l.unit_price_cents, l.vat_rate, l.name_snapshot, l.options_snapshot, l.options_cents, l.line_note)),
      ]);
      return;
    } catch (e) {
      if (/UNIQUE.*public_ref/i.test(String(e.message || e)) && attempt < 3) { order.public_ref = newPublicRef(); continue; }   // 4 chars collide now and then
      throw e;
    }
  }
}
// Create the MultiSafepay order from OUR row and hand back the hosted page.
export async function startPayment(request, env, settings, msp, order, items) {
  const origin = new URL(request.url).origin;
  const r = await api(msp.mode, msp.key, 'POST', '/orders', buildOrder({ order, items, origin, settings, ip: request.headers.get('cf-connecting-ip') }));
  if (!r.ok || !r.data || !r.data.payment_url) {
    await env.DB.prepare("update orders set status='failed', msp_status=?, updated_at=? where id=? and status='pending'").bind('create_failed: ' + (r.error || 'no payment_url'), nowIso(), order.id).run();
    return json({ error: 'psp', detail: r.error || null }, 502);
  }
  await env.DB.prepare("update orders set msp_status='initialized', updated_at=? where id=?").bind(nowIso(), order.id).run();
  return json({ id: order.id, public_ref: order.public_ref, payment_url: r.data.payment_url });
}

// The ONE state change. `data` is MultiSafepay's own order object (Get-order), never a request body.
// Conditional write WHERE status='pending' (gate cond. 4): a duplicate delivery is a no-op, two
// deliveries racing cannot both send the alert.
export async function transition(env, order, data) {
  const mspStatus = String(data.status || ''), ours = mapStatus(mspStatus), now = nowIso();
  const txid = data.transaction_id != null ? String(data.transaction_id) : null;
  const method = (data.payment_details && data.payment_details.type) || (data.payment_methods && data.payment_methods[0] && data.payment_methods[0].type) || null;
  const refund = parseInt(data.amount_refunded, 10) || 0;
  if (order.status === 'pending' && ours && ours !== 'pending') {
    if (String(data.order_id) !== order.id) return { changed: false, reason: 'order_id_mismatch' };
    if (ours === 'paid' && Number(data.amount) !== order.total_cents) {   // never mark paid on the wrong amount
      await env.DB.prepare('update orders set msp_status=?, updated_at=? where id=?').bind('amount_mismatch:' + data.amount + ':' + mspStatus, now, order.id).run();
      return { changed: false, reason: 'amount_mismatch' };
    }
    const r = await env.DB.prepare("update orders set status=?, msp_status=?, msp_order_id=?, paid_at=?, msp_refund_cents=?, updated_at=? where id=? and status='pending'")
      .bind(ours, mspStatus, txid, ours === 'paid' ? now : null, refund, now, order.id).run();
    if (r.meta && r.meta.changes === 1) {
      if (ours === 'paid') await sendAlert(env, { ...order, status: 'paid', paid_at: now, msp_order_id: txid }, { transaction_id: txid, method });
      return { changed: true, to: ours };
    }
    return { changed: false, reason: 'raced' };
  }
  await env.DB.prepare('update orders set msp_status=?, msp_order_id=coalesce(?,msp_order_id), msp_refund_cents=?, updated_at=? where id=?').bind(mspStatus, txid, refund, now, order.id).run();
  return { changed: false, to: order.status };
}
// The café's alert. A 200 from the mail call is recorded as sent; a failure is counted and the
// cron retries. The order is "delivered to the café" only when alert_sent_at is set (proposal §7).
export async function sendAlert(env, order, mspInfo) {
  const items = (await env.DB.prepare('select * from order_items where order_id=? order by line').bind(order.id).all()).results;
  const settings = await loadSettings(env);
  const to = settings.alert_to || CAFE_INBOX;
  try {
    await sendMail(env, { to, subject: alertSubject(order), text: alertText(env, order, items, mspInfo) });
    await env.DB.prepare('update orders set alert_sent_at=?, alert_attempts=alert_attempts+1, updated_at=? where id=?').bind(nowIso(), nowIso(), order.id).run();
    await setSetting(env, 'alert_last_error', null);
    return true;
  } catch (e) {
    await env.DB.prepare('update orders set alert_attempts=alert_attempts+1, updated_at=? where id=?').bind(nowIso(), order.id).run();
    await setSetting(env, 'alert_last_error', nowIso() + ' ' + String(e.message || e).slice(0, 300));
    return false;
  }
}

// MultiSafepay's notification. POST (signed) is what we ask for; GET is honoured too, and either
// way the body is only a hint: the status that is written comes from Get-order.
export async function notify(request, env) {
  const url = new URL(request.url);
  const id = url.searchParams.get('transactionid') || '';
  const raw = request.method === 'POST' ? await request.text() : '';
  if (!url.searchParams.get('timestamp') || !ORDER_ID_RE.test(id)) return text('OK');   // not one of ours: say OK so nobody retries
  const msp = await getMsp(env);
  if (!msp) return text('no psp', 503);
  const auth = request.headers.get('auth');
  if (request.method === 'POST' && auth) {
    const v = await verifyAuth(auth, raw, msp.key);
    if (!v.ok) return text('bad signature ' + v.reason, 401);
  }
  const order = await env.DB.prepare('select * from orders where id=?').bind(id).first();
  if (!order) return text('OK');
  const g = await api(msp.mode, msp.key, 'GET', '/orders/' + id);
  if (!g.ok) return text('retry later', 502);   // no OK → MultiSafepay retries (3×, 15 min apart)
  await transition(env, order, g.data);
  return text('OK');
}

// Read-only status for the thank-you page, keyed by the long id only (gate cond. 5). While the
// order is pending and the customer is back from the bank, ask MultiSafepay (their docs recommend a
// Get-order on the redirect) — throttled so a polling tab does not hammer their API.
const lastPoll = new Map();
export async function orderStatus(env, id) {
  if (!ORDER_ID_RE.test(id)) return json({ error: 'not_found' }, 404);
  let o = await env.DB.prepare('select * from orders where id=?').bind(id).first();
  if (!o) return json({ error: 'not_found' }, 404);
  if (o.status === 'pending' && Date.now() - (lastPoll.get(id) || 0) > 8000) {
    lastPoll.set(id, Date.now());
    const msp = await getMsp(env);
    if (msp) { const g = await api(msp.mode, msp.key, 'GET', '/orders/' + id); if (g.ok) { const r = await transition(env, o, g.data); if (r.changed) o.status = r.to; } }
  }
  return json({ status: o.status, public_ref: o.public_ref, lang: o.lang, eta_min: o.pickup_eta_min, total_cents: o.total_cents, created_at: o.created_at, ready_at: readyAt(o.created_at, o.pickup_eta_min) });
}

// Every 5 minutes (gate cond. 7): anything pending for 20+ minutes is asked about; an order that
// MultiSafepay never saw and whose link has long expired is ours to mark expired; unsent alerts retry.
export async function reconcile(env) {
  const settings = await loadSettings(env), msp = await getMsp(env, settings);
  const out = { checked: 0, changed: 0, alerts: 0 };
  if (msp) {
    const cutoff = new Date(Date.now() - 20 * 60000).toISOString();
    const pend = (await env.DB.prepare("select * from orders where status='pending' and created_at<? order by created_at limit 50").bind(cutoff).all()).results;
    for (const o of pend) {
      out.checked++;
      const g = await api(msp.mode, msp.key, 'GET', '/orders/' + o.id);
      if (g.ok) { if ((await transition(env, o, g.data)).changed) out.changed++; }
      else if (g.status === 404 || /1006|not found/i.test(g.error || '')) {
        const dead = (parseInt(settings.msp_seconds_active, 10) || 1800) * 1000 + 10 * 60000;
        if (Date.now() - Date.parse(o.created_at) > dead) { await env.DB.prepare("update orders set status='expired', msp_status='never_seen', updated_at=? where id=? and status='pending'").bind(nowIso(), o.id).run(); out.changed++; }
      }
    }
  }
  const unsent = (await env.DB.prepare("select * from orders where status='paid' and alert_sent_at is null and alert_attempts<12 order by paid_at limit 20").all()).results;
  for (const o of unsent) if (await sendAlert(env, o, { transaction_id: o.msp_order_id })) out.alerts++;
  return out;
}
