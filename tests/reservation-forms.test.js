// node tests/reservation-forms.test.js — the six booking forms on the home page.
//
// The case that matters is `notactivated`: FormSubmit answers 200 with {"success":"false"} when the
// destination address was never activated, or when a rate limit or spam block trips. The handler
// used to check only the HTTP status, so the guest was told "Bedankt voor uw aanvraag" while the
// café received nothing — a lost booking that looks to everybody like a made one. Nothing in the
// network tab, nothing in the console, a green message on the screen.
//
// No request leaves this machine: every call to formsubmit.co is intercepted.
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { try { ({ chromium } = require('/home/fullylucid/.npm-global/lib/node_modules/playwright')); }
  catch (e2) { console.log('tests/reservation-forms.test.js: SKIP — playwright not installed'); process.exit(0); } }
const path = require('path');
const URL = 'file://' + path.resolve('index.html');

let n = 0; const fails = [];
const ok = (c, m) => { n++; if (!c) fails.push(m); };
const REPLY = {
  ok:           { status: 200, body: { success: 'true',  message: 'sent' } },
  notactivated: { status: 200, body: { success: 'false', message: 'Please activate your email address' } },
  http500:      { status: 500, body: { error: 'boom' } },
};

async function submit(browser, service, mode) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const seen = [];
  await page.route('**://formsubmit.co/**', r => {
    seen.push({ url: r.request().url(), body: r.request().postData() });
    const rep = REPLY[mode];
    return r.fulfill({ status: rep.status, contentType: 'application/json', body: JSON.stringify(rep.body) });
  });
  await page.goto(URL); await page.waitForTimeout(500);
  const filled = await page.evaluate(svc => {
    const f = document.querySelector(`form.res-form[data-service="${svc}"]`);
    if (!f) return null;
    f.querySelectorAll('input,textarea,select').forEach(e => {
      if (e.name === '_honey' || e.type === 'hidden' || e.type === 'submit') return;
      if (e.type === 'checkbox') { e.checked = true; }
      else if (e.type === 'date') e.value = '2026-12-24';
      else if (e.type === 'time') e.value = '18:30';
      else if (e.type === 'email') e.value = 'qa@example.invalid';
      else if (e.type === 'number') e.value = '2';
      else if (e.tagName === 'SELECT') e.selectedIndex = Math.min(1, e.options.length - 1);
      else e.value = 'QA';
      e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true }));
    });
    f.querySelector('[type=submit],button')?.click();
    return true;
  }, service);
  await page.waitForTimeout(900);
  const msg = await page.evaluate(svc => {
    const nd = document.querySelector(`form.res-form[data-service="${svc}"] .form-status`);
    return nd ? nd.textContent.trim() : null; }, service);
  await page.close();
  return { filled, msg, seen };
}

(async () => {
  const browser = await chromium.launch();
  const services = await (async () => {
    const p = await browser.newPage(); await p.goto(URL); await p.waitForTimeout(400);
    const s = await p.evaluate(() => [...document.querySelectorAll('form.res-form')].map(f => f.dataset.service));
    await p.close(); return s; })();

  ok(services.length >= 5, `the home page carries its booking forms (found ${services.length}: ${services})`);
  ok(services.includes('table'), 'the table reservation form is present');

  for (const svc of services) {
    const good = await submit(browser, svc, 'ok');
    ok(good.seen.length === 1, `${svc}: submitting sends exactly one request (sent ${good.seen.length})`);
    ok(/reservationsoke/.test(good.seen[0]?.url || ''), `${svc}: it goes to the café's own address`);
    ok(/Bedankt|Thank|Danke/i.test(good.msg || ''), `${svc}: a real success is confirmed to the guest (got ${JSON.stringify(good.msg)})`);

    // THE one that regressed
    const soft = await submit(browser, svc, 'notactivated');
    ok(/mis|wrong|schief/i.test(soft.msg || ''),
      `${svc}: a 200 carrying success:"false" must NOT be shown as a booking — got ${JSON.stringify(soft.msg)}`);

    const hard = await submit(browser, svc, 'http500');
    ok(/mis|wrong|schief/i.test(hard.msg || ''), `${svc}: a 500 is reported to the guest (got ${JSON.stringify(hard.msg)})`);
  }

  // the honeypot must still silence a bot without telling it why
  const p = await browser.newPage(); const trapped = [];
  await p.route('**://formsubmit.co/**', r => { trapped.push(1); return r.fulfill({ status: 200, body: '{}' }); });
  await p.goto(URL); await p.waitForTimeout(400);
  await p.evaluate(() => { const f = document.querySelector('form.res-form[data-service="table"]');
    f.querySelector('input[name="_honey"]').value = 'bot';
    f.querySelector('[type=submit],button')?.click(); });
  await p.waitForTimeout(600);
  ok(trapped.length === 0, `the honeypot stops a filled trap from sending (sent ${trapped.length})`);
  await p.close();

  await browser.close();
  if (fails.length) { console.error(`tests/reservation-forms.test.js: ${fails.length} of ${n} checks FAILED`);
    fails.forEach(f => console.error('  - ' + f)); process.exit(1); }
  console.log(`tests/reservation-forms.test.js: ${n} checks passed`);
})();
