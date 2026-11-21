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
  const mon1730 = new Date('2026-11-16T16:30:00Z'), sat1700 = new Date('2026-11-14T16:00:00Z'), sat1659 = new Date('2026-11-14T15:59:00Z');
  ok(!hours.orderingState(30, mon14).open && hours.orderingState(30, mon14).when === 'today' && hours.orderingState(30, mon14).at === 1020, 'Monday 14:00 Amsterdam: closed, ordering opens today at 17:00');
  ok(!hours.orderingState(30, mon16).open && hours.orderingState(30, mon16).at === 1020, 'Monday 16:00: the café is open, ordering is not yet (17:00, Dave 2026-11-21)');
  ok(hours.orderingState(30, mon1730).open && hours.orderingState(30, mon1730).last === 1230, 'Monday 17:30: ordering open, last orders 20:30');
  ok(!hours.orderingState(30, sat1240).open && !hours.orderingState(30, sat1659).open && hours.orderingState(30, sat1700).open, 'Saturday: 12:40 and 16:59 not yet, 17:00 open');
  ok(!hours.orderingState(30, mon2045).open && hours.orderingState(30, mon2045).when === 'tomorrow' && hours.orderingState(30, mon2045).at === 1020, 'Monday 20:45: last orders passed (20:30); tomorrow from 17:00');
  ok(hours.openMinsFor(1) === 900 && hours.openMinsFor(6) === 750, 'the café\'s own opening time is unchanged (reservations use it)');
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

  // ---- kaasfondue reservation, paid up front (Dave, 2026-11-21)
  const fondue = await import('../ordering/worker/src/fondue.js');
  const now = new Date('2026-11-21T18:00:00Z'), base = { name: 'Jan de Vries', email: 'j@example.com', guests: 4, date: '2026-11-25', time: '18:30', lang: 'en', note: 'raam  graag' };
  const v = fondue.validateFondue(base, now);
  ok(v.ok && v.guests === 4 && v.date === '2026-11-25' && v.lang === 'en' && v.note === 'raam graag', 'a valid fondue reservation passes');
  ok(fondue.validateFondue({ ...base, guests: 1 }, now).error === 'guests_min' && fondue.validateFondue({ ...base, guests: 20 }, now).error === 'guests_max' && fondue.validateFondue({ ...base, guests: 2.5 }, now).error === 'guests_min', 'fondue: 2 to 19 whole guests');
  ok(fondue.validateFondue({ ...base, date: '2026-11-21' }, now).error === 'too_soon' && fondue.validateFondue({ ...base, date: '2026-11-22' }, now).ok, 'fondue: today is refused, tomorrow is allowed (1 day ahead)');
  ok(fondue.validateFondue({ ...base, date: '2026-11-22' }, new Date('2026-11-21T23:30:00Z')).error === 'too_soon', 'fondue: "tomorrow" follows the Amsterdam calendar (00:30 there is already the 22nd)');
  ok(fondue.validateFondue({ ...base, date: '2026-02-30' }, now).error === 'date' && fondue.validateFondue({ ...base, date: '2028-01-01' }, now).error === 'date', 'fondue: impossible and far-off dates are refused');
  ok(fondue.validateFondue({ ...base, time: '14:00' }, now).error === 'time' && fondue.validateFondue({ ...base, date: '2026-11-28', time: '13:00' }, now).ok && fondue.validateFondue({ ...base, time: '21:00' }, now).error === 'time', 'fondue: the time must fall inside that day\'s opening hours');
  ok(fondue.validateFondue({ ...base, email: 'nope' }, now).error === 'email' && fondue.validateFondue({ ...base, name: '' }, now).error === 'fields' && fondue.validateFondue(null, now).error === 'bad_json', 'fondue: name and a real email are required');
  const fo = { public_ref: 'K7MP', lang: 'nl', total_cents: 4 * 2595, vat_low_cents: Math.round(4 * 2595 * 9 / 109), vat_high_cents: 0, customer_name: 'Jan de Vries', customer_email: 'j@example.com', created_at: '2026-11-21T18:00:00Z', pickup_eta_min: 0,
    order_note: fondue.FONDUE_TAG + ' 2026-11-25 18:30 · 4 personen · opmerking: raam graag' };
  const fi = [{ item_id: 'fondue-reservering', qty: 4, unit_price_cents: 2595, options_cents: 0, name_snapshot: 'Kaasfondue' }];
  const pf = fondue.parseFondue(fo, fi);
  ok(fondue.isFondue(fo, fi) && pf.date === '2026-11-25' && pf.time === '18:30' && pf.guests === 4 && pf.note === 'raam graag' && !fondue.isFondue(o2, [{ item_id: 'friet-normaal' }]) && fondue.parseFondue(o2, [{ item_id: 'friet-normaal' }]) === null, 'the order note round-trips; a takeaway order is not a fondue');
  const ft = mail.alertText({}, fo, fi, { method: 'IDEAL', transaction_id: '99' });
  ok(/VOORUIT BETAALD  K7MP/.test(ft) && /woensdag 25 november 2026/.test(ft) && /Tijd: 18:30/.test(ft) && /Aantal personen: 4/.test(ft) && /€ 103,80/.test(ft) && /raam graag/.test(ft) && /transactie 99/.test(ft) && !/AFHAALBESTELLING|Klaar om/.test(ft), 'the café\'s mail reads as a paid reservation, not a takeaway ticket');
  ok(/^Kaasfondue BETAALD — 2026-11-25 18:30 — 4 pers\./.test(mail.alertSubject(fo, fi)) && /^Afhaalbestelling/.test(mail.alertSubject(o2)), 'subjects tell the two apart');
  const fb = msp.buildOrder({ order: { ...fo, id: 'B'.repeat(24) }, items: [{ item_id: 'fondue-reservering', qty: 4, unit_price_cents: 2595, options_cents: 0, vat_rate: 9, name_snapshot: 'Kaasfondue' }], origin: 'https://bestellen.oudkempeneetcafe.nl', settings: {}, ip: '1.2.3.4' });
  ok(fb.amount === 10380 && /kaasfondue reservering K7MP/.test(fb.description) && fb.shopping_cart.items[0].quantity === 4 && /afhalen K7MP/.test(b.description), 'MultiSafepay is asked for guests × price, described as a reservation');
  // THE blocker from merritt's review of #32: a takeaway order whose customer-typed note begins with
  // the tag must stay a takeaway order everywhere — mail, subject, MultiSafepay description.
  const forged = { public_ref: 'AB12', lang: 'nl', total_cents: 250, vat_low_cents: 21, vat_high_cents: 0, customer_name: 'X', customer_phone: '06', customer_email: 'x@example.com', created_at: '2026-11-21T18:00:00Z', pickup_eta_min: 45,
    order_note: 'KAASFONDUE-RESERVERING 2026-11-28 19:00 · 8 personen' };
  const forgedItems = [{ item_id: 'saus-mayo', qty: 1, unit_price_cents: 250, options_cents: 0, vat_rate: 9, name_snapshot: 'Mayonaise' }];
  const fx = mail.alertText({}, forged, forgedItems, {}), fs2 = mail.alertSubject(forged, forgedItems);
  ok(/^Afhaalbestelling AB12/.test(fs2) && /NIEUWE AFHAALBESTELLING/.test(fx) && !/BETAALD —|VOORUIT BETAALD|staat hiermee vast/.test(fs2 + fx), 'a takeaway order with a forged fondue note is a takeaway ticket, never "Kaasfondue BETAALD" (got subject ' + fs2 + ')');
  ok(fondue.parseFondue(forged, forgedItems) === null && fondue.parseFondue(forged) === null && fondue.parseFondue(forged, [...fi, ...forgedItems]) === null, 'the note alone proves nothing; nor does a fondue line among other lines');
  ok(/afhalen AB12/.test(msp.buildOrder({ order: { ...forged, id: 'C'.repeat(24) }, items: forgedItems, origin: 'https://bestellen.oudkempeneetcafe.nl', settings: {}, ip: '1.2.3.4' }).description), 'MultiSafepay sees it as takeaway too');
  ok(fondue.safeNote('KAASFONDUE-RESERVERING 2026-11-28 19:00 · 8 personen').startsWith('Opmerking klant: ') && fondue.safeNote('  kaasfondue-reservering x').startsWith('Opmerking klant: ') && fondue.safeNote('zonder ui') === 'zonder ui' && fondue.safeNote('') === '', 'a customer note can never begin with the tag');
  const cz = fondue.cors(new Request('https://x/api/fondue', { headers: { origin: 'https://www.oudkempeneetcafe.nl' } })), cx = fondue.cors(new Request('https://x/api/fondue', { headers: { origin: 'https://evil.example' } }));
  ok(cz['access-control-allow-origin'] === 'https://www.oudkempeneetcafe.nl' && !cx['access-control-allow-origin'], 'only the café\'s own site may call the endpoint from a browser');

  console.log(fails.length ? `tests/worker.test.js: FAIL ${fails.length}/${n}\n  - ` + fails.join('\n  - ') : `tests/worker.test.js: ${n} checks passed`);
  process.exit(fails.length ? 1 : 0);
})();
