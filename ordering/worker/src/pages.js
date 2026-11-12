// The two pages the customer lands on after MultiSafepay: /klaar/<id> (we are checking… → paid)
// and /geannuleerd/<id>. The return URL sets nothing (proposal §8): /klaar polls the read-only status
// endpoint and shows "paid" only when D1 says so. In the order's language; the cart is cleared only
// on a confirmed payment.
import { ORDER_ID_RE } from './ids.js';
const T = {
  nl: { title: 'Uw bestelling', checking: 'Een ogenblik, we controleren uw betaling…', paid: 'Betaald. Bedankt!', ref: 'Uw bestelnummer', ready: 'Klaar om ongeveer', pickup: 'Afhalen bij', keep: 'Noteer het nummer of maak een schermafbeelding; u heeft het nodig bij het afhalen.', failed: 'De betaling is niet gelukt.', expired: 'De betaallink is verlopen.', cancelled: 'De betaling is geannuleerd.', again: 'Terug naar de kaart — uw bestelling staat nog klaar', slow: 'De bank laat nog op zich wachten. Blijf op deze pagina of bel ons: ', notfound: 'Deze bestelling is niet gevonden.' },
  en: { title: 'Your order', checking: 'One moment, we are checking your payment…', paid: 'Paid. Thank you!', ref: 'Your order number', ready: 'Ready at about', pickup: 'Pick up at', keep: 'Note the number or take a screenshot; you will need it at pickup.', failed: 'The payment did not go through.', expired: 'The payment link has expired.', cancelled: 'The payment was cancelled.', again: 'Back to the menu — your order is still there', slow: 'The bank is taking a while. Stay on this page or call us: ', notfound: 'This order was not found.' },
  de: { title: 'Ihre Bestellung', checking: 'Einen Moment, wir prüfen Ihre Zahlung…', paid: 'Bezahlt. Vielen Dank!', ref: 'Ihre Bestellnummer', ready: 'Fertig gegen', pickup: 'Abholen bei', keep: 'Notieren Sie die Nummer oder machen Sie einen Screenshot; Sie brauchen sie beim Abholen.', failed: 'Die Zahlung ist fehlgeschlagen.', expired: 'Der Zahlungslink ist abgelaufen.', cancelled: 'Die Zahlung wurde abgebrochen.', again: 'Zurück zur Karte — Ihre Bestellung ist noch da', slow: 'Die Bank braucht noch einen Moment. Bleiben Sie auf dieser Seite oder rufen Sie uns an: ', notfound: 'Diese Bestellung wurde nicht gefunden.' },
};
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const CSS = `:root{--paper:#FBF8F1;--ink:#1B1F1A;--dim:#4A5147;--line:#CFD3CA;--green:#2F6B4F;--red:#A8502A}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 Georgia,'Times New Roman',serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}
.card{background:#fff;border:1px solid var(--line);border-radius:6px;padding:28px 24px;max-width:460px;width:100%;text-align:center}
h1{font-size:22px;margin:0 0 10px;color:var(--green)}.ref{font-size:44px;letter-spacing:.18em;font-weight:700;margin:8px 0 2px}.lbl{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim)}
p{margin:10px 0}.dim{color:var(--dim);font-size:14px}.bad h1{color:var(--red)}a{color:var(--green)}.spin{display:inline-block;width:18px;height:18px;border:2px solid var(--line);border-top-color:var(--green);border-radius:50%;animation:s 1s linear infinite;vertical-align:middle;margin-right:8px}@keyframes s{to{transform:rotate(360deg)}}`;
function shell(lang, body) {
  return new Response(`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(T[lang].title)} — Oud-Kempen Eetcafé</title><style>${CSS}</style></head><body>${body}</body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
export async function klaar(env, id) {
  if (!ORDER_ID_RE.test(id)) return shell('nl', `<div class="card bad"><h1>${T.nl.notfound}</h1></div>`);
  const o = await env.DB.prepare('select lang from orders where id=?').bind(id).first();
  const lang = (o && T[o.lang]) ? o.lang : 'nl', t = T[lang];
  if (!o) return shell(lang, `<div class="card bad"><h1>${esc(t.notfound)}</h1><p><a href="/">${esc(t.again)}</a></p></div>`);
  const phone = env.CAFE_PHONE || '', addr = env.CAFE_ADDRESS || '';
  return shell(lang, `<div class="card" id="c"><h1 id="h"><span class="spin"></span>${esc(t.checking)}</h1><div id="b"></div></div>
<script>
var T=${JSON.stringify(t)},ID=${JSON.stringify(id)},PHONE=${JSON.stringify(phone)},ADDR=${JSON.stringify(addr)},n=0;
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(m){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];});}
function show(st,d){var c=document.getElementById('c'),h=document.getElementById('h'),b=document.getElementById('b');
 if(st==='paid'){c.className='card';h.textContent=T.paid;
  b.innerHTML='<div class="lbl">'+esc(T.ref)+'</div><div class="ref">'+esc(d.public_ref)+'</div><p>'+esc(T.ready)+' <b>'+esc(d.ready_at)+'</b></p><p class="dim">'+esc(T.pickup)+' Oud-Kempen Eetcafé, '+esc(ADDR)+' · <a href="tel:'+esc(PHONE.replace(/\\s/g,''))+'">'+esc(PHONE)+'</a></p><p class="dim">'+esc(T.keep)+'</p>';
  try{localStorage.removeItem('ok-cart');['f-note','f-name','f-email','f-phone'].forEach(function(k){sessionStorage.removeItem('ok-'+k);});}catch(e){} return true;}
 if(st==='failed'||st==='expired'||st==='cancelled'){c.className='card bad';h.textContent=T[st]||T.failed;b.innerHTML='<p><a href="/">'+esc(T.again)+'</a></p>';return true;}
 if(n>40){h.innerHTML='<span class="spin"></span>'+esc(T.slow)+'<a href="tel:'+esc(PHONE.replace(/\\s/g,''))+'">'+esc(PHONE)+'</a>';}
 return false;}
function poll(){n++;fetch('/api/orders/'+ID,{cache:'no-store'}).then(function(r){return r.json();}).then(function(d){if(!show(d.status,d))setTimeout(poll,3000);}).catch(function(){setTimeout(poll,4000);});}
poll();
</script>`);
}
export async function geannuleerd(env, id) {
  const o = ORDER_ID_RE.test(id) ? await env.DB.prepare('select lang from orders where id=?').bind(id).first() : null;
  const lang = (o && T[o.lang]) ? o.lang : 'nl', t = T[lang];
  return shell(lang, `<div class="card bad"><h1>${esc(t.cancelled)}</h1><p><a href="/">${esc(t.again)}</a></p></div>`);
}
