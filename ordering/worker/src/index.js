// bestellen.oudkempeneetcafe.nl — the ordering Worker. Static page from ../site (built by
// tools/build-bestellen.py), API and the customer's return pages here, the go-live page while it is open.
import { createOrder, orderStatus, notify, reconcile, json } from './orders.js';
import { klaar, geannuleerd } from './pages.js';
import { golive, LIVE_HOST } from './golive.js';
import { loadSettings, setSetting, getMsp } from './db.js';

let liveSeen = false;
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url), p = url.pathname, m = request.method;
    if (!liveSeen && url.host === LIVE_HOST) { liveSeen = true; ctx.waitUntil(markLive(env)); }   // step 6 on the go-live page turns green by itself
    try {
      if (p === '/robots.txt') return new Response(url.host === LIVE_HOST ? 'User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /klaar/\nDisallow: /golive\n' : 'User-agent: *\nDisallow: /\n', { headers: { 'content-type': 'text/plain' } });
      if (p === '/api/orders' && m === 'POST') return await createOrder(request, env);
      if (p.startsWith('/api/orders/') && m === 'GET') return await orderStatus(env, p.slice('/api/orders/'.length));
      if (p === '/api/msp/notify' && (m === 'POST' || m === 'GET')) return await notify(request, env);
      if (p === '/api/health' && m === 'GET') return await health(env, url);
      if (p.startsWith('/klaar/')) return await klaar(env, p.slice(7));
      if (p.startsWith('/geannuleerd/')) return await geannuleerd(env, p.slice(13));
      if (p === '/golive' || p.startsWith('/golive/')) return await golive(request, env, p);
      if (p.startsWith('/api/')) return json({ error: 'not_found' }, 404);
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error(p, String(e && e.stack || e));
      return p.startsWith('/api/') ? json({ error: 'server' }, 500) : new Response('Er ging iets mis. Bel ons: ' + (env.CAFE_PHONE || ''), { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(reconcile(env).then(r => console.log('reconcile', JSON.stringify(r)))); },
};
async function markLive(env) { const s = await loadSettings(env); if (!s.custom_host_seen_at) await setSetting(env, 'custom_host_seen_at', new Date().toISOString()); }
// Public, secret-free: enough for a watcher to tell "up, key present, which platform".
async function health(env, url) {
  const settings = await loadSettings(env), msp = await getMsp(env, settings);
  const menu = await env.DB.prepare('select count(*) n from menu_items where orderable=1 and archived_at is null').first();
  return json({ ok: true, host: url.host, mode: msp ? msp.mode : null, menu_items: menu ? menu.n : 0, alerts_to_verified_inbox: !!settings.alert_verified_at, golive_open: Date.parse(env.GOLIVE_UNTIL || '') > Date.now() && !!env.SETUP_TOKEN });
}
