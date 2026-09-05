#!/usr/bin/env python3
# build-bestellen — ordering/bestellen.template.html + data/menu.json + src/tally.js + the category
# labels from menu.html's I18N → ordering/site/index.html (the sandbox page; later the bestellen.
# hostname's root). Static, self-contained; the Worker will serve the same menu from D1 (step 4).
import json,re,sys
menu=json.load(open('data/menu.json',encoding='utf-8'))['items']
tally=open('src/tally.js',encoding='utf-8').read()
I=json.loads(re.search(r'var I18N=(\{.*?\});\n',open('menu.html',encoding='utf-8').read(),re.S).group(1))
cats={l:{} for l in ('nl','en','de')}
for l in cats:
    for k,v in I[l].items():
        if k.startswith('c.'): cats[l][k[2:]]=v
        elif k.startswith('dc.'): cats[l][k[3:]]=v
slim=[{"id":m['id'],"kind":m['kind'],"cat":m['cat'],"name":m['name'],"desc":m['desc'],"price_cents":m['price_cents'],"vat_rate":m['vat_rate'],"orderable":m['orderable'],"orderable_note":m['orderable_note'] or ''} for m in menu]
t=open('ordering/bestellen.template.html',encoding='utf-8').read()
scene=open('ordering/art/terrace-tracing.svg',encoding='utf-8').read().strip()
t=t.replace('/*__SCENE__*/',scene).replace('/*__TALLY__*/',tally).replace('/*__MENU__*/[]',json.dumps(slim,ensure_ascii=False,separators=(',',':'))).replace('/*__CATS__*/{}',json.dumps(cats,ensure_ascii=False,separators=(',',':')))
out=sys.argv[1] if len(sys.argv)>1 else 'ordering/site/index.html'
open(out,'w',encoding='utf-8').write(t); print('wrote',out,len(t),'bytes',len(slim),'items')
