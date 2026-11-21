// node tests/www-hours.test.js — the home page shows the hours the café set in its back office.
//
// The page asks the ordering Worker (GET /api/hours) and repaints its hours list and its open/closed
// badge. What must hold: (1) with no answer the page shows exactly what it always showed; (2) a
// closed day and other hours land on the right weekday line; (3) a staff note is shown as TEXT —
// it is free text typed in /beheer and served to any origin; (4) an answer for another date is
// ignored. No request leaves this machine: the hours URL is intercepted.
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { try { ({ chromium } = require(require('path').join(require('os').homedir(), '.npm-global/lib/node_modules/playwright'))); }
  catch (e2) { console.log('tests/www-hours.test.js: SKIP — playwright not installed'); process.exit(0); } }
const path = require('path');
const URL = 'file://' + path.resolve('index.html');
let n = 0; const fails = [];
const ok = (c, m) => { n++; if (!c) fails.push(m); };
const ams = d => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(d);
const add = (ymd, k) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };
const wdOf = ymd => new Date(ymd + 'T12:00:00Z').getUTCDay();
const usual = wd => (wd >= 1 && wd <= 4) ? '15:00' : '12:30';
function answer(today, patch) {
  const days = []; for (let i = 0; i < 14; i++) { const d = add(today, i), wd = wdOf(d); days.push({ date: d, wd, closed: false, open: usual(wd), close: '21:00', exception: false, note: null }); }
  patch(days); return { tz: 'Europe/Amsterdam', today, days };
}
const list = page => page.$$eval('#hours-list li', ls => ls.map(li => ({ wd: +li.dataset.day, h: li.querySelector('.h').textContent, closed: li.classList.contains('closed'), note: li.querySelector('.n') ? li.querySelector('.n').textContent : '', html: li.querySelector('.n') ? li.querySelector('.n').innerHTML : '', kids: li.querySelectorAll('.n *').length })));
async function open(browser, reply) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }); let asked = 0;
  await page.route('**://bestellen.oudkempeneetcafe.nl/api/hours', r => { asked++; return reply === null ? r.abort() : r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(reply) }); });
  await page.goto(URL); await page.waitForTimeout(700);
  return { page, asked: () => asked };
}
(async () => {
  const browser = await chromium.launch(), today = ams(new Date()), STATIC = { 1: '15:00 – 21:00', 2: '15:00 – 21:00', 3: '15:00 – 21:00', 4: '15:00 – 21:00', 5: '12:30 – 21:00', 6: '12:30 – 21:00', 0: '12:30 – 21:00' };

  // 1. the Worker is unreachable: the page is the page it always was
  let t = await open(browser, null), rows = await list(t.page);
  ok(t.asked() === 1, 'the page asks for the hours once on load');
  ok(rows.length === 7 && rows.every(r => r.h === STATIC[r.wd] && !r.closed && !r.note), 'no answer: the seven lines show the built-in hours, nothing closed, no note');
  ok(await t.page.$eval('#oc-fig', e => /^fig (open|shut)$/.test(e.className)), 'no answer: the open/closed badge still works');
  await t.page.close();

  // 2. the usual week from the Worker: identical to the built-in list
  t = await open(browser, answer(today, () => {})); rows = await list(t.page);
  ok(rows.every(r => r.h === STATIC[r.wd] && !r.closed && !r.note), 'an unchanged week from the Worker paints the same list');
  await t.page.close();

  // 3. tomorrow closed with a note carrying markup; the day after has other hours
  const d1 = add(today, 1), d2 = add(today, 2), EVIL = 'Gesloten <img src=x onerror="window.__pwn=1"><b>wegens</b> vakantie';
  t = await open(browser, answer(today, days => { Object.assign(days[1], { closed: true, open: null, close: null, exception: true, note: { nl: EVIL, en: 'Closed for holidays', de: '' } }); Object.assign(days[2], { open: '12:00', close: '17:00', exception: true }); }));
  rows = await list(t.page); const r1 = rows.find(r => r.wd === wdOf(d1)), r2 = rows.find(r => r.wd === wdOf(d2));
  ok(r1.closed && r1.h === 'Gesloten', 'the closed date shows "Gesloten" on its own weekday line');
  ok(r1.note === EVIL && r1.kids === 0 && !/<img|<b>/.test(r1.html), 'its note is shown character for character, as text: no element was created from it');
  ok(await t.page.evaluate(() => window.__pwn === undefined), 'and nothing in the note ran');
  ok(r2.h === '12:00 – 17:00' && !r2.closed, 'other hours land on their weekday line');
  ok(rows.filter(r => r !== r1 && r !== r2).every(r => r.h === STATIC[r.wd] && !r.closed && !r.note), 'the other five lines are untouched');
  await t.page.evaluate(() => document.querySelector('[data-lang="en"],[data-set-lang="en"]') && document.querySelector('[data-lang="en"],[data-set-lang="en"]').click()); await t.page.waitForTimeout(300);
  if (await t.page.evaluate(() => document.documentElement.lang === 'en')) { rows = await list(t.page); const e1 = rows.find(r => r.wd === wdOf(d1)); ok(e1.h === 'Closed' && e1.note === 'Closed for holidays', 'in English: "Closed" and the English note'); }
  await t.page.close();

  // 4. today closed: the badge says so whatever the clock says
  t = await open(browser, answer(today, days => Object.assign(days[0], { closed: true, open: null, close: null, exception: true })));
  ok(await t.page.$eval('#oc-fig', e => e.className === 'fig shut' && e.textContent === 'Gesloten'), 'today closed in the calendar: the badge reads "Gesloten"');
  await t.page.close();

  // 5. an answer dated another day is not today's truth
  t = await open(browser, answer(add(today, -1), days => days.forEach(d => Object.assign(d, { closed: true, open: null, close: null })))); rows = await list(t.page);
  ok(rows.every(r => r.h === STATIC[r.wd] && !r.closed), 'an answer for yesterday is ignored: built-in hours stay');
  await t.page.close();

  // 6. a malformed answer changes nothing
  t = await open(browser, { days: 'soon' }); rows = await list(t.page);
  ok(rows.every(r => r.h === STATIC[r.wd] && !r.closed), 'a malformed answer is ignored');
  await t.page.close();

  await browser.close();
  console.log(fails.length ? 'tests/www-hours.test.js: FAIL\n  ' + fails.join('\n  ') : 'tests/www-hours.test.js: ' + n + ' checks passed');
  process.exit(fails.length ? 1 : 0);
})();
