#!/usr/bin/env python3
# build-bestellen — ordering/bestellen.template.html + data/menu.json (items AND its cats: order, labels,
# notes) + src/tally.js → ordering/site/index.html (the sandbox page; later the bestellen.
# hostname's root). Static, self-contained; the Worker will serve the same menu from D1 (step 4).
# Usage: build-bestellen.py [out] [menu.json]   — the tests build from tests/fixtures/menu.json.
import json,sys
M=json.load(open(sys.argv[2] if len(sys.argv)>2 else 'data/menu.json',encoding='utf-8')); menu=M['items']
tally=open('src/tally.js',encoding='utf-8').read()
L=('nl','en','de')
cats={l:{c['id']:c['label'][l] for c in M['cats']} for l in L}
notes={l:{c['id']:c['note'][l] for c in M['cats'] if c.get('note')} for l in L}
order=[c['id'] for c in M['cats']]
slim=[{"id":m['id'],"kind":m['kind'],"cat":m['cat'],"name":m['name'],"desc":m['desc'],"price_cents":m['price_cents'],"vat_rate":m['vat_rate'],"orderable":m['orderable'],"orderable_note":m['orderable_note'] or '',"options":m.get('options') or []} for m in menu]
j=lambda v: json.dumps(v,ensure_ascii=False,separators=(',',':'))
t=open('ordering/bestellen.template.html',encoding='utf-8').read()
t=t.replace('/*__TALLY__*/',tally).replace('/*__MENU__*/[]',j(slim)).replace('/*__CATS__*/{}',j(cats)).replace('/*__NOTES__*/{}',j(notes)).replace('/*__ORDER__*/[]',j(order))
out=sys.argv[1] if len(sys.argv)>1 else 'ordering/site/index.html'
open(out,'w',encoding='utf-8').write(t); print('wrote',out,len(t),'bytes',len(slim),'items')
