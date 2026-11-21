#!/usr/bin/env python3
# build-beheer — beheer/beheer.template.html + data/menu.json (items AND its cats) → beheer/site/index.html
# (the menu manager, sandbox only; later a route on the ordering Worker behind Cloudflare Access).
# Same shape as tools/build-bestellen.py on purpose: one template, one data file, no build step the
# café ever has to run. Usage: build-beheer.py [out] [menu.json] — the tests build from the fixture.
import json,sys
M=json.load(open(sys.argv[2] if len(sys.argv)>2 else 'data/menu.json',encoding='utf-8')); menu=M['items']
cats={l:{c['id']:c['label'][l] for c in M['cats']} for l in ('nl','en','de')}
order=[c['id'] for c in M['cats']]
slim=[{"id":m['id'],"kind":m['kind'],"cat":m['cat'],"pos":m['pos'],"name":m['name'],"desc":m['desc'],
       "price_cents":m['price_cents'],"vat_rate":m['vat_rate'],"orderable":m['orderable'],"orderable_note":m.get('orderable_note') or '',
       "prep_minutes":m.get('prep_minutes'),"sold_out_at":m.get('sold_out_at'),"options":m.get('options') or []} for m in menu]
j=lambda v: json.dumps(v,ensure_ascii=False,separators=(',',':'))
t=open('beheer/beheer.template.html',encoding='utf-8').read()
t=t.replace('/*__MENU__*/[]',j(slim)).replace('/*__CATS__*/{}',j(cats)).replace('/*__ORDER__*/[]',j(order))
# --live <dir>: the real manager, served by the ordering Worker at /beheer/menu. Same template, no menu
# baked in (it asks the Worker), and split into menu.html + menu.css + menu.js because the Worker's
# Content-Security-Policy allows no inline script or style.
if len(sys.argv)>1 and sys.argv[1]=='--live':
    import re,os
    d=sys.argv[2] if len(sys.argv)>2 else 'ordering/site/beheer'
    t=open('beheer/beheer.template.html',encoding='utf-8').read().replace('/*__LIVE__*/false','true')
    css=re.search(r'<style>\n?(.*?)</style>',t,re.S); js=re.search(r'<script>\n?(.*?)</script>',t,re.S)
    assert css and js and t.count('<style')==1 and t.count('<script')==1, 'the template must hold exactly one <style> and one <script>'
    html=t.replace(css.group(0),'<link rel="stylesheet" href="/beheer/menu.css">').replace(js.group(0),'<script src="/beheer/menu.js"></script>')
    assert ' style=' not in html and '<script>' not in html, 'inline style or script left in the live page'
    for name,body in (('menu.html',html),('menu.css',css.group(1)),('menu.js',js.group(1))):
        open(os.path.join(d,name),'w',encoding='utf-8').write(body)
    print('wrote',d+'/menu.{html,css,js}',len(html),len(css.group(1)),len(js.group(1)),'bytes'); sys.exit(0)
out=sys.argv[1] if len(sys.argv)>1 else 'beheer/site/index.html'
open(out,'w',encoding='utf-8').write(t); print('wrote',out,len(t),'bytes',len(slim),'items')
