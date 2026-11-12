// node tests/worker.test.js — the ordering Worker's pure parts, run from the repo root under Node 22
// (WebCrypto is global). What needs a Worker runtime (D1, the email binding) is proven on the
// deployed test Worker instead (DEPLOY.md, "Ordering Worker").
let n = 0; const fails = [];
const ok = (c, m) => { n++; if (!c) fails.push(m); };
(async () => {
  const msp = await import('../ordering/worker/src/msp.js');
  const seal = await import('../ordering/worker/src/seal.js');
  const hours = await import('../ordering/worker/src/hours.js');
  const ids = await import('../ordering/worker/src/ids.js');
  const mail = await import('../ordering/worker/src/mail.js');

  // ---- webhook signature: base64("ts:hexhmac"), HMAC-SHA512 over "ts:body" keyed with the API key
  const key = 'test_api_key_1234567890', body = '{"status":"completed","order_id":"abc"}', ts = String(Math.floor(Date.now() / 1000));
  const auth = await msp.makeAuth(body, key, ts);
  ok((await msp.verifyAuth(auth, body, key)).ok, 'a correctly signed notification verifies');
  ok(!(await msp.verifyAuth(auth, body + ' ', key)).ok, 'one changed byte in the body fails');
  ok(!(await msp.verifyAuth(auth, body, key + 'x')).ok, 'the wrong key fails');
  ok((await msp.verifyAuth(await msp.makeAuth(body, key, String(+ts - 3600)), body, key)).reason === 'stale', 'a one-hour-old timestamp is stale (replay guard)');
  ok((await msp.verifyAuth('', body, key)).reason === 'no_auth' && (await msp.verifyAuth('!!!', body, key)).ok === false, 'missing or garbage header fails closed');
  const decoded = atob(auth); ok(/^\d+:[0-9a-f]{128}$/.test(decoded), 'the header decodes to timestamp:128-hex-chars (SHA-512 hex, not base64)');

  // ---- status map (gate cond. 4)
  ok(msp.mapStatus('completed') === 'paid' && msp.mapStatus('initialized') === 'pending' && msp.mapStatus('uncleared') === 'pending', 'completed→paid; initialized/uncleared→pending');
  ok(msp.mapStatus('declined') === 'failed' && msp.mapStatus('void') === 'failed' && msp.mapStatus('cancelled') === 'failed' && msp.mapStatus('expired') === 'expired', 'declined/void/cancelled→failed, expired→expired');
  ok(msp.mapStatus('refunded') === null && msp.mapStatus('partial_refunded') === null, 'refunds are recorded only, never a state change');
  ok(msp.mapStatus('something_new') === 'pending', 'an unknown status never marks anything paid');

  // ---- the MultiSafepay order body
  const order = { id: 'A'.repeat(24), public_ref: 'K7MP', lang: 'en', total_cents: 450, customer_name: 'Jan de Vries', customer_email: 'j@example.com', customer_phone: '0612345678' };
  const items = [{ item_id: 'friet-normaal', qty: 1, unit_price_cents: 350, options_cents: 100, vat_rate: 9, name_snapshot: 'French fries, regular', options_snapshot: 'Sauce: Mayonnaise; Second sauce: Ketchup' }];
  const b = msp.buildOrder({ order, items, origin: 'https://bestellen.oudkempeneetcafe.nl', settings: { msp_seconds_active: '1800' }, ip: '1.2.3.4' });
  ok(b.type === 'redirect' && b.order_id === order.id && b.currency === 'EUR' && b.amount === 450, 'redirect order, our id, cents');
  ok(b.payment_options.notification_url === 'https://bestellen.oudkempeneetcafe.nl/api/msp/notify' && b.payment_options.notification_method === 'POST', 'POST notifications to /api/msp/notify');
  ok(/^[A-Za-z0-9\-_.:\/]+$/.test(b.payment_options.redirect_url) && /^[A-Za-z0-9\-_.:\/]+$/.test(b.payment_options.cancel_url), 'return URLs use only the characters MultiSafepay allows (no query string)');
  ok(b.customer.locale === 'en_GB' && b.customer.ip_address === '1.2.3.4' && b.customer.first_name === 'Jan' && b.customer.last_name === 'de Vries', 'customer locale, ip, name split');
  ok(b.seconds_active === 1800 && b.second_chance.send_email === false, 'link lives 30 min; no Second Chance mails for takeaway');
  ok(b.shopping_cart.items[0].unit_price === msp.exVat(450, 9) && Math.abs(parseFloat(b.shopping_cart.items[0].unit_price) * 1.09 - 4.5) < 1e-9, 'cart unit price is euros EXCLUDING VAT (docs/rounding-rule), surcharge included');
  ok(b.checkout_options.tax_tables.alternate.some(t => t.name === 'BTW9' && t.rules[0].rate === 0.09) && b.shopping_cart.items[0].tax_table_selector === 'BTW9', 'tax table rate is a fraction and the line selects it');
  ok(b.description.length <= 200 && b.order_id.length <= 50, 'description and order_id within MultiSafepay limits');

  // ---- sealing the key at rest
  const hex = [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2, '0')).join('');
  const sealed = await seal.seal(hex, 'super-secret-key');
  ok(sealed !== 'super-secret-key' && !sealed.includes('secret') && await seal.unseal(hex, sealed) === 'super-secret-key', 'seal/unseal round-trips and the stored form is not the key');
  ok(await seal.seal(hex, 'x') !== await seal.seal(hex, 'x'), 'fresh IV every time');
  let threw = false; try { await seal.unseal(hex.replace(/./g, '0'), sealed); } catch (e) { threw = true; } ok(threw, 'the wrong SEAL_KEY cannot open it');
  ok(await seal.derive(hex, 'a') !== await seal.derive(hex, 'b') && /^[0-9a-f]{64}$/.test(await seal.derive(hex, 'a')), 'the cookie value is a derived 32-byte hex, not the token');
  ok(seal.timingSafeEqual('abc', 'abc') && !seal.timingSafeEqual('abc', 'abd') && !seal.timingSafeEqual('abc', 'ab'), 'constant-time compare');

  // ---- hours (same engine as the page)
  const mon14 = new Date('2026-11-16T13:00:00Z'), mon16 = new Date('2026-11-16T15:00:00Z'), sat1240 = new Date('2026-11-14T11:40:00Z'), mon2045 = new Date('2026-11-16T19:45:00Z');  // CET = UTC+1
  ok(!hours.orderingState(30, mon14).open && hours.orderingState(30, mon14).when === 'today', 'Monday 14:00 Amsterdam: closed, opens today');
  ok(hours.orderingState(30, mon16).open, 'Monday 16:00: open');
  ok(hours.orderingState(30, sat1240).open, 'Saturday 12:40: open (12:30 at weekends)');
  ok(!hours.orderingState(30, mon2045).open && hours.orderingState(30, mon2045).when === 'tomorrow', 'Monday 20:45: last orders passed (20:30)');
  ok(hours.readyAt('2026-11-16T15:00:00Z', 45) === '16:45', 'ready-at = created + wait, Amsterdam clock');

  // ---- ids
  ok(ids.ORDER_ID_RE.test(ids.newOrderId()) && ids.newOrderId() !== ids.newOrderId(), 'order ids: 24 base62 chars, random');
  ok(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/.test(ids.newPublicRef()), 'public ref: 4 chars, no 0/O/1/I');
  ok(ids.eur(48195) === '€ 481,95' && ids.eur(1) === '€ 0,01', 'euro formatting');

  // ---- the alert ticket
  const o2 = { public_ref: 'K7MP', created_at: '2026-11-16T15:00:00Z', pickup_eta_min: 45, total_cents: 450, vat_low_cents: 37, vat_high_cents: 0, customer_name: 'Jan', customer_phone: '06', customer_email: 'j@x.nl', lang: 'nl', order_note: 'zonder ui' };
  const txt = mail.alertText({}, o2, [{ qty: 1, unit_price_cents: 350, options_cents: 100, name_snapshot: 'Normale friet', options_snapshot: 'Saus: Mayonaise; Tweede saus: Ketchup', line_note: 'extra zout' }], { transaction_id: '123', method: 'IDEAL' });
  ok(/K7MP/.test(txt) && /16:45/.test(txt) && /1 x Normale friet \(Saus: Mayonaise; Tweede saus: Ketchup\)  € 4,50/.test(txt) && /extra zout/.test(txt) && /zonder ui/.test(txt) && /€ 4,50/.test(txt) && /IDEAL/.test(txt) && /123/.test(txt), 'the ticket carries ref, ready time, lines with options and notes, total, method, MSP id');
  const mime = mail.buildMime({ from: 'bestellen@oudkempeneetcafe.nl', fromName: 'Oud-Kempen Eetcafé', to: 'a@b.nl', subject: 'Afhaalbestelling K7MP — € 4,50', text: 'héllo' });
  ok(/^From: =\?UTF-8\?B\?.+\?= <bestellen@oudkempeneetcafe.nl>\r\n/.test(mime) && /Subject: =\?UTF-8\?B\?/.test(mime) && /Content-Transfer-Encoding: base64/.test(mime) && mime.includes(btoa(unescape(encodeURIComponent('héllo')))), 'MIME: UTF-8 encoded words, base64 body');

  console.log(fails.length ? `tests/worker.test.js: FAIL ${fails.length}/${n}\n  - ` + fails.join('\n  - ') : `tests/worker.test.js: ${n} checks passed`);
  process.exit(fails.length ? 1 : 0);
})();
