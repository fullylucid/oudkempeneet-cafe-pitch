// node tests/preview-banner.test.js — "Voorbeeld — geen echte bestellingen, geen betaling" may only
// show where no order can be paid. From the opening on 2026-11-21 until this test existed, the live
// ordering page showed it above a checkout that took real money. The built page is served here under
// the café's hostname by request interception; no request leaves this machine.
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { try { ({ chromium } = require(require('path').join(require('os').homedir(), '.npm-global/lib/node_modules/playwright'))); }
  catch (e2) { console.log('tests/preview-banner.test.js: SKIP — playwright not installed'); process.exit(0); } }
const path = require('path'), fs = require('fs'), BUILT = 'ordering/site/index.html';
let n = 0; const fails = [];
const ok = (c, m) => { n++; if (!c) fails.push(m); };
const shown = p => p.evaluate(() => { const e = document.querySelector('.sandbox'); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; });
async function under(browser, host) {
  const p = await browser.newPage();
  await p.route('**/*', r => { const u = new URL(r.request().url()); return u.hostname === host && u.pathname === '/' ? r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(BUILT, 'utf8') }) : r.fulfill({ status: 404, body: '' }); });
  await p.goto('https://' + host + '/'); await p.waitForSelector('#state-t'); const v = await shown(p); await p.close(); return v;
}
(async () => {
  const browser = await chromium.launch();
  ok(await under(browser, 'bestellen.oudkempeneetcafe.nl') === false, 'on the café\'s own host the preview banner is NOT shown: orders there are real');
  ok(await under(browser, 'oudkempen-bestellen.dave-f36.workers.dev') === true, 'on the workers.dev name it is shown');
  ok(await under(browser, 'localhost') === true, 'on localhost it is shown');
  const p = await browser.newPage(); await p.goto('file://' + path.resolve(BUILT)); await p.waitForSelector('#state-t');
  ok(await shown(p) === true, 'from a file:// copy it is shown');
  ok(/<div class="sandbox" id="sb"[^>]*\shidden>/.test(fs.readFileSync(BUILT, 'utf8')), 'the banner is hidden in the markup, so a script failure cannot show it to a paying customer');
  await browser.close();
  console.log(fails.length ? 'tests/preview-banner.test.js: FAIL\n  ' + fails.join('\n  ') : 'tests/preview-banner.test.js: ' + n + ' checks passed');
  process.exit(fails.length ? 1 : 0);
})();
