// node tests/admin.test.js — the back office's pure parts (/beheer, stage 1): the opening-hours
// engine with the café's own schedule, what the hours forms accept, and the login's building blocks.
// What needs a Worker runtime (D1, cookies, the mail binding) is run against `wrangler dev --local`
// before a deploy (DEPLOY.md, "Back office").
const fs = require('fs');
let n = 0; const fails = [];
const ok = (c, m) => { n++; if (!c) fails.push(m); };
(async () => {
  const hours = await import('../ordering/worker/src/hours.js');
  const admin = await import('../ordering/worker/src/admin.js');
  const fondue = await import('../ordering/worker/src/fondue.js');
  const D = hours.DEFAULT_SCHED, at = s => new Date(s);   // November 2026: Amsterdam = UTC+1

  // ---- no schedule given = the hours the site has always shown
  ok(JSON.stringify(D.week.map(w => [w.open, w.close])) === JSON.stringify([[750, 1260], [900, 1260], [900, 1260], [900, 1260], [900, 1260], [750, 1260], [750, 1260]]), 'default week: Mon–Thu 15:00, Fri–Sun 12:30, close 21:00');
  ok(hours.orderingState(30, at('2026-11-16T16:00:00Z')).open && hours.orderingState(30, at('2026-11-16T16:00:00Z'), D).last === 1230, 'no schedule and the default schedule agree: Monday 17:00 open, last orders 20:30');
  ok(!hours.orderingState(30, at('2026-11-16T15:00:00Z'), D).open && hours.orderingState(30, at('2026-11-16T15:00:00Z'), D).at === 1020 && hours.ORDER_FROM_M === 1020, 'ordering starts at 17:00 (Dave, 2026-11-21): Monday 16:00 the café is open, ordering opens today at 17:00');
  ok(hours.dayHours(null, '2026-11-21').open === 750 && hours.dayHours(null, '2026-11-23').open === 900, 'Saturday 12:30, Monday 15:00');

  // ---- a calendar exception beats the weekly rule
  const S = { week: D.week, ex: { '2026-12-25': { closed: true, note: { nl: 'Kerst', en: '', de: '' } }, '2026-12-26': { closed: true }, '2026-12-24': { closed: false, open: 720, close: 1020 } } };
  ok(hours.dayHours(S, '2026-12-25').closed && hours.dayHours(S, '2026-12-25').exception && hours.dayHours(S, '2026-12-25').note.nl === 'Kerst', '25 Dec: closed, flagged as an exception, with its note');
  ok(hours.dayHours(S, '2026-12-24').open === 720 && hours.dayHours(S, '2026-12-24').close === 1020, '24 Dec: 12:00–17:00');
  const eve16 = hours.orderingState(30, at('2026-12-24T15:00:00Z'), S);
  ok(!eve16.open && eve16.date === '2026-12-27' && eve16.at === 1020, '24 Dec 16:00, café open 12:00–17:00: the day ends before ordering could start, so no ordering that day; next is Sunday the 27th at 17:00 (25th and 26th closed)');
  const L = { week: D.week, ex: { '2026-12-24': { closed: false, open: 720, close: 1140 } } }, eve18 = hours.orderingState(30, at('2026-12-24T17:00:00Z'), L);
  ok(eve18.open && eve18.last === 1110 && !hours.orderingState(30, at('2026-12-24T17:45:00Z'), L).open, 'a day closing at 19:00: ordering 17:00 to 18:30 (30 min before that day\'s own close)');
  const late = { week: D.week, ex: { '2026-12-24': { closed: false, open: 1080, close: 1260 } } };
  ok(!hours.orderingState(30, at('2026-12-24T16:30:00Z'), late).open && hours.orderingState(30, at('2026-12-24T16:30:00Z'), late).at === 1080, 'a day the café opens at 18:00: ordering starts at 18:00, the later of the two');
  const xmas = hours.orderingState(30, at('2026-12-25T15:00:00Z'), S);
  ok(!xmas.open && xmas.date === '2026-12-27', '25 Dec 16:00, normally open: closed by the calendar');
  ok(hours.orderingState(30, at('2026-12-26T22:00:00Z'), S).when === 'tomorrow', '26 Dec 23:00: opens tomorrow');

  // ---- a closed weekday in the rule
  const M = { week: D.week.map((w, i) => i === 1 ? { ...w, closed: true } : w), ex: {} };
  const sun = hours.orderingState(30, at('2026-11-22T20:30:00Z'), M);
  ok(!sun.open && sun.when === 'later' && sun.date === '2026-11-24', 'Sunday 21:30 with Mondays closed: next is Tuesday');
  ok(!hours.orderingState(30, at('2026-11-23T15:00:00Z'), M).open, 'Monday 16:00 with Mondays closed: closed');
  const never = hours.orderingState(30, at('2026-11-23T15:00:00Z'), { week: D.week.map(w => ({ ...w, closed: true })), ex: {} });
  ok(!never.open && never.at === null && never.date === null, 'no open day in sight: closed, with no promise of a time');
  const tiny = { week: D.week, ex: { '2026-11-23': { closed: false, open: 1200, close: 1220 } } };
  ok(!hours.orderingState(30, at('2026-11-23T19:05:00Z'), tiny).open && hours.orderingState(30, at('2026-11-23T10:00:00Z'), tiny).date === '2026-11-24', 'a day shorter than the last-orders margin never opens ordering and is not promised');

  // ---- clock helpers
  ok(hours.mins('15:00') === 900 && hours.mins('24:00') === 1440 && hours.mins('24:30') === null && hours.mins('9:00') === null && hours.mins('') === null && hours.mins('15:60') === null, 'mins(): HH:MM only, up to 24:00');
  ok(hours.validYmd('2026-12-25') && !hours.validYmd('2026-02-30') && !hours.validYmd('25-12-2026') && !hours.validYmd(20261225), 'validYmd(): real calendar dates only');
  ok(hours.addDays('2026-12-31', 1) === '2027-01-01' && hours.addDays('2027-03-28', 1) === '2027-03-29' && hours.wdOf('2026-11-23') === 1, 'addDays crosses a year and a clock change; wdOf');
  ok(hours.amsDate(at('2026-11-21T23:30:00Z')) === '2026-11-22', 'the calendar day is Amsterdam\'s, not UTC\'s');

  // ---- the weekly form
  const wk = () => ({ week: D.week.map(w => ({ closed: false, open: hours.hhmm(w.open), close: hours.hhmm(w.close) })) });
  ok(admin.validateWeek(wk()).ok && admin.validateWeek(wk()).week[1].open === 900, 'the default week round-trips');
  let w = wk(); w.week[2].open = '22:00'; ok(admin.validateWeek(w).error === 'times' && admin.validateWeek(w).wd === 2, 'open after close is refused, naming the day');
  w = wk(); w.week.pop(); ok(admin.validateWeek(w).error === 'week', 'six days are not a week');
  w = wk(); w.week.forEach(r => r.closed = true); ok(admin.validateWeek(w).error === 'all_closed', 'a week with no open day is refused (a holiday is a calendar range)');
  w = wk(); w.week[0].closed = 'yes'; ok(admin.validateWeek(w).week[0].closed === false, 'closed must be the boolean true');
  w = wk(); w.week[3].open = '<script>'; ok(admin.validateWeek(w).error === 'times', 'garbage in a time field is refused');
  ok(admin.validateWeek(null).error === 'week' && admin.validateWeek({ week: 'x' }).error === 'week', 'no body, wrong shape');

  // ---- the calendar form
  const T = '2026-11-21';
  let v = admin.validateDays({ from: '2026-12-21', to: '2027-01-03', mode: 'closed', note: { nl: '  Winter\n sluiting ', en: 5 } }, T);
  ok(v.ok && v.dates.length === 14 && v.dates[0] === '2026-12-21' && v.dates[13] === '2027-01-03' && v.note.nl === 'Winter sluiting' && v.note.en === '' && v.note.de === '', 'a range across New Year: 14 dates, note tidied, non-strings dropped');
  v = admin.validateDays({ from: '2026-12-24', mode: 'times', open: '12:00', close: '17:00' }, T); ok(v.ok && v.dates.length === 1 && v.open === 720 && v.close === 1020, 'one day with other hours');
  ok(admin.validateDays({ from: '2026-12-24', mode: 'times', open: '17:00', close: '12:00' }, T).error === 'times' && admin.validateDays({ from: '2026-12-24', mode: 'times' }, T).error === 'times', 'other hours need a real open < close');
  ok(admin.validateDays({ from: '2026-11-20', mode: 'closed' }, T).error === 'past', 'yesterday cannot be changed');
  v = admin.validateDays({ from: '2026-11-19', to: '2026-11-23', mode: 'closed' }, T); ok(v.ok && v.dates[0] === T && v.dates.length === 3, 'a range that started in the past only writes today onward');
  ok(admin.validateDays({ from: '2026-12-24', to: '2026-12-23', mode: 'closed' }, T).error === 'dates' && admin.validateDays({ from: '2026-02-30', mode: 'closed' }, T).error === 'dates', 'end before start, or no such date');
  ok(admin.validateDays({ from: '2026-12-01', to: '2027-06-01', mode: 'closed' }, T).error === 'range', 'more than three months at once is refused');
  ok(admin.validateDays({ from: '2030-01-01', mode: 'closed' }, T).error === 'dates', 'years ahead is refused');
  ok(admin.validateDays({ from: '2026-12-24', mode: 'open' }, T).error === 'mode' && admin.validateDays({ from: '2026-12-24' }, T).error === 'mode', 'only closed / times / normal');
  ok(admin.validateDays({ from: '2026-12-24', mode: 'normal' }, T).ok, 'back to normal');
  ok(admin.validateDays({ from: '2026-12-24', mode: 'closed', note: { nl: 'x'.repeat(500) } }, T).note.nl.length === 140, 'a note is cut at 140 characters');

  // ---- review of #35, point 6: the range starts at today, however long ago `from` was
  v = admin.validateDays({ from: '2020-01-01', to: '2026-11-22', mode: 'closed' }, T); ok(v.ok && v.dates.length === 2 && v.dates[0] === T, 'a range from 2020 to tomorrow writes two days, not "range too long"');

  // ---- review point 1: closing a date that holds a paid fondue reservation
  const RES = [{ date: '2026-12-10', time: '18:00', guests: 4, name: 'Jan', ref: 'K7MP' }, { date: '2026-12-12', time: '13:00', guests: 2, name: 'Els', ref: 'D5JT' }];
  const dv = b => admin.validateDays(b, T);
  ok(admin.hitBy(dv({ from: '2026-12-10', mode: 'closed' }), RES).map(r => r.ref).join() === 'K7MP', 'closing 10 Dec hits the reservation on it');
  ok(admin.hitBy(dv({ from: '2026-12-09', to: '2026-12-13', mode: 'closed' }), RES).length === 2, 'a range hits every reservation inside it');
  ok(admin.hitBy(dv({ from: '2026-12-11', mode: 'closed' }), RES).length === 0, 'closing a day without one hits none');
  ok(admin.hitBy(dv({ from: '2026-12-10', mode: 'times', open: '12:00', close: '17:00' }), RES).length === 1, 'new hours that end before the table\'s time hit it');
  ok(admin.hitBy(dv({ from: '2026-12-10', mode: 'times', open: '17:00', close: '23:00' }), RES).length === 0 && admin.hitBy(dv({ from: '2026-12-10', mode: 'times', open: '12:00', close: '18:00' }), RES).length === 1, 'new hours that still contain it do not; closing AT the table\'s time does');
  ok(admin.hitBy(dv({ from: '2026-12-10', mode: 'normal' }), RES).length === 0, 'going back to normal hours never warns');
  const srcA = fs.readFileSync('ordering/worker/src/admin.js', 'utf8');
  ok(/hit\.length && body\.confirm !== true\) return j\(\{ error: 'reservations'/.test(srcA), 'the save is refused with the guests named until staff confirm with the boolean true');

  // ---- review of #36: the weekly rule gets the same check, and a refunded reservation is not one
  const wkm = f => { const x = D.week.map(r => ({ ...r })); f(x); return x; };   // 10 Dec 2026 = Thursday (4), 12 Dec = Saturday (6)
  ok(admin.hitByWeek(D.week, RES, []).length === 0, 'the usual week breaks no reservation');
  ok(admin.hitByWeek(wkm(x => { x[4].closed = true; }), RES, []).map(r => r.ref).join() === 'K7MP', 'closing Thursdays hits the Thursday table');
  ok(admin.hitByWeek(wkm(x => { x[6].open = 900; }), RES, []).map(r => r.ref).join() === 'D5JT', 'Saturdays from 15:00 hits the 13:00 table');
  ok(admin.hitByWeek(wkm(x => { x[4].closed = true; }), RES, ['2026-12-10']).length === 0, 'a date with its own calendar entry is not governed by the week');
  ok(/hitByWeek\(v\.week, await paidFondue\(env, today\), exDates\)\.filter\(r => fineUnder\(cur, r\)\);\n  if \(hit\.length && body\.confirm !== true\) return j\(\{ error: 'reservations'/.test(srcA), 'saveWeek refuses with the guests named until staff confirm');
  const thuShut = { week: wkm(x => { x[4].closed = true; }), ex: {} };
  ok(admin.fineUnder(D, RES[0]) && !admin.fineUnder(thuShut, RES[0]) && admin.fineUnder(thuShut, RES[1]), 'fineUnder: a table is fine while its day is open at its time');
  ok(!admin.fineUnder({ week: D.week, ex: { '2026-12-10': { closed: false, open: 720, close: 1080 } } }, RES[0]), 'a table AT closing time is not inside the hours');
  ok(/hitBy\(v, await paidFondue\(env, amsDate\(\)\)\)\.filter\(r => fineUnder\(cur, r\)\)/.test(srcA), 'the calendar warns only for reservations the change newly breaks, like the week');
  ok(/o\.status='paid' and o\.msp_refund_cents<o\.total_cents/.test(srcA), 'a fully refunded fondue order is left out of the paid reservations');

  // ---- review point 2: role is enforced
  ok(admin.can({ role: 'owner' }, 'hours_week') && admin.can({ role: 'owner' }, 'anything_new'), 'an owner may do everything');
  ok(admin.can({ role: 'staff' }, 'hours_days') && !admin.can({ role: 'staff' }, 'hours_week') && !admin.can({ role: 'staff' }, 'anything_new'), 'staff: calendar days only; an action nobody listed is owner-only');
  ok(!admin.can(null, 'hours_days') && !admin.can({ role: 'nobody' }, 'hours_days') && !admin.can({}, 'hours_days'), 'no session, unknown role: nothing');
  ok(/can\(me, 'hours_week'\) \? saveWeek/.test(srcA) && /can\(me, 'hours_days'\) \? saveDays/.test(srcA), 'both write routes ask can() before they run');
  // ---- review point 4: log out everywhere
  ok(/\/beheer\/logout-all/.test(srcA) && /update staff_sessions set revoked_at=\? where email=\? and revoked_at is null/.test(srcA), 'logout-all revokes every live session of the address');
  // ---- review point 5: the ordering page reads the café's hours and prints a staff note as text
  const tpl = fs.readFileSync('ordering/bestellen.template.html', 'utf8'), built = fs.readFileSync('ordering/site/index.html', 'utf8');
  ok(/fetch\('\/api\/hours'/.test(tpl) && /fetch\('\/api\/hours'/.test(built), 'the ordering page asks /api/hours (template and built page)');
  ok(/t\.innerHTML=txt\.split\(' · '\)\.map\(function\(x\)\{ return '<span class="seg">'\+esc\(x\)/.test(tpl), 'the status line, which may carry a staff note, is escaped before it is set');
  ok(/Date\.now\(\)-HRS_AT>180000\) return null/.test(tpl), 'hours older than three minutes fall back to the built-in engine');

  // ---- fondue reservations follow the same calendar
  const base = { name: 'Jan', email: 'j@example.com', guests: 2, date: '2026-12-25', time: '18:00' }, now = at('2026-11-21T12:00:00Z');
  ok(fondue.validateFondue(base, now).ok, 'no schedule: 25 Dec 18:00 is a normal Friday');
  ok(fondue.validateFondue(base, now, S).error === 'date' && fondue.validateFondue(base, now, S).reason === 'closed', 'with the café\'s calendar: 25 Dec is closed, so no fondue is sold for it');
  ok(fondue.validateFondue({ ...base, date: '2026-12-24' }, now, S).error === 'time' && fondue.validateFondue({ ...base, date: '2026-12-24', time: '13:00' }, now, S).ok, '24 Dec closes at 17:00: 18:00 refused, 13:00 fine');
  ok(fondue.validateFondue({ ...base, date: '2026-11-30' }, now, M).error === 'date', 'a Monday when Mondays are closed');

  // ---- login building blocks
  const t1 = admin.newToken(), t2 = admin.newToken();
  ok(admin.TOKEN_RE.test(t1) && t1 !== t2, 'tokens: 32 random bytes as hex, never the same twice');
  ok(/^[0-9a-f]{64}$/.test(await admin.sha256(t1)) && await admin.sha256(t1) !== t1 && await admin.sha256('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'what is stored is the SHA-256, not the token');
  ok(admin.normEmail('  Dave@Example.COM ') === 'dave@example.com' && admin.normEmail('nope') === '' && admin.normEmail(null) === '' && admin.normEmail('a@b.c' + 'x'.repeat(200)) === '', 'addresses: trimmed, lower-cased, shaped, bounded');
  const req = (h, u) => new Request(u || 'https://bestellen.oudkempeneetcafe.nl/beheer/api/hours/week', { method: 'PUT', headers: h });
  ok(admin.sameOrigin(req({ origin: 'https://bestellen.oudkempeneetcafe.nl' })) && !admin.sameOrigin(req({ origin: 'https://www.oudkempeneetcafe.nl' })) && !admin.sameOrigin(req({})) && !admin.sameOrigin(req({ origin: 'null' })), 'a write must come from this origin: not from www, not without an Origin');
  ok(admin.readCookie(req({ cookie: 'a=1; __Secure-beheer=' + t1 + '; b=2' })) === t1 && admin.readCookie(req({ cookie: '__Secure-beheer=short' })) === '' && admin.readCookie(req({ cookie: 'x__Secure-beheer=' + t1 })) === '' && admin.readCookie(req({})) === '', 'the cookie is read by exact name and must be token-shaped');
  const mail = admin.linkMail({ CAFE_NAME: 'Oud-Kempen Eetcafé' }, 'https://bestellen.oudkempeneetcafe.nl/beheer/in/' + t1);
  ok(mail.includes('/beheer/in/' + t1) && /15 minuten/.test(mail) && /één keer/.test(mail), 'the mail carries the link and says it works once, for 15 minutes');

  // ---- the staff side can never be served around the Worker
  const toml = fs.readFileSync('ordering/worker/wrangler.toml', 'utf8'), rwf = /run_worker_first\s*=\s*\[([^\]]*)\]/.exec(toml)[1];
  ok(rwf.includes('"/beheer"') && rwf.includes('"/beheer/*"'), 'wrangler.toml: /beheer and /beheer/* always run the Worker first');
  const src = fs.readFileSync('ordering/worker/src/admin.js', 'utf8');
  ok(/HttpOnly; Secure; SameSite=Lax/.test(src) && !/SameSite=None/.test(src), 'the session cookie is HttpOnly, Secure, SameSite=Lax');
  for (const f of ['app.html', 'login.html']) { const h = fs.readFileSync('ordering/site/beheer/' + f, 'utf8'); ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(h) && !/\sstyle=|\son[a-z]+=/.test(h) && !/https?:\/\//.test(h.replace(/<!--[\s\S]*?-->/g, '')), f + ': no inline script, style or handler, nothing loaded from elsewhere (the CSP allows none of it)'); }
  for (const f of ['app.js', 'login.js']) ok(!/innerHTML|insertAdjacentHTML|document\.write|eval\(/.test(fs.readFileSync('ordering/site/beheer/' + f, 'utf8')), f + ': text only, never HTML from data');
  ok(/noindex/.test(fs.readFileSync('ordering/site/beheer/app.html', 'utf8')) && /Disallow: \/beheer/.test(fs.readFileSync('ordering/worker/src/index.js', 'utf8')), 'kept out of search engines twice');

  console.log(fails.length ? 'FAIL\n  ' + fails.join('\n  ') : 'admin: ' + n + ' passed');
  process.exit(fails.length ? 1 : 0);
})();
