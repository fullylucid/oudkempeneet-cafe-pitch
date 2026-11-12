// Opening hours — the same engine the ordering page runs (ordering/bestellen.template.html), server
// side, because the browser is never the guard (Q8: outside hours the cart shows, checkout refuses).
// Mon–Thu 15:00, Fri–Sun 12:30, close 21:00, Europe/Amsterdam; last orders `offsetMin` before close.
const CLOSE_M = 21 * 60;
export function openMinsFor(wd) { return (wd >= 1 && wd <= 4) ? 15 * 60 : 12 * 60 + 30; }
export function nowAms(date) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date || new Date());
  const get = t => p.find(x => x.type === t).value;
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[get('weekday')];
  return { wd, m: parseInt(get('hour'), 10) % 24 * 60 + parseInt(get('minute'), 10) };
}
export function orderingState(offsetMin, date) {
  const n = nowAms(date), open = openMinsFor(n.wd), last = CLOSE_M - (offsetMin | 0);
  if (n.m >= open && n.m < last) return { open: true, last };
  if (n.m < open) return { open: false, when: 'today', at: open };
  return { open: false, when: 'tomorrow', at: openMinsFor((n.wd + 1) % 7) };
}
export function hhmm(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
// "ready at" for the ticket: created + wait, as a clock time in Amsterdam
export function readyAt(createdIso, waitMin) {
  const d = new Date(new Date(createdIso).getTime() + (waitMin | 0) * 60000);
  return new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}
