/* tally.js — THE one totals function (gate condition 6). Used verbatim by the ordering page (inlined at
 * build) and by the Worker (step 4). Integer cents only. VAT per rate bucket from that bucket's
 * INCLUSIVE subtotal, rounded once to the cent — never a sum of per-line roundings.
 *
 * tally(lines, menuById, limits) → { ok, error, lines:[{id,qty,unit,vat,sub,note}], sub9, sub21, vat9, vat21, total, alcohol }
 *   lines:    [{ id, qty, note? }]           — what the browser sends; prices are NEVER taken from it
 *   menuById: { id: { price_cents, vat_rate, orderable, kind } }
 *   limits:   { maxLines, maxQty, maxTotalCents, minOrderCents }
 * error codes (localised by the caller): empty, unknown_item, not_orderable, bad_qty, too_many_lines, over_max_total, under_minimum
 */
function tally(lines, menuById, limits) {
  var L = Object.assign({ maxLines: 50, maxQty: 20, maxTotalCents: 50000, minOrderCents: 0 }, limits || {});
  var out = { ok: false, error: null, lines: [], sub9: 0, sub21: 0, vat9: 0, vat21: 0, total: 0, alcohol: false };
  if (!Array.isArray(lines) || lines.length === 0) { out.error = 'empty'; return out; }
  if (lines.length > L.maxLines) { out.error = 'too_many_lines'; return out; }
  for (var i = 0; i < lines.length; i++) {
    var ln = lines[i] || {}, m = menuById[ln.id];
    if (!m) { out.error = 'unknown_item'; return out; }
    if (!m.orderable) { out.error = 'not_orderable'; return out; }
    var qty = ln.qty;
    if (typeof qty !== 'number' || qty !== Math.floor(qty) || qty < 1 || qty > L.maxQty) { out.error = 'bad_qty'; return out; }
    var sub = m.price_cents * qty;
    if (m.vat_rate === 9) out.sub9 += sub; else if (m.vat_rate === 21) out.sub21 += sub; else { out.error = 'unknown_item'; return out; }
    if (m.kind === 'drink' && m.vat_rate === 21) out.alcohol = true;
    out.lines.push({ id: ln.id, qty: qty, unit: m.price_cents, vat: m.vat_rate, sub: sub, note: typeof ln.note === 'string' ? ln.note.slice(0, 200) : '' });
  }
  out.vat9 = Math.round(out.sub9 * 9 / 109);
  out.vat21 = Math.round(out.sub21 * 21 / 121);
  out.total = out.sub9 + out.sub21;
  if (out.total > L.maxTotalCents) { out.error = 'over_max_total'; return out; }
  if (out.total < L.minOrderCents) { out.error = 'under_minimum'; return out; }
  out.ok = true; return out;
}
if (typeof module !== 'undefined' && module.exports) module.exports = { tally: tally };
