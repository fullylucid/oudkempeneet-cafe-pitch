// The go-live page: /golive?t=<SETUP_TOKEN>. A temporary, token-gated checklist that shows where
// the hook-up stands and takes the one secret the café has to hand over — the MultiSafepay website
// key — without it ever touching chat, mail or a repo (ruling Q11). The page dies on GOLIVE_UNTIL
// or when SETUP_TOKEN is deleted. Nothing on it reveals a secret: the key shows as its last 4 chars.
import { loadSettings, setSetting, getMsp, putMsp } from './db.js';
import { derive, timingSafeEqual } from './seal.js';
import { probeKey, DASHBOARDS } from './msp.js';
import { sendMail } from './mail.js';
import { json, insertOrder, startPayment, CAFE_INBOX } from './orders.js';
import { newOrderId, newPublicRef, eur } from './ids.js';

const notFound = () => new Response('Not found', { status: 404 });
export const LIVE_HOST = 'bestellen.oudkempeneetcafe.nl';

export async function golive(request, env, path) {
  if (!env.SETUP_TOKEN || !env.SEAL_KEY) return notFound();
  if (!(Date.parse(env.GOLIVE_UNTIL || '') > Date.now())) return notFound();   // temporary by construction
  const url = new URL(request.url);
  const want = await derive(env.SEAL_KEY, 'golive:' + env.SETUP_TOKEN);
  if (path === '/golive' && url.searchParams.has('t')) {
    if (!timingSafeEqual(url.searchParams.get('t'), env.SETUP_TOKEN)) return notFound();
    return new Response(null, { status: 303, headers: { location: '/golive', 'set-cookie': 'golive=' + want + '; Path=/golive; HttpOnly; Secure; SameSite=Strict; Max-Age=43200' } });
  }
  const c = (request.headers.get('cookie') || '').split(/;\s*/).find(x => x.startsWith('golive='));
  if (!c || !timingSafeEqual(c.slice(7), want)) return notFound();
  if (path === '/golive') return new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
  if (path === '/golive/status' && request.method === 'GET') return json(await status(request, env));
  if (request.method !== 'POST') return notFound();
  const body = await request.json().catch(() => ({}));
  if (path === '/golive/key') return installKey(env, body);
  if (path === '/golive/test-alert') return testAlert(env, body);
  if (path === '/golive/test-order') return testOrder(request, env);
  return notFound();
}

async function installKey(env, body) {
  const key = String(body.key || '').trim();
  if (key.length < 16 || key.length > 200 || /\s/.test(key)) return json({ ok: false, error: 'That does not look like a MultiSafepay API key (Websites → your website → API key, top right).' });
  let probe; try { probe = await probeKey(key); } catch (e) { return json({ ok: false, error: String(e.message || e) }); }
  if (!probe) return json({ ok: false, error: 'MultiSafepay rejects this key on both the live and the test platform. Copy the API key (not the Security code or the Website ID) and try again.' });
  await putMsp(env, key, probe.mode, probe.gateways);
  return json({ ok: true, mode: probe.mode, gateways: probe.gateways, hint: '…' + key.slice(-4) });
}
async function testAlert(env, body) {
  const settings = await loadSettings(env);
  const to = String(body.to || settings.alert_to || CAFE_INBOX).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return json({ ok: false, error: 'Not an email address.' });
  try {
    await sendMail(env, { to, subject: 'Test — afhaalbestellingen Oud-Kempen Eetcafé', text: 'Dit is een testbericht van het online bestelsysteem.\n\nAls u dit leest, komen de bestelmeldingen in deze inbox aan. Er is niets besteld.\n\nVerstuurd ' + new Date().toISOString() });
    if (to === (settings.alert_to || CAFE_INBOX)) await setSetting(env, 'alert_verified_at', new Date().toISOString());
    await setSetting(env, 'alert_test_last', new Date().toISOString() + ' ok → ' + to);
    return json({ ok: true, to });
  } catch (e) {
    const msg = String(e.message || e);
    await setSetting(env, 'alert_test_last', new Date().toISOString() + ' FAILED → ' + to + ': ' + msg.slice(0, 200));
    return json({ ok: false, error: msg, hint: /verified|destination|not allowed/i.test(msg) ? 'Cloudflare only delivers to an address its owner has verified. Open the inbox, find the email from Cloudflare ("Verify your email address"), click the link, then try again.' : null });
  }
}
// A one-cent order through the real path: D1 row → MultiSafepay → hosted page → webhook → alert.
// In test mode no money moves; in live mode €0,01 really is charged (refund it in the dashboard, or don't).
async function testOrder(request, env) {
  const settings = await loadSettings(env), msp = await getMsp(env, settings);
  if (!msp) return json({ ok: false, error: 'Install the MultiSafepay key first.' });
  const now = new Date().toISOString();
  const order = { id: newOrderId(), public_ref: newPublicRef(), status: 'pending', lang: 'nl', subtotal_cents: 1, vat_low_cents: 0, vat_high_cents: 0, total_cents: 1,
    customer_name: 'Testbetaling go-live', customer_email: settings.alert_to || CAFE_INBOX, customer_phone: env.CAFE_PHONE || '-', order_note: 'TESTBESTELLING via de go-live pagina — niets bereiden.', pickup_eta_min: parseInt(settings.standard_wait_min, 10) || 45, created_at: now };
  const items = [{ order_id: order.id, line: 1, item_id: 'test', qty: 1, unit_price_cents: 1, vat_rate: 9, name_snapshot: 'Testbetaling (1 cent)', options_snapshot: null, options_cents: 0, line_note: null }];
  await insertOrder(env, order, items);
  await setSetting(env, 'last_test_order', order.id);
  const r = await startPayment(request, env, settings, msp, order, items);
  const j = await r.json();
  return json(j.payment_url ? { ok: true, id: order.id, public_ref: order.public_ref, payment_url: j.payment_url } : { ok: false, error: 'MultiSafepay refused the order: ' + (j.detail || j.error) });
}

