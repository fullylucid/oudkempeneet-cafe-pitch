// Email, behind one function (gate cond. 9). Today: the café's order alert in Dutch (Q27) through
// Cloudflare Email Routing's send binding — the zone already runs Email Routing with SPF/DKIM/DMARC,
// the address is on the café's own domain, and Cloudflare only delivers to a destination its owner
// has verified. Customer confirmations (Q2: Resend on the client's account) plug in here later
// without touching the callers.
import { eur } from './ids.js';
import { readyAt } from './hours.js';

function b64chunks(s) { const b = btoa(unescape(encodeURIComponent(s))); return b.replace(/.{76}/g, '$&\r\n'); }
function encWord(s) { return /^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + btoa(unescape(encodeURIComponent(s))) + '?='; }
export function buildMime({ from, fromName, to, subject, text, messageId }) {
  const id = messageId || (crypto.randomUUID() + '@' + from.split('@')[1]);
  return [
    'From: ' + encWord(fromName) + ' <' + from + '>',
    'To: ' + to,
    'Subject: ' + encWord(subject),
    'Date: ' + new Date().toUTCString(),
    'Message-ID: <' + id + '>',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '', b64chunks(text), ''].join('\r\n');
}
// The one sender. Throws with a readable message; callers record the attempt.
export async function sendMail(env, { to, subject, text }) {
  const from = env.MAIL_FROM || 'bestellen@oudkempeneetcafe.nl';
  const raw = buildMime({ from, fromName: env.CAFE_NAME || 'Oud-Kempen Eetcafé', to, subject, text });
  const { EmailMessage } = await import('cloudflare:email');
  await env.EMAIL.send(new EmailMessage(from, to, raw));
}
// The ticket the café prints from its inbox. Dutch, plain text, everything on it (proposal §7).
export function alertText(env, order, items, msp) {
  const ready = readyAt(order.created_at, order.pickup_eta_min);
  const lines = items.map(l => {
    const sub = (l.unit_price_cents + l.options_cents) * l.qty;
    return '  ' + l.qty + ' x ' + l.name_snapshot + (l.options_snapshot ? ' (' + l.options_snapshot + ')' : '') + '  ' + eur(sub) +
      (l.line_note ? '\n      opmerking: ' + l.line_note : '');
  });
  return [
    'NIEUWE AFHAALBESTELLING  ' + order.public_ref,
    'Klaar om ongeveer ' + ready + ' (besteld ' + new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit' }).format(new Date(order.created_at)) + ', wachttijd ' + order.pickup_eta_min + ' min)',
    '',
    ...lines,
    order.order_note ? '\nOpmerking bij de bestelling: ' + order.order_note : '',
    '',
    'Totaal betaald: ' + eur(order.total_cents) + '  (waarvan btw 9%: ' + eur(order.vat_low_cents) + (order.vat_high_cents ? ', btw 21%: ' + eur(order.vat_high_cents) : '') + ')',
    'Betaald via ' + (msp && msp.method ? msp.method : 'MultiSafepay') + (msp && msp.transaction_id ? ' — MultiSafepay transactie ' + msp.transaction_id : ''),
    '',
    'Klant: ' + (order.customer_name || '-'),
    'Telefoon: ' + (order.customer_phone || '-'),
    'E-mail: ' + (order.customer_email || '-'),
    'Taal: ' + order.lang,
    '',
    'Bestelnummer voor de klant: ' + order.public_ref + '. Terugbetalen of annuleren: in het MultiSafepay-dashboard, op de transactie hierboven.',
    env.MAIL_FOOT || '',
  ].filter(x => x !== null && x !== undefined).join('\n');
}
export function alertSubject(order) {
  return 'Afhaalbestelling ' + order.public_ref + ' — ' + eur(order.total_cents) + ' — klaar om ' + readyAt(order.created_at, order.pickup_eta_min);
}
