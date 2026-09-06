/* tally.js — THE one totals function (gate condition 6). Used verbatim by the ordering page (inlined at
 * build) and by the Worker (step 4). Integer cents only. VAT per rate bucket from that bucket's
 * INCLUSIVE subtotal, rounded once to the cent — never a sum of per-line roundings.
 *
 * tally(lines, menuById, limits) → { ok, error, missing, lines:[{id,qty,unit,vat,sub,note,opts}], sub9, sub21, vat9, vat21, total, alcohol }
 *   lines:    [{ id, qty, note?, opts? }]    — what the browser sends; prices are NEVER taken from it
 *                                              opts = { <groupId>: <optionId> }, e.g. { 'bami-nasi': 'nasi' }
 *   menuById: { id: { price_cents, vat_rate, orderable, kind, options? } }
 *                options = [{ id, required, options:[{id}] }] — a dish's choices (data/options.json)
 *   limits:   { maxLines, maxQty, maxTotalCents, minOrderCents }
 * error codes (localised by the caller): empty, unknown_item, not_orderable, bad_qty, too_many_lines, over_max_total, under_minimum, missing_choice
 *
 * A required choice the customer has not made (or an option id that is not on that dish) is
 * missing_choice: the totals are still computed so the cart can show them, but ok is false and
 * `missing` lists [{ id, group }] so the caller can point at the dish. The kitchen must never be
 * handed a Sajoer Lodeh with no side, and the browser is not trusted to enforce that.
 */
function tally(lines, menuById, limits) {
  var L = Object.assign({ maxLines: 50, maxQty: 20, maxTotalCents: 50000, minOrderCents: 0 }, limits || {});
  var out = { ok: false, error: null, missing: [], lines: [], sub9: 0, sub21: 0, vat9: 0, vat21: 0, total: 0, alcohol: false };
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
    var groups = Array.isArray(m.options) ? m.options : [], chosen = [];
    for (var g = 0; g < groups.length; g++) {
      var grp = groups[g], want = (ln.opts && typeof ln.opts === 'object') ? ln.opts[grp.id] : undefined, valid = '';
      for (var o = 0; o < grp.options.length; o++) if (grp.options[o].id === want) valid = want;
      if (valid) chosen.push({ group: grp.id, option: valid });
      else if (grp.required !== false) out.missing.push({ id: ln.id, group: grp.id });
    }
    out.lines.push({ id: ln.id, qty: qty, unit: m.price_cents, vat: m.vat_rate, sub: sub, note: typeof ln.note === 'string' ? ln.note.slice(0, 200) : '', opts: chosen });
  }
  out.vat9 = Math.round(out.sub9 * 9 / 109);
  out.vat21 = Math.round(out.sub21 * 21 / 121);
  out.total = out.sub9 + out.sub21;
  if (out.total > L.maxTotalCents) { out.error = 'over_max_total'; return out; }
  if (out.total < L.minOrderCents) { out.error = 'under_minimum'; return out; }
  if (out.missing.length) { out.error = 'missing_choice'; return out; }
  out.ok = true; return out;
}
if (typeof module !== 'undefined' && module.exports) module.exports = { tally: tally };
