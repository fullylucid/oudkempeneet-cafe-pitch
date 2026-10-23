// node tests/bestellen-real-menu.test.js — the REAL built ordering page, end to end. Run from repo root.
//
// The mechanics suites (cart.ui, beheer, tally) build from the frozen tests/fixtures/menu.json, so
// without this file no browser ever loads ordering/site/index.html as the café will ship it. This
// one does: every dish on Dave's takeaway card goes in the cart once, every choice is answered, and
// the page must arrive at exactly the total and the 9% VAT that the menu data and tally's rule
// (VAT from the bucket subtotal: round(sub * 9 / 109)) say it should — before MultiSafepay sits on top.
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) {
  try { ({ chromium } = require(require('path').join(require('os').homedir(), '.npm-global/lib/node_modules/playwright'))); }
  catch (e2) { console.log('tests/bestellen-real-menu.test.js: SKIP — playwright not installed (npm i -g playwright)'); process.exit(0); }
}
const fs = require('fs'), path = require('path');
const URL = 'file://' + path.resolve('ordering/site/index.html');
const menu = JSON.parse(fs.readFileSync('data/menu.json', 'utf8')).items;
const { tally } = require('../src/tally.js');
const by = {}; menu.forEach(m => by[m.id] = m);
let n = 0; const fails = [];
const ok = (c, m) => { n++; if (!c) fails.push(m); };
const cents = s => parseInt(String(s).replace(/[^\d]/g, ''), 10);   // "€ 481,95" → 48195

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    page.on('pageerror', e => errors.push('pageerror: ' + e));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto(URL); await page.waitForTimeout(500);

    const shown = await page.evaluate(() => [...document.querySelectorAll('.item')].map(d => d.dataset.id));
    ok(shown.length === menu.length && menu.every(m => shown.includes(m.id)),
      `every dish in data/menu.json is on the page (${shown.length} shown, ${menu.length} in the data)`);

    for (const m of menu) {
      await page.locator(`.item[data-id="${m.id}"] .ctl button`).first().click();
      for (const g of m.options || [])
        await page.locator(`.line[data-id="${m.id}"] .opt select[data-g="${g.id}"]`).first().selectOption(g.options[0].id);
    }
    await page.waitForTimeout(300);

    const got = await page.evaluate(() => ({
      lines: document.querySelectorAll('.line').length,
      tot: (document.querySelector('#tally .tot span:last-child') || {}).textContent,
      vat: [...document.querySelectorAll('#tally .vat')].map(v => v.textContent),
      msg: (document.getElementById('msg') || {}).textContent || '',
      cart: JSON.parse(localStorage.getItem('ok-cart') || '[]') }));
    const r = tally(got.cart, by);   // the cart the page saved, through the one totals function
    got.t = { ok: r.ok, error: r.error || null, total: r.total, vat9: r.vat9 };
    const sum = menu.reduce((a, m) => a + m.price_cents, 0);
    const vat9 = Math.round(sum * 9 / 109);
    ok(got.lines === menu.length, `one line per dish (got ${got.lines})`);
    ok(cents(got.tot) === sum, `the cart total is the sum of price_cents: want ${sum}, page shows "${got.tot}"`);
    ok(got.vat.length === 1 && /9/.test(got.vat[0]) && cents(got.vat[0].replace(/^[^€]*/, '')) === vat9,
      `one VAT row, 9%, equal to round(${sum} * 9 / 109) = ${vat9} (got ${JSON.stringify(got.vat)})`);
    ok(got.t.ok && got.t.total === sum && got.t.vat9 === vat9, `the cart the page saved passes src/tally.js with the same total and VAT (got ${JSON.stringify(got.t)})`);
    ok(!/keuze|choice/i.test(got.msg), `every choice answered — no missing-choice message (got "${got.msg}")`);
    await page.close();
  } catch (e) { fails.push('crashed: ' + e.message); }
  finally { await browser.close(); }
  ok(errors.length === 0, 'no console or page errors: ' + errors.join(' | '));
  console.log(fails.length ? `tests/bestellen-real-menu.test.js: FAIL ${fails.length}/${n}\n  - ` + fails.join('\n  - ') : `tests/bestellen-real-menu.test.js: ${n} checks passed`);
  process.exit(fails.length ? 1 : 0);
})();