async function status(request, env) {
  const settings = await loadSettings(env), msp = await getMsp(env, settings);
  const host = new URL(request.url).host;
  const menu = await env.DB.prepare('select count(*) n from menu_items where orderable=1 and archived_at is null').first();
  const recent = (await env.DB.prepare('select id,public_ref,status,total_cents,created_at,paid_at,alert_sent_at,msp_status,order_note from orders order by created_at desc limit 8').all()).results
    .map(o => ({ ref: o.public_ref, status: o.status, total: eur(o.total_cents), at: o.created_at, alert: !!o.alert_sent_at, msp: o.msp_status, test: /TESTBESTELLING/.test(o.order_note || '') }));
  const t = settings.last_test_order ? await env.DB.prepare('select status,public_ref,alert_sent_at,created_at,msp_status from orders where id=?').bind(settings.last_test_order).first() : null;
  const gateways = (() => { try { return JSON.parse(settings.msp_gateways || '[]'); } catch (e) { return []; } })();
  const steps = [
    { id: 'install', title: 'Ordering system installed on the café’s Cloudflare account', who: 'Charlotte', done: true,
      detail: 'Worker ' + host + ' · database with ' + (menu ? menu.n : '?') + ' orderable dishes · opening hours and prices enforced server-side.' },
    { id: 'inbox', title: 'Café inbox verified for order alerts (' + (settings.alert_to || CAFE_INBOX) + ')', who: 'Dave / Zach', done: !!settings.alert_verified_at,
      detail: settings.alert_verified_at ? 'Test alert delivered ' + settings.alert_verified_at.slice(0, 16).replace('T', ' ') + ' UTC.'
        : 'Cloudflare sent “Verify your email address” to that inbox on 12 Nov. Open it, click the link, then press Send test alert. Until this is green a paid order is confirmed to the customer but the kitchen is not told.', action: 'alert' },
    { id: 'key', title: 'MultiSafepay website key installed', who: 'Dave reads it out, or pastes it here', done: !!msp,
      detail: msp ? ('Key ' + msp.hint + ' · ' + msp.mode.toUpperCase() + ' platform · methods enabled: ' + (gateways.length ? gateways.join(', ') : 'none yet — enable iDEAL under Websites → site → Payment methods'))
        : 'In ' + DASHBOARDS.live + ' (or ' + DASHBOARDS.test + ' for a dry run): Websites → the café’s website → top right: API key. Paste it below. The page tells test from live by itself.', action: 'key' },
    { id: 'testpay', title: 'One test payment went all the way through (pay → confirmed → alert)', who: 'Schyler or Zach', done: !!(t && t.status === 'paid'),
      detail: t ? ('Last test order ' + t.public_ref + ': ' + t.status + (t.msp_status ? ' (MultiSafepay: ' + t.msp_status + ')' : '') + (t.alert_sent_at ? ' · alert sent' : ' · alert not sent yet'))
        : 'Creates a €0,01 order through the real path and opens the payment page. On the TEST platform pick “Success”; on LIVE pay the cent with iDEAL.', action: 'test' },
    { id: 'live', title: 'Live key in place (real money)', who: 'Dave', done: !!(msp && msp.mode === 'live'),
      detail: msp && msp.mode === 'live' ? 'Orders are charged for real.' : 'Everything above can be done on the test platform first. When Dave’s live account is active, paste the LIVE website key in step 3 — same box. Needs: live account approved by MultiSafepay, website added there, iDEAL enabled on it.' },
    { id: 'open', title: 'Open to customers: ' + LIVE_HOST + ' and the website’s Bestellen button', who: 'Schyler says go; Charlotte flips it', done: !!settings.custom_host_seen_at,
      detail: settings.custom_host_seen_at ? 'Live since ' + settings.custom_host_seen_at.slice(0, 16).replace('T', ' ') + ' UTC.' : 'Not before steps 2–5 are green. Say “go” in the studio group; the domain is attached and www.oudkempeneetcafe.nl/bestellen starts sending people here.' },
  ];
  return { now: new Date().toISOString(), host, mode: msp ? msp.mode : null, until: env.GOLIVE_UNTIL, steps, recent, alert_last_error: settings.alert_last_error || null, alert_test_last: settings.alert_test_last || null };
}

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Go-live — Oud-Kempen online ordering</title>
<style>
:root{--paper:#FBF8F1;--ink:#1B1F1A;--dim:#4A5147;--line:#CFD3CA;--green:#2F6B4F;--amber:#9A6B12;--red:#A8502A;--soft:#F3F4F0}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;padding:16px}
main{max-width:760px;margin:0 auto}h1{font-size:22px;margin:4px 0 2px}.sub{color:var(--dim);margin:0 0 16px;font-size:13px}
.badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:600;letter-spacing:.04em;vertical-align:middle}.test{background:#F3E7C8;color:var(--amber)}.live{background:#DCEFE3;color:var(--green)}.none{background:#EEE;color:var(--dim)}
ol{list-style:none;padding:0;margin:0}li{background:#fff;border:1px solid var(--line);border-radius:6px;padding:12px 14px 12px 46px;margin:0 0 8px;position:relative}
li .n{position:absolute;left:12px;top:12px;width:24px;height:24px;border-radius:50%;border:2px solid var(--line);text-align:center;font-size:12px;line-height:20px;font-weight:700;color:var(--dim)}
li.done .n{background:var(--green);border-color:var(--green);color:#fff}li.now{border-color:var(--amber)}li.now .n{border-color:var(--amber);color:var(--amber)}
li h2{font-size:15px;margin:0}li .who{font-size:12px;color:var(--dim)}li p{margin:6px 0 0;font-size:13.5px;color:var(--dim)}
.act{margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}input{font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:4px;min-width:0;flex:1}
button{font:inherit;padding:8px 14px;border:0;border-radius:4px;background:var(--green);color:#fff;cursor:pointer}button.sec{background:#fff;color:var(--green);border:1px solid var(--green)}button:disabled{opacity:.5}
.res{font-size:13px;margin-top:6px}.ok{color:var(--green)}.bad{color:var(--red)}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:6px}th,td{text-align:left;padding:5px 6px;border-bottom:1px solid var(--line)}th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--dim)}
.foot{font-size:12px;color:var(--dim);margin-top:18px}
</style></head><body><main>
<h1>Online ordering — go-live <span id="mode" class="badge none">…</span></h1>
<p class="sub">Each step turns green by itself when it is really done — the page checks every few seconds. Nothing here needs saving. <span id="until"></span></p>
<ol id="steps"></ol>
<h2 style="font-size:15px;margin:18px 0 0">Latest orders</h2><table><thead><tr><th>Ref</th><th>Status</th><th>Total</th><th>When (UTC)</th><th>Alert</th><th>MultiSafepay</th></tr></thead><tbody id="recent"></tbody></table>
<p class="foot" id="err"></p>
<p class="foot">Keys are checked against MultiSafepay, sealed with a secret only the ordering system holds, and stored in the café’s own database. This page shows no secret and expires on its own.</p>
</main>
<script>
var S=null;function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(m){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];});}
function act(id){ if(id==='key') return '<div class="act"><input id="k" type="password" autocomplete="off" spellcheck="false" placeholder="paste the website API key"><button onclick="installKey()">Install key</button></div><div class="res" id="r-key"></div>';
 if(id==='alert') return '<div class="act"><button onclick="testAlert()">Send test alert to the café inbox</button><input id="alt" type="email" placeholder="or another verified address (optional)" style="max-width:280px"><button class="sec" onclick="testAlert(true)">Send there</button></div><div class="res" id="r-alert"></div>';
 if(id==='test') return '<div class="act"><button onclick="testOrder()">Create €0,01 test payment</button></div><div class="res" id="r-test"></div>'; return ''; }
