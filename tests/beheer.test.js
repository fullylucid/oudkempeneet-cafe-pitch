// node tests/beheer.test.js — the menu manager sandbox. Run from repo root.
//
// What this pins, beyond "it renders": the two conditions the gate attached to priced options
// (merritt-studio #76) — the manager must SHOW the inherited VAT rate where a price is set, and a
// priced option must raise the client-signature warning — and the bug that a field edit must not
// rebuild the list, which silently swallowed prep_minutes on the way to the payload.
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) {
  try { ({ chromium } = require('/home/fullylucid/.npm-global/lib/node_modules/playwright')); }
  catch (e2) { console.log('tests/beheer.test.js: SKIP — playwright not installed (npm i -g playwright)'); process.exit(0); }
}
const path = require('path');
const URL = 'file://' + path.resolve('beheer/site/index.html');
let n = 0; const fails = [];
const ok = (c, m) => { n++; if (!c) fails.push(m); };
const ops = page => page.evaluate(() => { document.getElementById('save').click();
  const t = document.getElementById('payload').textContent;
  document.getElementById('modal').classList.remove('on'); return JSON.parse(t || '[]'); });

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const fresh = async (vp) => { const p = await browser.newPage({ viewport: vp || { width: 1280, height: 900 }, hasTouch: !!(vp && vp.width < 800) });
    p.on('pageerror', e => errors.push(String(e)));
    await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(350); return p; };

  { // the whole menu is there, and the café's own category names are used
    const p = await fresh();
    const m = await p.evaluate(() => ({ rows: document.querySelectorAll('.row').length,
      cats: [...document.querySelectorAll('.cats button')].map(b => b.textContent),
      sandbox: document.querySelector('.sandbox').textContent }));
    ok(m.rows === 110, `all 110 dishes are listed (got ${m.rows})`);
    ok(m.cats[0] === 'Alles' && m.cats.includes('Voorgerechten'), `categories come from the café's own menu (got ${m.cats.slice(0,3)})`);
    ok(/niets opgeslagen/i.test(m.sandbox), 'the page says plainly that nothing is saved');
    await p.close();
  }

  { // sold out is ONE interaction from the list — the thing the owner does most
    const p = await fresh();
    await p.locator('.row[data-id="m-indo-3"] .so input').check(); await p.waitForTimeout(200);
    const cls = await p.evaluate(() => document.querySelector('.row[data-id="m-indo-3"]').className);
    ok(/soldout/.test(cls), 'marking sold out is one tap and shows on the row');
    const o = await ops(p);
    // Sold-out writes sold_out_at and MUST NOT touch `orderable` — that column already means
    // "never orderable online" and is correct for the fondue and the two draught beers. Writing
    // one field while displaying two would have been a fix in appearance only (gate, PR #11).
    ok(o.length === 1 && o[0].op === 'update' && typeof o[0].fields.sold_out_at === 'string',
      `sold out is a timestamp on its own field (got ${JSON.stringify(o)})`);
    ok(!('orderable' in o[0].fields), 'the daily toggle never writes `orderable`');
    await p.locator('.row[data-id="m-indo-3"] .so input').uncheck(); await p.waitForTimeout(200);
    const o2 = await ops(p);
    ok(o2.length === 1 && o2[0].fields.sold_out_at === null, `un-marking nulls the timestamp rather than deleting the fact (got ${JSON.stringify(o2)})`);
    await p.close();
  }

  { // editing a field must NOT rebuild the list underneath the owner
    const p = await fresh();
    await p.locator('.row[data-id="m-main-1"] [data-act=edit]').click(); await p.waitForTimeout(200);
    await p.fill('.row[data-id="m-main-1"] [data-f=price]', '24,50');
    await p.locator('.row[data-id="m-main-1"] [data-f=price]').press('Tab'); await p.waitForTimeout(200);
    const stillOpen = await p.evaluate(() => !document.querySelector('.row[data-id="m-main-1"] .edit').hidden);
    ok(stillOpen, 'the editor stays open while you type in it');
    await p.fill('.row[data-id="m-main-1"] [data-f=prep]', '22');
    await p.locator('.row[data-id="m-main-1"] [data-f=prep]').press('Tab'); await p.waitForTimeout(200);
    const summary = await p.evaluate(() => document.querySelector('.row[data-id="m-main-1"] .pr').textContent);
    ok(summary === '€ 24,50', `the summary row follows the edit (got ${summary})`);
    const o = await ops(p);
    const up = o.find(x => x.op === 'update' && x.id === 'm-main-1');
    ok(up && up.fields.price_cents === 2450 && up.fields.prep_minutes === 22,
      `both edits reach the payload — the second one used to be lost (got ${JSON.stringify(up)})`);
    await p.close();
  }

  { // the gate's two conditions on priced options
    const p = await fresh();
    await p.locator('.row[data-id="m-main-1"] [data-act=edit]').click(); await p.waitForTimeout(250);
    const inh = await p.locator('.row[data-id="m-main-1"] .grp .opt .inh').first().textContent();
    ok(/btw 9%/.test(inh) && /zelfde als het gerecht/.test(inh),
      `the inherited VAT rate is shown where the price is set (got "${inh}")`);
    const warnBefore = await p.evaluate(() => document.querySelector('.row[data-id="m-main-1"] [data-optwarn]').hidden);
    ok(warnBefore, 'no signature warning while every option is free');
    const opt = p.locator('.row[data-id="m-main-1"] .grp .opt').first();
    await opt.locator('input').fill('3,50'); await opt.locator('input').press('Tab'); await p.waitForTimeout(250);
    const after = await p.evaluate(() => ({ hidden: document.querySelector('.row[data-id="m-main-1"] [data-optwarn]').hidden,
      text: document.querySelector('.row[data-id="m-main-1"] [data-optwarn]').textContent }));
    ok(!after.hidden && /ondertekenen/.test(after.text), 'pricing an option raises the client-signature warning');
    const o = await ops(p);
    const op = o.find(x => x.op === 'option_price');
    ok(op && op.price_cents === 350 && op.group_id === 'bakwijze',
      `a priced option is its own operation, not a blob rewrite (got ${JSON.stringify(op)})`);
    ok(!('vat_rate' in (op || {})), 'the option carries no VAT rate of its own — it inherits');
    await p.close();
  }

  { // "sold out today" and "never orderable online" are different facts and must not share a control
    const p = await fresh();
    const m = await p.evaluate(() => ['m-main-0', 'd-beer-0', 'm-main-1'].map(id => {
      const r = document.querySelector(`.row[data-id="${id}"]`);
      return { id, locked: !!r.querySelector('.locked'), text: (r.querySelector('.locked') || {}).textContent || null, toggle: !!r.querySelector('.so input') }; }));
    const fondue = m[0], tap = m[1], steak = m[2];
    ok(fondue.locked && !fondue.toggle && /reserveren/.test(fondue.text),
      `the fondue reads as reservation-only, not as sold out (got ${JSON.stringify(fondue)})`);
    ok(tap.locked && !tap.toggle && /bar/.test(tap.text), `draught beer reads as bar-only (got ${JSON.stringify(tap)})`);
    ok(steak.toggle && !steak.locked, 'an ordinary dish keeps its daily sold-out toggle');
    await p.locator('.row[data-id="m-main-0"] [data-act=edit]').click(); await p.waitForTimeout(200);
    const why = await p.evaluate(() => document.querySelector('.row[data-id="m-main-0"] .stub').textContent);
    ok(/1 dag van tevoren/.test(why), `and the editor explains why rather than offering a switch (got "${why.slice(0,60)}")`);
    await p.close();
  }

  { // photos: honest about being switched off rather than a broken upload button
    const p = await fresh();
    await p.locator('.row[data-id="m-main-1"] [data-act=edit]').click(); await p.waitForTimeout(200);
    const stub = await p.evaluate(() => { const s = document.querySelector('.row[data-id="m-main-1"] .stub'); return s ? s.textContent : ''; });
    ok(/R2/.test(stub) && /uit/.test(stub), `the photo field says why it is not there yet (got "${stub.slice(0, 80)}")`);
    ok(await p.evaluate(() => !document.querySelector('.stub input[type=file]')), 'no upload control that would fail if pressed');
    await p.close();
  }

  { // reorder: arrows and drag are two doors onto the same operation
    const p = await fresh();
    const before = await p.evaluate(() => [...document.querySelectorAll('.rows[data-cat=main] .row')].map(r => r.dataset.id));
    await p.locator(`.row[data-id="${before[1]}"] [data-mv="-1"]`).click(); await p.waitForTimeout(250);
    const after = await p.evaluate(() => [...document.querySelectorAll('.rows[data-cat=main] .row')].map(r => r.dataset.id));
    ok(after[0] === before[1] && after[1] === before[0], `the up arrow moves a dish (got ${after.slice(0,2)})`);
    const o = await ops(p);
    const re = o.find(x => x.op === 'reorder');
    ok(re && re.cat === 'main' && re.ids[0] === before[1], 'reordering sends the whole category order, not a swap');
    ok(await p.evaluate(() => !!document.querySelector('.grip')), 'a drag handle exists as well as the arrows');
    await p.close();
  }

  { // a new dish, and remove keeps history
    const p = await fresh();
    await p.evaluate(() => { document.querySelector('.cats button[data-cat=beer]').click(); });
    await p.waitForTimeout(200);
    await p.locator('#add').click(); await p.waitForTimeout(300);
    const o1 = await ops(p);
    const created = o1.find(x => x.op === 'create');
    ok(created && created.item.cat === 'beer' && created.item.vat_rate === 21 && created.item.kind === 'drink',
      `a new dish in a beer category defaults to 21% and kind drink (got ${JSON.stringify(created && created.item && {cat:created.item.cat,vat:created.item.vat_rate,kind:created.item.kind})})`);
    await p.close();
    const q = await fresh();
    await q.locator('.row[data-id="m-start-1"] [data-act=edit]').click(); await q.waitForTimeout(200);
    await q.locator('.row[data-id="m-start-1"] [data-act=rm]').click(); await q.waitForTimeout(250);
    const o2 = await ops(q);
    ok(o2.length === 1 && o2[0].op === 'archive', `removing archives rather than deletes (got ${JSON.stringify(o2)})`);
    ok(await q.evaluate(() => !document.querySelector('.row[data-id="m-start-1"]')), 'and it leaves the list');
    await q.close();
  }

  { // the draft survives a reload, and reset clears it
    const p = await fresh();
    await p.locator('.row[data-id="m-indo-3"] .so input').check(); await p.waitForTimeout(200);
    await p.reload(); await p.waitForTimeout(400);
    ok(await p.evaluate(() => document.querySelector('.row[data-id="m-indo-3"] .so input').checked),
      'an unsaved change survives a reload — a tablet that sleeps must not lose the work');
    await p.locator('#reset').click(); await p.waitForTimeout(250);
    const o = await ops(p);
    ok(o.length === 0 && await p.evaluate(() => document.getElementById('count').textContent === 'Geen wijzigingen'),
      'reset puts the menu back as it stands');
    await p.close();
  }

  { // search and filter
    const p = await fresh();
    await p.fill('#q', 'sajoer'); await p.waitForTimeout(250);
    const hits = await p.evaluate(() => [...document.querySelectorAll('.row .nm')].map(e => e.textContent.trim()));
    // search covers descriptions too, so the two Goreng Schotels match on "sajoer lodeh" in their
    // own text — useful ("find everything with kaas"), and worth pinning so it is not lost by accident
    ok(hits.length === 3 && hits.includes('Sajoer Lodeh') && hits.includes('Nasi Goreng Schotel'),
      `search matches names AND descriptions (got ${hits.length}: ${hits})`);
    await p.fill('#q', ''); await p.waitForTimeout(200);
    await p.locator('.cats button[data-cat=indo]').click(); await p.waitForTimeout(250);
    ok(await p.evaluate(() => document.querySelectorAll('.rows').length === 1), 'a category filter shows one group');
    await p.close();
  }

  { // it has to work on the tablet it will live on
    for (const vp of [{ width: 1280, height: 900 }, { width: 834, height: 1112 }, { width: 390, height: 844 }]) {
      const p = await fresh(vp);
      await p.locator('.row[data-id="m-main-1"] [data-act=edit]').click(); await p.waitForTimeout(250);
      const m = await p.evaluate(() => ({ docW: document.documentElement.scrollWidth, winW: innerWidth,
        soBox: document.querySelector('.row .so').getBoundingClientRect().height }));
      ok(m.docW <= m.winW, `${vp.width}: the page must not scroll sideways (${m.docW} in ${m.winW})`);
      ok(m.soBox >= 40, `${vp.width}: the sold-out control is a thumb-sized target (${Math.round(m.soBox)}px)`);
      await p.close();
    }
  }

  ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
  await browser.close();
  if (fails.length) { console.error('tests/beheer.test.js: ' + fails.length + ' of ' + n + ' checks FAILED');
    fails.forEach(f => console.error('  - ' + f)); process.exit(1); }
  console.log('tests/beheer.test.js: ' + n + ' checks passed');
})();
