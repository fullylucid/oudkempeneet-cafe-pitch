// The MultiSafepay key at rest. Ruling Q11: the key goes in through the go-live page, never through
// Merritt's hands. The Worker checks it against MultiSafepay, seals it with SEAL_KEY (a Worker
// secret nobody can read back) and keeps only the sealed copy in the café's D1. Reading D1 alone
// yields ciphertext; reading the secret alone yields nothing. Both halves live in the café's own
// account. AES-256-GCM, fresh IV per seal.
const enc = new TextEncoder(), dec = new TextDecoder();
function hexToBytes(h) { const b = new Uint8Array(h.length / 2); for (let i = 0; i < b.length; i++) b[i] = parseInt(h.substr(i * 2, 2), 16); return b; }
export function b64(bytes) { let s = ''; for (const x of new Uint8Array(bytes)) s += String.fromCharCode(x); return btoa(s); }
export function unb64(s) { const bin = atob(s); const b = new Uint8Array(bin.length); for (let i = 0; i < b.length; i++) b[i] = bin.charCodeAt(i); return b; }
async function aesKey(hex) {
  if (!/^[0-9a-f]{64}$/i.test(hex || '')) throw new Error('SEAL_KEY must be 32 bytes hex');
  return crypto.subtle.importKey('raw', hexToBytes(hex), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function seal(hex, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(hex), enc.encode(plaintext));
  return b64(iv) + '.' + b64(ct);
}
export async function unseal(hex, sealed) {
  const [iv, ct] = String(sealed).split('.');
  return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(hex), unb64(ct)));
}
// A derived, non-reversible value for the go-live cookie: the browser holds this, never the token.
export async function derive(hex, label) {
  const k = await crypto.subtle.importKey('raw', hexToBytes(hex), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex2(await crypto.subtle.sign('HMAC', k, enc.encode(label)));
}
export function hex2(buf) { return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join(''); }
export function timingSafeEqual(a, b) {
  a = String(a); b = String(b); if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