function render(){ var firstOpen=S.steps.findIndex(function(s){return !s.done;}); var ol=document.getElementById('steps'); var keep={};
 ol.querySelectorAll('input').forEach(function(i){keep[i.id]=i.value;}); var res={}; ol.querySelectorAll('.res').forEach(function(r){res[r.id]=r.innerHTML;});
 ol.innerHTML=S.steps.map(function(s,i){ return '<li class="'+(s.done?'done':(i===firstOpen?'now':''))+'"><div class="n">'+(s.done?'✓':(i+1))+'</div><h2>'+esc(s.title)+'</h2><div class="who">'+esc(s.who)+'</div><p>'+esc(s.detail)+'</p>'+(s.action&&!(s.done&&s.action!=='key'&&s.action!=='test')?act(s.action):'')+'</li>'; }).join('');
 Object.keys(keep).forEach(function(k){var i=document.getElementById(k); if(i) i.value=keep[k];}); Object.keys(res).forEach(function(k){var r=document.getElementById(k); if(r&&!r.innerHTML) r.innerHTML=res[k];});
 var m=document.getElementById('mode'); m.className='badge '+(S.mode||'none'); m.textContent=S.mode?S.mode.toUpperCase()+' platform':'no key yet';
 document.getElementById('until').textContent='This page stops working on '+new Date(S.until).toUTCString().slice(0,22)+' UTC.';
 document.getElementById('recent').innerHTML=S.recent.length?S.recent.map(function(o){return '<tr><td>'+esc(o.ref)+(o.test?' <span class="badge test">test</span>':'')+'</td><td>'+esc(o.status)+'</td><td>'+esc(o.total)+'</td><td>'+esc(o.at.slice(0,16).replace('T',' '))+'</td><td>'+(o.alert?'sent':'—')+'</td><td>'+esc(o.msp||'')+'</td></tr>';}).join(''):'<tr><td colspan="6" style="color:var(--dim)">none yet</td></tr>';
 document.getElementById('err').textContent=S.alert_last_error?'Last alert error: '+S.alert_last_error:''; }
