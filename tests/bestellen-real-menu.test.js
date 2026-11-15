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
const sellable = menu.filter(m => m.orderable);   // sauces and the roll are choices on a product, not items (msg 143)
// what one portion costs with the FIRST answer to every question — the page picks the same below
const unitFirst = m => m.price_cents + (m.options || []).reduce((a, g) => a + (g.options[0].price_cents || 0), 0);
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

    const off = await page.evaluate(() => [...document.querySelectorAll('.item.off')].map(d => [d.dataset.id, d.querySelector('.ctl button').disabled]));
    ok(off.length === menu.length - sellable.length && off.every(([, dis]) => dis), `sauces and the roll show but cannot be added on their own (${JSON.stringify(off)})`);

    // Dave (msg 147): the question comes when you press the dish, not at checkout. The first dish
    // with a question proves the sheet's contract before the whole card goes through it.
    const asked = sellable.find(m => (m.options || []).length);
    const plain = sellable.find(m => !(m.options || []).length);
    const lines = () => page.evaluate(() => document.querySelectorAll('.line').length);
    const sheetOn = () => page.evaluate(() => document.getElementById('pick').classList.contains('on'));
    await page.locator(`.item[data-id="${plain.id}"] .ctl button`).first().click(); await page.waitForTimeout(100);
    ok(!await sheetOn() && await lines() === 1, `a dish without a question goes straight into the cart (${plain.id})`);
    await page.locator(`.item[data-id="${asked.id}"] .ctl button`).first().click(); await page.waitForTimeout(100);
    ok(await sheetOn() && await lines() === 1, `pressing + on ${asked.id} opens the question and adds nothing yet`);
    const groups = await page.evaluate(() => [...document.querySelectorAll('#pick-g .pg')].map(f => f.dataset.g));
    ok(JSON.stringify(groups) === JSON.stringify(asked.options.map(g => g.id)), `the sheet asks every group of ${asked.id} (${groups})`);
    const req = asked.options.filter(g => g.required !== false).length;
    ok(await page.evaluate(() => document.getElementById('pick-ok').disabled) === (req > 0), `Toevoegen is ${req ? 'disabled until the required answers' : 'enabled when every question is optional'}`);
    await page.locator('#pick-x').click(); await page.waitForTimeout(100);
    ok(!await sheetOn() && await lines() === 1, 'cancel closes the sheet and adds nothing');
    // fries: the second sauce (same list, optional) stays folded until a first sauce is chosen
    const fries = sellable.find(m => (m.options || []).length >= 2 && m.options[1].required === false
      && m.options[0].options.map(o => o.id).join() === m.options[1].options.map(o => o.id).join());
    if (fries) {
      await page.locator(`.item[data-id="${fries.id}"] .ctl button`).first().click(); await page.waitForTimeout(100);
      const hid = () => page.evaluate(() => [...document.querySelectorAll('#pick-g .pg.hid')].map(f => f.dataset.g));
      ok((await hid()).join() === fries.options[1].id, `${fries.id}: only the second sauce is folded at first (hidden: ${await hid()})`);
      ok(!await page.evaluate(() => document.getElementById('pick-ok').disabled), 'both sauces are optional, so Toevoegen is open with none');
      await page.locator(`#pick-g .pg[data-g="${fries.options[0].id}"] input[value="${fries.options[0].options[0].id}"]`).check(); await page.waitForTimeout(100);
      ok((await hid()).length === 0, 'choosing a first sauce unfolds the second');
      await page.locator(`#pick-g .pg[data-g="${fries.options[1].id}"] input[value="${fries.options[1].options[1].id}"]`).check(); await page.waitForTimeout(100);
      await page.locator(`#pick-g .pg[data-g="${fries.options[0].id}"] input[value=""]`).check(); await page.waitForTimeout(100);
      const back = await page.evaluate(() => ({ hid: document.querySelectorAll('#pick-g .pg.hid').length, label: document.getElementById('pick-ok').textContent }));
      ok(back.hid === 1 && cents(back.label) === fries.price_cents, `taking the first sauce away folds and clears the second; the price is the dish again (got ${JSON.stringify(back)})`);
      await page.locator('#pick-x').click(); await page.waitForTimeout(100);
    } else ok(false, 'the card has no dish with two optional sauce groups — the fold rule is untested');
    await page.locator(`.item[data-id="${plain.id}"] .ctl button`).last().click(); await page.waitForTimeout(100);   // +1 of the plain dish: a qty, not a sheet
    ok(!await sheetOn() && await lines() === 1 && await page.evaluate(() => document.querySelector('.line .qty span').textContent) === '2', 'a second plain portion is a quantity, no sheet');
    await page.locator(`.item[data-id="${plain.id}"] .ctl button`).first().click(); await page.waitForTimeout(100);   // back to 1

    const pick = async m => {
      for (const g of m.options || []) await page.locator(`#pick-g .pg[data-g="${g.id}"] input[value="${g.options[0].id}"]`).check();
      const label = await page.locator('#pick-ok').textContent();
      ok(cents(label) === unitFirst(m), `${m.id}: the button carries the price with the answers: want ${unitFirst(m)}, got "${label}"`);
      await page.locator('#pick-ok').click();
    };
    for (const m of sellable) {
      if (m === plain) continue;                                   // already in
      await page.locator(`.item[data-id="${m.id}"] .ctl button`).first().click();
      if (m.options && m.options.length) await pick(m);
    }
    await page.waitForTimeout(300);
    const onLine = await page.evaluate(id => [...document.querySelectorAll(`.line[data-id="${id}"] .opt select`)].map(s => s.value), asked.id);
    ok(JSON.stringify(onLine) === JSON.stringify(asked.options.map(g => g.options[0].id)), `the cart line of ${asked.id} shows the answers and can still change them (${onLine})`);

    const got = await page.evaluate(() => ({
      lines: document.querySelectorAll('.line').length,
      tot: (document.querySelector('#tally .tot span:last-child') || {}).textContent,
      vat: [...document.querySelectorAll('#tally .vat')].map(v => v.textContent),
      msg: (document.getElementById('msg') || {}).textContent || '',
      cart: JSON.parse(localStorage.getItem('ok-cart') || '[]') }));
    const r = tally(got.cart, by);   // the cart the page saved, through the one totals function
    got.t = { ok: r.ok, error: r.error || null, total: r.total, vat9: r.vat9 };
    const sum = sellable.reduce((a, m) => a + unitFirst(m), 0);
    const vat9 = Math.round(sum * 9 / 109);
    ok(got.lines === sellable.length, `one line per dish (got ${got.lines})`);
    ok(sum > sellable.reduce((a, m) => a + m.price_cents, 0), 'the chosen sauces and rolls cost money on top of the dishes');
    ok(cents(got.tot) === sum, `the cart total is the sum of price_cents: want ${sum}, page shows "${got.tot}"`);
    ok(got.vat.length === 1 && /9/.test(got.vat[0]) && cents(got.vat[0].replace(/^[^€]*/, '')) === vat9,
      `one VAT row, 9%, equal to round(${sum} * 9 / 109) = ${vat9} (got ${JSON.stringify(got.vat)})`);
    const fl = await page.evaluate(() => (document.querySelector('.line[data-id="friet-normaal"] .sub') || {}).textContent);
    ok(cents(fl) === unitFirst(by['friet-normaal']), `the fries line shows its own price with both sauces: want ${unitFirst(by['friet-normaal'])}, got "${fl}"`);
    ok(got.t.ok && got.t.total === sum && got.t.vat9 === vat9, `the cart the page saved passes src/tally.js with the same total and VAT (got ${JSON.stringify(got.t)})`);
    ok(!/keuze|choice/i.test(got.msg), `every choice answered — no missing-choice message (got "${got.msg}")`);
    // focus after Toevoegen lands on the dish's new control, not on <body> (the re-render replaced the +)
    await page.locator(`.item[data-id="${asked.id}"] .ctl button`).last().click(); await pick(asked);
    await page.waitForTimeout(100);
    const focused = await page.evaluate(id => { const a = document.activeElement; return a && a.closest('.item') ? a.closest('.item').dataset.id : a && a.tagName; }, asked.id);
    ok(focused === asked.id, `after Toevoegen the focus is back on the dish's control (got ${focused})`);
    await page.close();

    // the gate's two HOLDs (PR #25): the sheet must not overflow its own box, and sauce names must not break mid-word
    for (const vp of [{ width: 375, height: 667 }, { width: 390, height: 844 }, { width: 1366, height: 900 }]) {
      const p2 = await browser.newPage({ viewport: vp }); await p2.goto(URL); await p2.waitForTimeout(400);
      await p2.locator(`.item[data-id="${fries.id}"] .ctl button`).first().click(); await p2.waitForTimeout(300);
      const m2 = await p2.evaluate(() => { const box = document.querySelector('#pick .box');
        const broken = [...document.querySelectorAll('#pick-g .pg:not(.hid) label span')].filter(sp => sp.getClientRects().length > 1 && !/\s/.test(sp.textContent)).map(sp => sp.textContent);
        return { w: box.scrollWidth - box.clientWidth, h: box.scrollHeight - box.clientHeight, broken,
          okOn: (() => { const r = document.getElementById('pick-ok').getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.top >= 0; })() }; });
      ok(m2.w === 0, `${vp.width}: the sheet has no sideways overflow (got ${m2.w}px)`);
      ok(m2.broken.length === 0, `${vp.width}: no single-word answer breaks across lines (got ${JSON.stringify(m2.broken)})`);
      ok(m2.okOn, `${vp.width}: Toevoegen is on screen as soon as the sheet opens`);
      await p2.locator('#pick-x').click(); await p2.waitForTimeout(100);
      // a double-tap on + opens the sheet and leaves it open, untouched (the second tap lands on the open sheet)
      const plus = p2.locator(`.item[data-id="${fries.id}"] .ctl button`).first(); await plus.scrollIntoViewIfNeeded();
      const bb = await plus.boundingBox(); await p2.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await p2.waitForTimeout(90); await p2.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await p2.waitForTimeout(300);
      const dt = await p2.evaluate(() => ({ on: document.getElementById('pick').classList.contains('on'), picked: [...document.querySelectorAll('#pick-g input:checked')].map(i => i.value).join(), lines: document.querySelectorAll('.line').length }));
      ok(dt.on && dt.picked === ',' && dt.lines === 0, `${vp.width}: a double-tap on + leaves the sheet open with nothing chosen and nothing added (got ${JSON.stringify(dt)})`);
      await p2.close();
    }
  } catch (e) { fails.push('crashed: ' + e.message); }
  finally { await browser.close(); }
  ok(errors.length === 0, 'no console or page errors: ' + errors.join(' | '));
  console.log(fails.length ? `tests/bestellen-real-menu.test.js: FAIL ${fails.length}/${n}\n  - ` + fails.join('\n  - ') : `tests/bestellen-real-menu.test.js: ${n} checks passed`);
  process.exit(fails.length ? 1 : 0);
})();
