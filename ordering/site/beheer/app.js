// /beheer — the back office page. Stage 1: opening hours (calendar + weekly rule) and the change log.
// No framework and no build step; every number on screen comes from /beheer/api/hours.
(function () {
  var T = {
    nl: { 'a.title': 'Beheer', 'a.logout': 'Uitloggen', 't.hours': 'Openingstijden', 't.log': 'Logboek',
      'h.cal': 'Kalender', 'h.cal.hint': 'Tik op een dag om het café die dag te sluiten of andere tijden te geven. Voor een vakantie kiest u een begin- en einddatum.',
      'h.today': 'Vandaag', 'h.l.open': 'Normale tijden', 'h.l.diff': 'Andere tijden', 'h.l.shut': 'Gesloten', 'h.up': 'Komende afwijkingen', 'h.up.none': 'Geen afwijkingen gepland.',
      'h.week': 'Vaste openingstijden', 'h.week.hint': 'Deze tijden gelden elke week, tenzij de kalender voor een dag iets anders zegt.', 'h.week.save': 'Vaste tijden opslaan',
      'h.offs': 'Online bestellen sluit {n} minuten voor sluitingstijd.', 'w.closed': 'Gesloten', 'w.open': 'Open', 'w.close': 'Dicht', 'shut': 'Gesloten', 'shut.s': 'Dicht',
      'd.from': 'Van', 'd.to': 'Tot en met', 'd.closed': 'Gesloten', 'd.times': 'Andere tijden', 'd.open': 'Open', 'd.close': 'Dicht', 'd.normal': 'Normale tijden (afwijking weghalen)',
      'd.note': 'Toelichting voor gasten (mag leeg blijven)', 'd.more': 'Engels en Duits', 'd.cancel': 'Annuleren', 'd.save': 'Opslaan', 'd.usual': 'Normaal op deze dag: {h}', 'edit': 'Wijzigen',
      'g.title': 'Logboek', 'g.hint': 'Elke wijziging in het beheer: wie, wanneer en wat.', 'g.none': 'Nog geen wijzigingen.',
      'g.login': 'Ingelogd', 'g.logout': 'Uitgelogd', 'g.hours_week': 'Vaste tijden gewijzigd', 'g.hours_day': 'Kalender gewijzigd', 'g.hours_day_clear': 'Afwijking weggehaald',
      's.open': 'Het café is nu open tot {c}. Online bestellen kan tot {l}.', 's.today': 'Nu gesloten. Vandaag open vanaf {t}.', 's.tomorrow': 'Nu gesloten. Morgen open vanaf {t}.', 's.later': 'Nu gesloten. Weer open op {d} vanaf {t}.', 's.never': 'Er staat de komende twee maanden geen open dag in de kalender.',
      'f.saved': 'Opgeslagen. Gasten zien dit binnen een minuut.', 'e.times': 'De openingstijd moet voor de sluitingstijd liggen.', 'e.dates': 'Controleer de datums: de einddatum moet op of na de begindatum liggen.', 'e.past': 'Deze dag is al voorbij.', 'e.range': 'Maximaal drie maanden in één keer.',
      'e.all_closed': 'Elke dag staat op gesloten. Gebruik de kalender voor een vakantie.', 'e.mode': 'Kies gesloten, andere tijden of normale tijden.', 'e.net': 'Dat lukte niet. Controleer de verbinding en probeer het opnieuw.', 'other': 'English' },
    en: { 'a.title': 'Back office', 'a.logout': 'Log out', 't.hours': 'Opening hours', 't.log': 'Change log',
      'h.cal': 'Calendar', 'h.cal.hint': 'Tap a day to close the café that day or give it different hours. For a holiday, choose a first and a last date.',
      'h.today': 'Today', 'h.l.open': 'Usual hours', 'h.l.diff': 'Different hours', 'h.l.shut': 'Closed', 'h.up': 'Coming changes', 'h.up.none': 'Nothing planned.',
      'h.week': 'Usual opening hours', 'h.week.hint': 'These hours apply every week, unless the calendar says something else for a day.', 'h.week.save': 'Save usual hours',
      'h.offs': 'Online ordering stops {n} minutes before closing time.', 'w.closed': 'Closed', 'w.open': 'Open', 'w.close': 'Close', 'shut': 'Closed', 'shut.s': 'Shut',
      'd.from': 'From', 'd.to': 'Up to and including', 'd.closed': 'Closed', 'd.times': 'Different hours', 'd.open': 'Open', 'd.close': 'Close', 'd.normal': 'Usual hours (remove the change)',
      'd.note': 'Note for guests (may stay empty)', 'd.more': 'English and German', 'd.cancel': 'Cancel', 'd.save': 'Save', 'd.usual': 'Usually on this day: {h}', 'edit': 'Change',
      'g.title': 'Change log', 'g.hint': 'Every change made here: who, when and what.', 'g.none': 'No changes yet.',
      'g.login': 'Logged in', 'g.logout': 'Logged out', 'g.hours_week': 'Usual hours changed', 'g.hours_day': 'Calendar changed', 'g.hours_day_clear': 'Change removed',
      's.open': 'The café is open now until {c}. Online ordering until {l}.', 's.today': 'Closed now. Opens today at {t}.', 's.tomorrow': 'Closed now. Opens tomorrow at {t}.', 's.later': 'Closed now. Opens again on {d} at {t}.', 's.never': 'The calendar has no open day in the next two months.',
      'f.saved': 'Saved. Guests see this within a minute.', 'e.times': 'The opening time must be before the closing time.', 'e.dates': 'Check the dates: the last date must be on or after the first.', 'e.past': 'This day has already passed.', 'e.range': 'At most three months at a time.',
      'e.all_closed': 'Every day is set to closed. Use the calendar for a holiday.', 'e.mode': 'Choose closed, different hours or usual hours.', 'e.net': 'That did not work. Check the connection and try again.', 'other': 'Nederlands' }
  };
  var lang = 'nl'; try { lang = localStorage.getItem('beheer.lang') || 'nl'; } catch (e) {}
  if (!T[lang]) lang = 'nl';
  var loc = function () { return lang === 'nl' ? 'nl-NL' : 'en-GB'; };
  function t(k, v) { var s = T[lang][k] || k; if (v) for (var x in v) s = s.replace('{' + x + '}', v[x]); return s; }
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = text; return e; }

  // ---- dates: plain YYYY-MM-DD strings, arithmetic at noon UTC so no timezone can shift a day
  function D(ymd) { return new Date(ymd + 'T12:00:00Z'); }
  function ymdOf(d) { return d.toISOString().slice(0, 10); }
  function addDays(ymd, n) { var d = D(ymd); d.setUTCDate(d.getUTCDate() + n); return ymdOf(d); }
  function wd(ymd) { return D(ymd).getUTCDay(); }
  function longDate(ymd) { return new Intl.DateTimeFormat(loc(), { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(D(ymd)); }
  function shortDate(ymd) { return new Intl.DateTimeFormat(loc(), { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(D(ymd)); }
  function dayName(n, style) { return new Intl.DateTimeFormat(loc(), { timeZone: 'UTC', weekday: style || 'long' }).format(D(addDays('2026-11-15', n))); }   // 2026-11-15 is a Sunday

  var H = null, EX = {}, view = null;   // view = first day of the month on screen
  function api(method, path, body) {
    return fetch(path, { method: method, credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { if (r.status === 401) { location.replace('/beheer'); throw new Error('login'); } return r.json().then(function (j) { return { ok: r.ok, j: j }; }); });
  }
  function usual(ymd) { var w = H.week[wd(ymd)]; return w.closed ? null : w.open + '–' + w.close; }
  function take(j) { H = j; EX = {}; j.exceptions.forEach(function (e) { EX[e.date] = e; }); if (!view) view = j.today.slice(0, 8) + '01'; paintAll(); }
  function flash(k) { var f = $('flash'); f.textContent = t(k); f.hidden = false; clearTimeout(flash.t); flash.t = setTimeout(function () { f.hidden = true; }, 5000); }

  function paintState() {
    var s = H.state, m = function (n) { return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0'); }, e = $('state');
    e.className = 'state ' + (s.open ? 'is-open' : 'is-shut');
    e.textContent = s.open ? t('s.open', { c: m(s.close), l: m(s.last) }) : s.at === null ? t('s.never') : s.when === 'later' ? t('s.later', { d: longDate(s.date), t: m(s.at) }) : t('s.' + s.when, { t: m(s.at) });
  }
  function paintCal() {
    var first = view, y = +first.slice(0, 4), mo = +first.slice(5, 7), cal = $('cal');
    $('month').textContent = new Intl.DateTimeFormat(loc(), { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(D(first));
    cal.textContent = '';
    for (var i = 1; i <= 7; i++) cal.appendChild(el('div', 'dow', dayName(i % 7, 'short')));
    var lead = (wd(first) + 6) % 7, start = addDays(first, -lead);
    for (var c = 0; c < 42; c++) {
      var d = addDays(start, c), inMonth = +d.slice(5, 7) === mo && +d.slice(0, 4) === y;
      if (c >= 35 && !inMonth && +addDays(start, 35).slice(5, 7) !== mo) break;
      var ex = EX[d], u = usual(d), past = d < H.today;
      var b = el('button', 'day' + (inMonth ? '' : ' out') + (past ? ' past' : '') + (d === H.today ? ' today' : '') + (ex ? (ex.closed ? ' shut ex' : ' diff ex') : (u ? '' : ' shut')));
      b.type = 'button'; b.setAttribute('data-d', d); b.disabled = past;
      b.appendChild(el('span', 'num', String(+d.slice(8))));
      // two spans so a phone-width cell can stack "15:00" over "21:00" and say "Dicht" where "Gesloten" will not fit
      var hrs = el('span', 'hrs'), o = ex ? (ex.closed ? null : ex.open) : (u ? H.week[wd(d)].open : null), cl = ex ? (ex.closed ? null : ex.close) : (u ? H.week[wd(d)].close : null);
      if (o) { hrs.appendChild(el('span', 'o', o)); hrs.appendChild(el('span', 'sep', '–')); hrs.appendChild(el('span', 'c', cl)); }
      else { hrs.appendChild(el('span', 'full', t('shut'))); hrs.appendChild(el('span', 'short', t('shut.s'))); }
      b.appendChild(hrs);
      var note = ex && ex.note && (ex.note[lang] || ex.note.nl); if (note) b.appendChild(el('span', 'note', note));
      b.setAttribute('aria-label', longDate(d) + ': ' + (ex ? (ex.closed ? t('shut') : ex.open + '–' + ex.close) : (u || t('shut'))));
      cal.appendChild(b);
    }
  }
  function paintUpcoming() {
    var ul = $('upcoming'), rows = H.exceptions.filter(function (e) { return e.date >= H.today; }); ul.textContent = '';
    if (!rows.length) { ul.appendChild(el('li', 'none', t('h.up.none'))); return; }
    // fold consecutive days with the same setting into one line: "ma 21 dec – zo 3 jan · Gesloten"
    var runs = [], same = function (a, b) { return a.closed === b.closed && a.open === b.open && a.close === b.close && (a.note.nl || '') === (b.note.nl || ''); };
    rows.forEach(function (e) { var r = runs[runs.length - 1]; if (r && addDays(r.to, 1) === e.date && same(r.e, e)) r.to = e.date; else runs.push({ from: e.date, to: e.date, e: e }); });
    runs.forEach(function (r) {
      var li = el('li'), b = el('button', 'quiet', t('edit')); b.type = 'button';
      li.appendChild(el('span', 'when', r.from === r.to ? shortDate(r.from) : shortDate(r.from) + ' – ' + shortDate(r.to)));
      li.appendChild(el('span', 'what ' + (r.e.closed ? 'shut' : 'diff'), r.e.closed ? t('shut') : r.e.open + '–' + r.e.close));
      li.appendChild(el('span', 'why', r.e.note[lang] || r.e.note.nl || ''));
      b.addEventListener('click', function () { openDay(r.from, r.to); }); li.appendChild(b); ul.appendChild(li);
    });
  }
  function paintWeek() {
    var box = $('weekrows'); box.textContent = '';
    [1, 2, 3, 4, 5, 6, 0].forEach(function (n) {
      var w = H.week[n], row = el('div', 'wrow' + (w.closed ? ' off' : '')); row.setAttribute('data-wd', n);
      row.appendChild(el('span', 'wname', dayName(n)));
      var o = el('input'); o.type = 'time'; o.step = 300; o.value = w.open; o.className = 'wo'; o.setAttribute('aria-label', dayName(n) + ' ' + t('w.open'));
      var c = el('input'); c.type = 'time'; c.step = 300; c.value = w.close === '24:00' ? '23:59' : w.close; c.className = 'wc'; c.setAttribute('aria-label', dayName(n) + ' ' + t('w.close'));
      var lab = el('label', 'wshut'), cb = el('input'); cb.type = 'checkbox'; cb.checked = w.closed; cb.className = 'wx';
      cb.addEventListener('change', function () { row.classList.toggle('off', cb.checked); });
      lab.appendChild(cb); lab.appendChild(el('span', null, t('w.closed')));
      row.appendChild(o); row.appendChild(el('span', 'dash', '–')); row.appendChild(c); row.appendChild(lab); box.appendChild(row);
    });
    $('offs').textContent = t('h.offs', { n: H.last_orders_offset_min });
  }
  function paintText() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-t]').forEach(function (e) { e.textContent = t(e.getAttribute('data-t')); });
    $('langbtn').textContent = t('other');
  }
  function paintAll() { paintText(); if (!H) return; paintState(); paintCal(); paintUpcoming(); paintWeek(); }

  // ---- the day dialog
  var dlg = $('dlg');
  function mode() { var r = document.querySelector('input[name=mode]:checked'); return r ? r.value : ''; }
  function syncDlg() { var m = mode(); $('d-timesrow').hidden = m !== 'times'; $('d-notes').hidden = m === 'normal' || !m; }
  function openDay(from, to) {
    var ex = EX[from], u = usual(from);
    $('d-title').textContent = from === to ? longDate(from) : shortDate(from) + ' – ' + shortDate(to);
    $('d-normal').textContent = t('d.usual', { h: u || t('shut') });
    $('d-from').value = from; $('d-to').value = to; $('d-from').min = H.today; $('d-to').min = H.today;
    var m = ex ? (ex.closed ? 'closed' : 'times') : 'closed';
    document.querySelectorAll('input[name=mode]').forEach(function (r) { r.checked = r.value === m; });
    $('d-open').value = ex && !ex.closed ? ex.open : (H.week[wd(from)].open); $('d-close').value = ex && !ex.closed ? ex.close : (H.week[wd(from)].close);
    $('d-nl').value = ex ? ex.note.nl : ''; $('d-en').value = ex ? ex.note.en : ''; $('d-de').value = ex ? ex.note.de : '';
    $('d-err').hidden = true; syncDlg(); dlg.showModal();
  }
  document.querySelectorAll('input[name=mode]').forEach(function (r) { r.addEventListener('change', syncDlg); });
  $('d-from').addEventListener('change', function () { if ($('d-to').value < $('d-from').value) $('d-to').value = $('d-from').value; });
  $('d-cancel').addEventListener('click', function () { dlg.close(); });
  $('day').addEventListener('submit', function (ev) {
    ev.preventDefault(); var err = $('d-err'); err.hidden = true;
    var body = { from: $('d-from').value, to: $('d-to').value, mode: mode(), open: $('d-open').value, close: $('d-close').value, note: { nl: $('d-nl').value, en: $('d-en').value, de: $('d-de').value } };
    api('PUT', '/beheer/api/hours/days', body).then(function (r) {
      if (!r.ok) { err.textContent = t('e.' + (r.j.error || 'net')); err.hidden = false; return; }
      dlg.close(); take(r.j); flash('f.saved');
    }).catch(function () { err.textContent = t('e.net'); err.hidden = false; });
  });
  $('cal').addEventListener('click', function (ev) { var b = ev.target.closest('button.day'); if (b && !b.disabled) openDay(b.getAttribute('data-d'), b.getAttribute('data-d')); });
  function shift(n) { var d = D(view); d.setUTCMonth(d.getUTCMonth() + n, 1); view = ymdOf(d); paintCal(); }
  $('prev').addEventListener('click', function () { shift(-1); }); $('next').addEventListener('click', function () { shift(1); });
  $('tod').addEventListener('click', function () { view = H.today.slice(0, 8) + '01'; paintCal(); });

  // ---- the weekly rule
  $('week').addEventListener('submit', function (ev) {
    ev.preventDefault(); var week = [];
    document.querySelectorAll('#weekrows .wrow').forEach(function (row) { week[+row.getAttribute('data-wd')] = { closed: row.querySelector('.wx').checked, open: row.querySelector('.wo').value, close: row.querySelector('.wc').value }; });
    var btn = ev.target.querySelector('button[type=submit]'); btn.disabled = true;
    api('PUT', '/beheer/api/hours/week', { week: week }).then(function (r) {
      btn.disabled = false; if (!r.ok) { flash('e.' + (r.j.error || 'net')); return; } take(r.j); flash('f.saved');
    }).catch(function () { btn.disabled = false; flash('e.net'); });
  });

  // ---- log, tabs, language, logout
  function loadLog() {
    api('GET', '/beheer/api/log').then(function (r) {
      var tb = $('logrows'); tb.textContent = '';
      if (!r.j.rows.length) { var tr0 = el('tr'); tr0.appendChild(el('td', 'none', t('g.none'))); tb.appendChild(tr0); return; }
      r.j.rows.forEach(function (x) {
        var tr = el('tr'), detail = ''; try { var d = JSON.parse(x.detail || 'null'); if (Array.isArray(d)) detail = d.join('  '); else if (d) detail = (d.from === d.to ? d.from : d.from + ' – ' + d.to) + (d.mode === 'closed' ? ' · ' + t('shut') : d.mode === 'times' ? ' · ' + d.open + '–' + d.close : '') + (d.note ? ' · ' + d.note : ''); } catch (e) {}
        tr.appendChild(el('td', 'at', new Intl.DateTimeFormat(loc(), { timeZone: 'Europe/Amsterdam', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(x.at))));
        tr.appendChild(el('td', 'act', t('g.' + x.action))); tr.appendChild(el('td', 'det', detail)); tr.appendChild(el('td', 'who', x.who)); tb.appendChild(tr);
      });
    }).catch(function () {});
  }
  document.querySelectorAll('#tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      var tab = b.getAttribute('data-tab');
      document.querySelectorAll('#tabs button').forEach(function (x) { if (x === b) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current'); });
      $('p-hours').hidden = tab !== 'hours'; $('p-log').hidden = tab !== 'log'; if (tab === 'log') loadLog();
    });
  });
  $('langbtn').addEventListener('click', function () { lang = lang === 'nl' ? 'en' : 'nl'; try { localStorage.setItem('beheer.lang', lang); } catch (e) {} paintAll(); if (!$('p-log').hidden) loadLog(); });
  $('logout').addEventListener('click', function () { api('POST', '/beheer/logout', {}).then(function () { location.replace('/beheer'); }).catch(function () {}); });

  paintText();
  api('GET', '/beheer/api/me').then(function (r) { $('me').textContent = r.j.email; }).catch(function () {});
  api('GET', '/beheer/api/hours').then(function (r) { take(r.j); }).catch(function () { flash('e.net'); });
})();
