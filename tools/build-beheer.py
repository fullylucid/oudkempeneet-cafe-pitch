#!/usr/bin/env python3
# build-beheer — beheer/beheer.template.html + data/menu.json + the category labels from menu.html's
# I18N → beheer/site/index.html (the menu manager, sandbox only; later a route on the ordering
# Worker behind Cloudflare Access). Same shape as tools/build-bestellen.py on purpose: one template,
# one data file, no build step the café ever has to run.
import json,re,sys
menu=json.load(open('data/menu.json',encoding='utf-8'))['items']
I=json.loads(re.search(r'var I18N=(\{.*?\});\n',open('menu.html',encoding='utf-8').read(),re.S).group(1))
cats={}
for k,v in I['nl'].items():
    if k.startswith('c.'): cats[k[2:]]=v
    elif k.startswith('dc.'): cats[k[3:]]=v
slim=[{"id":m['id'],"kind":m['kind'],"cat":m['cat'],"pos":m['pos'],"name":m['name'],"desc":m['desc'],
       "price_cents":m['price_cents'],"vat_rate":m['vat_rate'],"orderable":m['orderable'],"orderable_note":m.get('orderable_note') or '',
       "prep_minutes":m.get('prep_minutes'),"sold_out_at":m.get('sold_out_at'),"options":m.get('options') or []} for m in menu]
t=open('beheer/beheer.template.html',encoding='utf-8').read()
t=t.replace('/*__MENU__*/[]',json.dumps(slim,ensure_ascii=False,separators=(',',':')))
t=t.replace('/*__CATS__*/{}',json.dumps({"nl":cats},ensure_ascii=False,separators=(',',':')))
out=sys.argv[1] if len(sys.argv)>1 else 'beheer/site/index.html'
open(out,'w',encoding='utf-8').write(t); print('wrote',out,len(t),'bytes',len(slim),'items')