function refresh(){ fetch('/golive/status',{cache:'no-store'}).then(function(r){ if(r.status===404){document.body.innerHTML='<main><h1>This page has expired.</h1></main>';throw 0;} return r.json(); }).then(function(s){S=s;render();}).catch(function(){}); }
function post(p,b){ return fetch(p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b||{})}).then(function(r){return r.json();}); }
function say(id,ok,msg){ var r=document.getElementById(id); if(r){ r.className='res '+(ok?'ok':'bad'); r.textContent=msg; } }
function installKey(){ var k=document.getElementById('k').value; say('r-key',true,'Checking with MultiSafepay…'); post('/golive/key',{key:k}).then(function(j){ if(j.ok){ document.getElementById('k').value=''; say('r-key',true,'Installed: '+j.hint+' on the '+j.mode.toUpperCase()+' platform. Methods: '+(j.gateways.length?j.gateways.join(', '):'none enabled yet')); } else say('r-key',false,j.error); refresh(); }); }
function testAlert(other){ var to=other?document.getElementById('alt').value:''; say('r-alert',true,'Sending…'); post('/golive/test-alert',to?{to:to}:{}).then(function(j){ say('r-alert',j.ok,j.ok?'Sent to '+j.to+'. Check the inbox (and spam) — if it is there, this step is done.':(j.error+(j.hint?' — '+j.hint:''))); refresh(); }); }
function testOrder(){ say('r-test',true,'Creating the order…'); post('/golive/test-order').then(function(j){ if(j.ok){ say('r-test',true,'Order '+j.public_ref+' created — the payment page opened in a new tab. Pay it; this line turns green when MultiSafepay confirms.'); window.open(j.payment_url,'_blank'); } else say('r-test',false,j.error); refresh(); }); }
refresh(); setInterval(refresh,5000);
</script></body></html>`;
