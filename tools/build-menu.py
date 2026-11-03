#!/usr/bin/env python3
# build-menu — data/takeaway.json (Dave's takeaway card, hand-transcribed) → data/menu.json, the one
# artifact the bestellen page, the menu manager, the VAT sheet and the D1 seed all read.
# Run from the repo root: python3 tools/build-menu.py
# The takeaway menu is its own menu (own prices, own dishes — msg 136); the restaurant page
# menu.html no longer feeds ordering. D1 is the menu's truth from the seed onward (gate cond. 8).
import json,subprocess,datetime,collections
S=json.load(open('data/takeaway.json',encoding='utf-8'))
L=('nl','en','de')
cats=[c['id'] for c in S['cats']]
G={g['id']:g for g in S['groups']}
errs=[]
for g in S['groups']:   # an option's surcharge is integer cents >= 0 (sauces on top of a portion, msg 143)
    for o in g['options']:
        if not (isinstance(o.get('price_cents'),int) and o['price_cents']>=0): errs.append('choice %s/%s: bad price'%(g['id'],o['id']))
if len(set(cats))!=len(cats): errs.append('duplicate category')
if len({i['id'] for i in S['items']})!=len(S['items']): errs.append('duplicate item id')
pos=collections.Counter(); items=[]
for i in S['items']:
    if i['cat'] not in cats: errs.append('%s: unknown category %s'%(i['id'],i['cat']))
    for l in L:
        if not i['name'].get(l): errs.append('%s: no %s name'%(i['id'],l))
    if not (isinstance(i['price_cents'],int) and i['price_cents']>0): errs.append('%s: bad price'%i['id'])
    for gid in i['options']:
        if gid not in G: errs.append('%s: unknown choice %s'%(i['id'],gid))
    c=i['price_cents']; on=i.get('orderable',True)   # a sauce is on the card but sold only as a choice on a product
    if not on and i['options']: errs.append('%s: not orderable but has choices'%i['id'])
    items.append({"id":i['id'],"kind":"food","cat":i['cat'],"pos":pos[i['cat']],"name":i['name'],
                  "desc":{l:i['desc'].get(l) for l in L},"price_cents":c,"price_raw":'%d,%02d'%(c//100,c%100),
                  "vat_rate":9,"orderable":on,"orderable_note":'' if on else i['orderable_note'],"options":[G[g] for g in i['options']]})
    pos[i['cat']]+=1
if errs: raise SystemExit('takeaway.json: '+'; '.join(errs))
# provenance is derived, never typed: the git blob of the exact takeaway.json read (content-addressed,
# so it survives a squash merge and tests/test_menu.py can check it), plus the date of the last
# commit touching it — or today, when it has uncommitted edits.
def git(*a): return subprocess.run(['git',*a],capture_output=True,text=True,check=True).stdout.strip()
blob=git('hash-object','data/takeaway.json')[:12]
dirty=subprocess.run(['git','diff','--quiet','HEAD','--','data/takeaway.json']).returncode!=0
day=(not dirty and git('log','-1','--format=%cs','--','data/takeaway.json')) or datetime.date.today().isoformat()   # never committed = today
json.dump({"source":"data/takeaway.json blob %s"%blob,"extracted":day,"cats":S['cats'],"items":items},
          open('data/menu.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
print('items',len(items),dict(collections.Counter(i['cat'] for i in items)),'with choices',sum(1 for i in items if i['options']))
