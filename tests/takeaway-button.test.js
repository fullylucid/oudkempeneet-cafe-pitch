// node tests/takeaway-button.test.js — the home page's takeaway button and the Coming Soon page.
//
// The button has ONE switch: body[data-takeaway] = soon | new | live. That attribute is what
// somebody will flip months from now when ordering opens, so the thing worth pinning is that all
// three states render correctly and that the href never has to change with them — bestellen.html
// is the Coming Soon page today and, per Q28, the redirect to the ordering subdomain later.
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) {
  try { ({ chromium } = require('/home/user/.npm-global/lib/node_modules/playwright')); }
  catch (e2) { console.log('tests/takeaway-button.test.js: SKIP — playwright not installed (npm i -g playwright)'); process.exit(0); }
}
const path = require('path');
const HOME = 'file://' + path.resolve('index.html');
const SOON = 'file://' + path.resolve('bestellen.html');

let n = 0; const fails = [];
const ok = (c, m) => { n++; if (!c) fails.push(m); };

(async () => {
  const browser = await chromium.launch();
  const errors = [];

  // ---- the three states, on a laptop and on a phone ----
  const EXPECT = { soon: { soon: true, flag: false }, new: { soon: false, flag: true }, live: { soon: false, flag: false } };
  for (const state of ['soon', 'new', 'live']) {
    for (const vp of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport: vp, hasTouch: vp.width < 800 });
      page.on('pageerror', e => errors.push(state + '/' + vp.width + ': ' + e));
      await page.goto(HOME); await page.waitForTimeout(400);
      if (state !== 'soon') await page.evaluate(s => document.body.dataset.takeaway = s, state);
      await page.waitForTimeout(150);
      const m = await page.evaluate(() => {
        const a = document.querySelector('.hero-cta .ta'); if (!a) return null;
        const r = a.getBoundingClientRect(), vis = el => !!el && getComputedStyle(el).display !== 'none';
        return { href: a.getAttribute('href'), text: a.innerText.replace(/\s+/g, ' ').trim(),
          onScreen: r.top >= 0 && r.bottom <= innerHeight && r.width > 0,
          soon: vis(a.querySelector('.ta-soon')), flag: vis(a.querySelector('.ta-flag')),
          docW: document.documentElement.scrollWidth, winW: innerWidth };
      });
      if (!m) { ok(false, `${state}/${vp.width}: no takeaway button in the hero`); await page.close(); continue; }
      ok(m.href === 'bestellen.html', `${state}/${vp.width}: the href is bestellen.html in every state (got ${m.href})`);
      ok(m.onScreen, `${state}/${vp.width}: the button is visible without scrolling — that is the whole request`);
      ok(m.soon === EXPECT[state].soon && m.flag === EXPECT[state].flag,
        `${state}/${vp.width}: shows the right trailing span (got soon=${m.soon} flag=${m.flag}, text "${m.text}")`);
      ok(m.docW <= m.winW, `${state}/${vp.width}: the button must not widen the page (${m.docW} in ${m.winW})`);
      await page.close();
    }
  }

  // ---- the state attribute is the ONLY thing that decides it ----
  {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    page.on('pageerror', e => errors.push('default: ' + e));
    await page.goto(HOME); await page.waitForTimeout(400);
    const start = await page.evaluate(() => document.body.dataset.takeaway);
    ok(start === 'soon', `the page ships in the "soon" state (got ${start})`);
    const nav = await page.evaluate(() => { const a = document.querySelector('.nav-links a[href="bestellen.html"]');
      return a ? a.textContent.trim() : null; });
    ok(nav === 'Afhalen', `the nav carries a takeaway link too (got ${nav})`);
    if (!await page.$('.hero-cta .ta')) { ok(false, 'no takeaway button in the hero — the language checks cannot run'); await page.close(); }
    else {
    // all three languages label it
    const labels = {};
    for (const l of ['nl', 'en', 'de']) {
      await page.locator(`.lang button[data-lang="${l}"]`).click(); await page.waitForTimeout(200);
      labels[l] = await page.evaluate(() => document.querySelector('.hero-cta .ta').innerText.replace(/\s+/g, ' ').trim());
    }
    ok(/AFHALEN/i.test(labels.nl) && /TAKEAWAY/i.test(labels.en) && /ABHOLEN/i.test(labels.de),
      'the button is translated in all three languages (got ' + JSON.stringify(labels) + ')');
    ok(/binnenkort/i.test(labels.nl) && /coming soon/i.test(labels.en) && /demn/i.test(labels.de),
      'so is the "coming soon" suffix (got ' + JSON.stringify(labels) + ')');
    await page.close();
    }
  }

  // ---- the Coming Soon page ----
  if (!require('fs').existsSync(path.resolve('bestellen.html'))) ok(false, 'bestellen.html does not exist — the button has nowhere to land');
  else for (const vp of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport: vp, hasTouch: vp.width < 800 });
    page.on('pageerror', e => errors.push('soon-page/' + vp.width + ': ' + e));
    await page.goto(SOON); await page.waitForTimeout(400);
    const m = await page.evaluate(() => ({ h1: document.querySelector('h1').textContent.trim(),
      tel: document.querySelector('.tel') && document.querySelector('.tel').getAttribute('href'),
      hours: document.querySelector('.hrs').textContent,
      back: !!document.querySelector('a[href="index.html"]'), menu: !!document.querySelector('a[href="menu.html"]'),
      noindex: !!document.querySelector('meta[name="robots"][content*="noindex"]'),
      docW: document.documentElement.scrollWidth, winW: innerWidth }));
    ok(m.docW <= m.winW, `soon page ${vp.width}: no sideways scroll (${m.docW} in ${m.winW})`);
    ok(m.tel === 'tel:+31627894034', `soon page ${vp.width}: the café's number is callable, so "coming soon" still takes an order (got ${m.tel})`);
    ok(/15:00 – 21:00/.test(m.hours) && /12:30 – 21:00/.test(m.hours),
      `soon page ${vp.width}: the hours match the site's own (got "${m.hours}")`);
    ok(m.back && m.menu, `soon page ${vp.width}: a way back home and to the menu`);
    ok(m.noindex, `soon page ${vp.width}: a placeholder must not be indexed`);
    // and it speaks all three languages
    const heads = { nl: m.h1 };
    for (const l of ['en', 'de']) {
      await page.locator(`.lang button[data-lang="${l}"]`).click(); await page.waitForTimeout(200);
      heads[l] = await page.evaluate(() => document.querySelector('h1').textContent.trim());
    }
    ok(heads.nl === 'Binnenkort' && heads.en === 'Coming soon' && heads.de === 'Demnächst',
      `soon page ${vp.width}: translated headline (got ${JSON.stringify(heads)})`);
    const htmlLang = await page.evaluate(() => document.documentElement.lang);
    ok(htmlLang === 'de', `soon page ${vp.width}: html lang follows the switch (got ${htmlLang})`);
    await page.close();
  }

  ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
  await browser.close();

  if (fails.length) { console.error('tests/takeaway-button.test.js: ' + fails.length + ' of ' + n + ' checks FAILED');
    fails.forEach(f => console.error('  - ' + f)); process.exit(1); }
  console.log('tests/takeaway-button.test.js: ' + n + ' checks passed');
})();
