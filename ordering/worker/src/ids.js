// Identifiers. The order id is the only lookup key (gate cond. 5): long, random, unguessable.
// The public ref is for humans — the subject line, the ticket, the phone call — never a key.
const B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const REF = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O, 1/I: read out loud over a counter
function pick(alphabet, n) {
  const b = new Uint8Array(n); crypto.getRandomValues(b); let s = '';
  for (let i = 0; i < n; i++) s += alphabet[b[i] % alphabet.length];
  return s;
}
export function newOrderId() { return pick(B62, 24); }
export function newPublicRef() { return pick(REF, 4); }
export const ORDER_ID_RE = /^[A-Za-z0-9]{24}$/;
export function eur(c) { return '€ ' + Math.floor(c / 100) + ',' + String(c % 100).padStart(2, '0'); }
