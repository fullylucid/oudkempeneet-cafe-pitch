// node tests/cart.ui.test.js — the order panel's layout, in a real browser. Run from repo root.
//
// Guards the two defects found on 2026-09-06 (Zach's screenshot: four items in the cart, one of
// them visible):
//   1. the panel gave the checkout form a rigid band and the list, the only band that could give,
//      collapsed to its minimum — so assert how many lines you can actually SEE, not that the
//      markup exists;
//   2. `.shop` carried a stacking context, which trapped the phone drawer (z-index 70) under the
//      dim scrim (z-index 65, a body child) and swallowed every tap in the open cart — so
//      hit-test a real control instead of trusting z-index.
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) {
  try { ({ chromium } = require('/home/user/.npm-global/lib/node_modules/playwright')); }
  catch (e2) { console.log('tests/cart.ui.test.js: SKIP — playwright not installed (npm i -g playwright)'); process.exit(0); }
}
const URL = 'file://' + require('path').resolve('ordering/site/index.html');
const MIN_LINES = 5;                                   // Zach: "about 5 items at once without having to scroll"

let n = 0; const fails = [];
const ok = (c, m) => { n++; if (!c) fails.push(m); };

async function fill(page, count) {                     // put `count` different dishes in the cart
  const adds = await page.locator('.add:not([disabled])').all();
  for (let i = 0; i < count; i++) await adds[i].click();
  await page.waitForTimeout(200);
}
const onScreen = 'r => r.top >= -1 && r.bottom <= innerHeight + 1';

(async () => {
  const browser = await chromium.launch();
  const errors = [];

  // ---- desktop: the list keeps the room, the totals and the pay button never leave ----
  for (const vp of [{ width: 1440, height: 900 }, { width: 1366, height: 768 }, { width: 1280, height: 720 }]) {
    const page = await browser.newPage({ viewport: vp });
    page.on('pageerror', e => errors.push(vp.width + ': ' + e));
    await page.goto(URL); await page.waitForTimeout(400);
    await fill(page, 9);
    await page.evaluate(() => window.scrollTo(0, 1200)); await page.waitForTimeout(400);
    if (!await page.$('#cart-scroll')) { ok(false, `${vp.width}: the panel has no #cart-scroll band — rebuild with tools/build-bestellen.py`); await page.close(); continue; }
    const m = await page.evaluate(() => {
      const on = r => r.top >= -1 && r.bottom <= innerHeight + 1;
      const sb = document.getElementById('cart-scroll').getBoundingClientRect();
      const seen = [...document.querySelectorAll('.line')].filter(el => {
        const b = el.getBoundingClientRect();
        return b.top >= sb.top - 1 && b.bottom <= sb.bottom + 1 && on(b);
      }).length;
      return { seen, title: on(document.querySelector('.cart-h').getBoundingClientRect()),
        total: on(document.querySelector('.tot').getBoundingClientRect()),
        pay: on(document.getElementById('pay').getBoundingClientRect()) };
    });
    ok(m.seen >= MIN_LINES, `${vp.width}x${vp.height}: ${m.seen} order lines visible, want >= ${MIN_LINES}`);
    ok(m.title && m.total && m.pay, `${vp.width}x${vp.height}: title/total/pay must all stay on screen (got ${JSON.stringify(m)})`);

    // expand: the whole order laid out down the page, nothing left to scroll inside the panel
    await page.locator('#cart-exp').click(); await page.waitForTimeout(250);
    const e = await page.evaluate(() => {
      const sc = document.getElementById('cart-scroll');
      return { inner: sc.scrollHeight - sc.clientHeight, rows: document.querySelectorAll('.line').length,
        expanded: document.getElementById('cart-exp').getAttribute('aria-expanded') };
    });
    ok(e.inner === 0 && e.rows === 9 && e.expanded === 'true', `${vp.width}: expanded must lay out all 9 lines with no inner scroll (got ${JSON.stringify(e)})`);
    await page.locator('#cart-exp').click(); await page.waitForTimeout(250);
    const c = await page.evaluate(() => { const sc = document.getElementById('cart-scroll');
      return { inner: sc.scrollHeight - sc.clientHeight, expanded: document.getElementById('cart-exp').getAttribute('aria-expanded') }; });
    ok(c.inner > 0 && c.expanded === 'false', `${vp.width}: collapsing must restore the panel's own scroller (got ${JSON.stringify(c)})`);
    await page.close();
  }

  // ---- phone: the drawer's controls must actually receive the tap ----
  for (const vp of [{ width: 390, height: 844 }, { width: 360, height: 640 }]) {
    const page = await browser.newPage({ viewport: vp, hasTouch: true });
    page.on('pageerror', e => errors.push(vp.width + ': ' + e));
    await page.goto(URL); await page.waitForTimeout(400);
    await fill(page, 9);
    await page.locator('#bar-btn').click(); await page.waitForTimeout(500);
    const hit = await page.evaluate(() => {
      const inCart = el => !!(el && document.getElementById('cart').contains(el));
      const probe = el => { if (!el) return false; const r = el.getBoundingClientRect(); return inCart(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); };
      const plus = document.querySelector('.line .qty button:last-child');
      const on = r => r.top >= -1 && r.bottom <= innerHeight + 1;
      return { plus: probe(plus), exp: probe(document.getElementById('cart-exp')), pay: probe(document.getElementById('pay')),
        total: on(document.querySelector('.tot').getBoundingClientRect()) };
    });
    ok(hit.plus && hit.exp && hit.pay, `${vp.width}: open drawer must be hit-testable — nothing may paint over it (got ${JSON.stringify(hit)})`);
    ok(hit.total, `${vp.width}: the total must stay visible in the open drawer`);
    // the quantity control works through the scrim-free drawer
    const before = await page.evaluate(() => document.querySelector('.line .qty span').textContent);
    let after = before, clickErr = '';
    try { await page.locator('.line .qty button:last-child').first().click({ timeout: 4000 }); await page.waitForTimeout(150);
      after = await page.evaluate(() => document.querySelector('.line .qty span').textContent); }
    catch (err) { clickErr = ' — ' + String(err).split('\n').find(l => /intercepts pointer events|Timeout/.test(l) || true); }
    ok(Number(after) === Number(before) + 1, `${vp.width}: "+" in the drawer must change the quantity (${before} -> ${after})${clickErr}`);
    await page.close();
  }

  // ---- no width may make the page scroll sideways ----
  for (const vp of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 900, height: 800 }, { width: 390, height: 844 }, { width: 360, height: 640 }]) {
    const page = await browser.newPage({ viewport: vp, hasTouch: vp.width < 901 });
    page.on('pageerror', e => errors.push(vp.width + ': ' + e));
    await page.goto(URL); await page.waitForTimeout(350);
    await fill(page, 4);
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    ok(w[0] <= w[1], `${vp.width}: page is ${w[0]}px wide in a ${w[1]}px window`);
    await page.close();
  }

  ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
  await browser.close();

  if (fails.length) { console.error('tests/cart.ui.test.js: ' + fails.length + ' of ' + n + ' checks FAILED');
    fails.forEach(f => console.error('  - ' + f)); process.exit(1); }
  console.log('tests/cart.ui.test.js: ' + n + ' checks passed');
})();
