#!/usr/bin/env python3
# extract-menu — menu.html (the client-verified trilingual page) → data/menu.json.
# Run from the repo root: python3 tools/extract-menu.py data/menu.json
# D1 is the menu's truth from the seed onward (gate cond. 8); this script only produces the seed input.
# VAT: food 9%, hot/soft drinks 9%, alcohol 21%; per-item overrides: Irish Coffee 21, any 0.0 beer 9.
# Orderable default: everything except draught beer and the fondue (reservation-only).
import json,re,sys,collections,os
src=open('menu.html',encoding='utf-8').read()
m=re.search(r'var I18N=(\{.*?\});\n',src,re.S); I18N=json.loads(m.group(1))
langs=['nl','en','de']
# order of items = order of data-i18n .n keys in the page
order=re.findall(r'data-i18n="([md]\.[a-z]+\.\d+)\.n"',src)
seen=set(); order=[k for k in order if not (k in seen or seen.add(k))]
def price_cents(s):
    s=s.replace('€','').replace(' ',' ').strip()
    parts=re.findall(r'\d+[.,]\d{2}',s)
    return [int(p.replace('.','').replace(',','')) for p in parts], s
cat_label={}
for k,v in I18N['nl'].items():
    if k.startswith('c.') or k.startswith('dc.') or k.startswith('cat.'): cat_label[k]=v
# drink category headers: find keys in page around d.* groups
dheads=re.findall(r'data-i18n="(d[a-z]*\.[a-z]+)"',src)
items=[]; anomalies=[]
for key in order:
    kind,cat,idx=key.split('.')
    name={l:I18N[l].get(key+'.n') for l in langs}; desc={l:I18N[l].get(key+'.d') for l in langs}
    pr=I18N['nl'].get(key+'.p') or ''
    cents,raw=price_cents(pr)
    if len(cents)!=1: anomalies.append((key,name['nl'],raw))
    for l in langs:
        if not name[l]: anomalies.append((key,'missing name '+l,''))
    nm=name['nl'].lower()
    # VAT: food 9; drinks: hot/soft 9; beer/wine/spirit/cocktail 21; corrections
    if kind=='m' or cat in ('hot','soft'): vat=9
    else: vat=21
    if 'irish' in nm and 'coffee' in nm: vat=21
    if cat=='beer' and re.search(r'\b0[.,]0\b',nm): vat=9
    # orderable default: exclude draught and fondue
    orderable=True; why=''
    if cat=='beer' and re.search(r'tap|van de tap|draught|fluitje|vaas|pul\b',nm): orderable=False; why='draught'
    if 'fondue' in nm: orderable=False; why='reservation-only, 1 day ahead'
    items.append({"id":key.replace('.','-'),"kind":"food" if kind=='m' else "drink","cat":cat,"pos":int(idx),
                  "name":name,"desc":{l:(desc[l] or None) for l in langs},"price_cents":cents[0] if cents else None,"price_raw":raw,
                  "vat_rate":vat,"orderable":orderable,"orderable_note":why})
# per-dish choices (data/options.json) resolved onto the item, so menu.json stays the one artifact
# the page and the D1 seed both read. A group marked source:"implied" is NOT written on the café's
# menu — it needs the café's word before go-live.
opt=json.load(open(os.path.join(os.path.dirname(__file__),'..','data','options.json'),encoding='utf-8'))
G={g['id']:g for g in opt['groups']}
unknown=[k for k in opt['items'] if k not in {i['id'] for i in items}]
if unknown: raise SystemExit('options.json names items that are not on the menu: %s'%unknown)
for i in items:
    ids=opt['items'].get(i['id'],[])
    for gid in ids:
        if gid not in G: raise SystemExit('options.json: item %s wants unknown group %s'%(i['id'],gid))
    i['options']=[G[gid] for gid in ids]
print('choices:',[(i['id'],i['name']['nl'],[g['id'] for g in i['options']]) for i in items if i['options']])
print('implied (café must confirm):',sorted({g['id'] for i in items for g in i['options'] if g['source']=='implied'}))
print('items',len(items),'food',sum(i['kind']=='food' for i in items),'drink',sum(i['kind']=='drink' for i in items))
print('cats',collections.Counter(i['cat'] for i in items))
print('vat',collections.Counter((i['kind'],i['vat_rate']) for i in items))
print('not orderable:',[(i['id'],i['name']['nl'],i['orderable_note']) for i in items if not i['orderable']])
print('vat overrides:',[(i['id'],i['name']['nl'],i['vat_rate']) for i in items if (i['cat']=='hot' and i['vat_rate']==21) or (i['cat']=='beer' and i['vat_rate']==9)])
print('anomalies:',anomalies)
print('drink heads:',dheads[:12])
json.dump({"source":"menu.html client/main 3af8052","extracted":"2026-09-04","items":items},open(sys.argv[1],'w'),ensure_ascii=False,indent=1)
