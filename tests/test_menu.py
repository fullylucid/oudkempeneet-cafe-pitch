#!/usr/bin/env python3
"""The café's takeaway menu: data/takeaway.json (Dave's card) ↔ data/menu.json ↔ migrations agree.
Run: python3 tests/test_menu.py (from repo root). The ordering MECHANICS are pinned elsewhere, against
the frozen tests/fixtures/menu.json — this file checks only what the café actually sells."""
import json,sqlite3,sys,glob,subprocess
fails=[]
def check(cond,msg):
    if not cond: fails.append(msg)
M=json.load(open('data/menu.json',encoding='utf-8')); menu=M['items']
S=json.load(open('data/takeaway.json',encoding='utf-8'))
# provenance: menu.json names the exact takeaway.json it came from, and the newest seed names menu.json's
blob=subprocess.run(['git','hash-object','data/takeaway.json'],capture_output=True,text=True).stdout.strip()[:12]
check(M['source']=='data/takeaway.json blob '+blob,'menu.json was built from another takeaway.json (%s, now %s): rerun tools/build-menu.py'%(M['source'],blob))
newest=sorted(glob.glob('migrations/*seed*.sql'))[-1]
check(M['source'] in open(newest,encoding='utf-8').readline(),'%s was not generated from this menu.json: rerun tools/gen-seed.py'%newest)
by={i['id']:i for i in menu}
check(len(menu)==49 and len(by)==49,'49 items with unique ids, got %d/%d'%(len(menu),len(by)))
# the card, price by price (msg 136) — a transcription slip fails here, not at the till
CARD={'pizza-margherita':1250,'pizza-funghi':1350,'pizza-salame':1395,'pizza-hawaii':1450,'pizza-prosciutto-funghi':1500,
 'pizza-quattro-stagioni':1500,'pizza-quattro-formaggi':1500,'pizza-pepperoni':1500,'pizza-diavola':1500,'pizza-caprese':1500,
 'pizza-napoli':1500,'pizza-tonno':1500,'pizza-shoarma':1500,'pizza-bbq-chicken':1500,'pizza-salmon':1500,
 'indo-beef-rendang':2095,'indo-ajam-pedis':1995,'indo-ajam-cashew':1995,'indo-ajam-bali-roedjak':1995,'indo-kipsate':1995,
 'indo-vega-rendang':1695,'indo-sajoer-lodeh':1695,'indo-nasi-goreng-schotel':1995,'indo-bami-goreng-schotel':1995,
 'friet-klein':275,'friet-normaal':350,'friet-groot':450,
 'saus-mayonaise':50,'saus-ketchup':50,'saus-curry':50,'saus-mosterd':50,'saus-knoflook':75,'saus-pinda':100,'saus-speciaal':100,'saus-oorlog':125,
 'snack-frikandel':265,'snack-kroket':275,'snack-kaassouffle':275,'snack-kipcorn':300,'snack-mexicano':325,'snack-bamischijf':300,'snack-sate-ajam':825,'snack-broodje':110,
 'borrel-bittergarnituur':750,'borrel-bitterballen':750,'borrel-chicken-wings':850,'borrel-kipnuggets':595,'borrel-kaassouffle-mini':750,'borrel-vlammetjes':750}
check(set(CARD)==set(by),'menu ids are exactly the card: missing %s, extra %s'%(sorted(set(CARD)-set(by)),sorted(set(by)-set(CARD))))
for k,v in CARD.items():
    if k in by: check(by[k]['price_cents']==v,'%s costs %d on the card, %d here'%(k,v,by[k]['price_cents']))
check([i['id'] for i in menu if i['cat']=='pizza'][:4]==['pizza-margherita','pizza-funghi','pizza-salame','pizza-hawaii'],'pizzas keep the card order')
for i in menu:
    for l in ('nl','en','de'): check(i['name'][l],'%s has a %s name'%(i['id'],l))
    check(i['vat_rate']==9 and i['kind']=='food','%s: food, 9%% — the card sells no drinks'%i['id'])
    # sauces and the roll are on the card but sold only as a choice on a product (msg 143)
    asopt=i['cat']=='saus' or i['id']=='snack-broodje'
    check(i['orderable']==(not asopt) and (asopt or not i['orderable_note']),'%s: orderable on its own %s'%(i['id'],'NO — it is a choice' if asopt else 'yes'))
cats=[c['id'] for c in M['cats']]
check(cats==['pizza','indo','friet','saus','snack','borrel'],'categories in card order, got %s'%cats)
check(all(any(i['cat']==c for i in menu) for c in cats),'no empty category')
saus=[c for c in M['cats'] if c['id']=='saus'][0]
check(all((saus['note'] or {}).get(l) for l in ('nl','en','de')) and saus['note']['nl']=='Maximaal 2 sauzen per portie. Sauzen worden apart berekend.','the sauces carry the card\'s "Maximaal 2 sauzen per portie" in all three languages')
# ---- per-dish choices: only what the card prints ----
def gids(i): return [g['id'] for g in i['options']]
NB=['indo-beef-rendang','indo-ajam-pedis','indo-ajam-cashew','indo-ajam-bali-roedjak','indo-kipsate','indo-vega-rendang','indo-sajoer-lodeh']
check(sorted(i['id'] for i in menu if 'nasi-bami' in gids(i))==sorted(NB),'the seven "Keuze uit nasi goreng of bami goreng" dishes carry the choice, the plates do not')
for i in menu:
    if i['id'] in NB:
        check(gids(i)==['nasi-bami'],'%s asks only nasi or bami'%i['id'])
        d=(i['desc']['nl'] or '').lower(); check('nasi goreng' in d and 'bami goreng' in d,'%s: the choice is written in its own description — do not invent choices'%i['id'])
    elif i['cat']=='friet' or i['cat']=='borrel' or (i['cat']=='snack' and i['orderable']):
        # msg 143: at most two sauces per portion / snack / product — two optional sauce questions, structurally
        want=(['broodje'] if i['cat']=='snack' else [])+['saus1','saus2']
        check(gids(i)==want,'%s asks %s, got %s'%(i['id'],want,gids(i)))
    else: check(gids(i)==[],'%s asks nothing'%i['id'])
# a sauce choice costs exactly what the card charges for that sauce; the roll costs the card's +€1,10
G={g['id']:g for g in S['groups']}
card_sauce=[(i['id'][5:],i['price_cents'],i['name']['nl']) for i in menu if i['cat']=='saus']
for gid in ('saus1','saus2'):
    check(not G[gid]['required'],'%s is optional (zero sauces is allowed)'%gid)
    check([(o['id'],o['price_cents'],o['label']['nl']) for o in G[gid]['options']]==card_sauce,'%s offers the card\'s sauces at the card\'s prices'%gid)
check(not G['broodje']['required'] and [(o['id'],o['price_cents']) for o in G['broodje']['options']]==[('broodje',CARD['snack-broodje'])],'the roll is an optional +€1,10')
check(all(o['price_cents']==0 for o in G['nasi-bami']['options']),'nasi or bami costs nothing extra')
for g in S['groups']:
    check(g['source']=='menu','group %s comes from the card (nothing implied on the takeaway menu)'%g['id'])
    check(len(g['options'])>=(2 if g['required'] else 1) and len({o['id'] for o in g['options']})==len(g['options']),'group %s: distinct options, two or more when the answer is required'%g['id'])
    for o in g['options']:
        for l in ('nl','en','de'): check(o['label'].get(l),'option %s/%s has a %s label'%(g['id'],o['id'],l))
# no template keeps its own category list any more — a category missing from one never rendered
for f in ('ordering/bestellen.template.html','beheer/beheer.template.html','tools/gen-vat-sheet.py'):
    check("'indo'" not in open(f,encoding='utf-8').read(),'%s hard-codes a category list again'%f)

db=sqlite3.connect(':memory:')
for f in sorted(glob.glob('migrations/*.sql')): db.executescript(open(f,encoding='utf-8').read())
n=db.execute('select count(*) from menu_items').fetchone()[0]; check(n==49,'seed rows %d'%n)
for f in sorted(glob.glob('migrations/*.sql')): db.executescript(open(f,encoding='utf-8').read())   # idempotent
check(db.execute('select count(*) from menu_items').fetchone()[0]==49,'seed idempotent')
check(db.execute("select price_cents,vat_rate,orderable from menu_items where id='pizza-margherita'").fetchone()==(1250,9,1),'D1 Margherita row: the takeaway price')
check(db.execute("select count(*) from menu_items where orderable=0").fetchone()[0]==9,'only the 8 sauces and the roll are not orderable on their own')
check(db.execute("select value from settings where key='standard_wait_min'").fetchone()[0]=='45','settings seeded')
check(db.execute("select value from settings where key='strip_contact_after_days'").fetchone()[0]=='0','retention = never (Q15 = b)')
db.execute("insert into orders(id,public_ref,lang,subtotal_cents,vat_low_cents,vat_high_cents,total_cents,pickup_eta_min) values('o1','ABCD','nl',1250,103,0,1250,45)")
db.execute("insert into order_items(order_id,line,item_id,qty,unit_price_cents,vat_rate,name_snapshot,line_note) values('o1',1,'pizza-margherita',1,1250,9,'Margherita','extra krokant')")
check(db.execute("select line_note from order_items where order_id='o1'").fetchone()[0]=='extra krokant','line_note column (Q23 = a)')
# choices are ROWS, not a blob on the item — Part Two's manager edits one option at a time
n_opt=db.execute("select count(*) from item_options").fetchone()[0]
want=sum(len(g['options']) for i in menu for g in (i.get('options') or []))
check(n_opt==want,'every option is a row in D1 (%d, want %d)'%(n_opt,want))
check(db.execute("select count(distinct item_id) from item_options").fetchone()[0]==23,'23 products carry choices in D1 (7 nasi/bami, 3 fries, 7 snacks, 6 appetizers)')
r=db.execute("select group_nl,label_nl,required,source,price_cents from item_options where item_id='indo-sajoer-lodeh' and option_id='nasi'").fetchone()
check(r==('Nasi goreng of bami goreng?','Nasi goreng',1,'menu',0),'a choice row carries its question, its answer, its source and a zero surcharge (got %r)'%(r,))
check(db.execute("select count(*) from item_options where item_id='pizza-margherita'").fetchone()[0]==0,'a dish with no choice has no rows')
check({r[0] for r in db.execute("select distinct group_id from item_options where price_cents<>0")}=={'saus1','saus2','broodje'},'only sauces and the roll cost money (msg 143)')
check(db.execute("select price_cents from item_options where item_id='friet-normaal' and group_id='saus2' and option_id='oorlog'").fetchone()==(125,),'D1 carries the sauce surcharge on the portion')
check([x[0] for x in db.execute("select option_id from item_options where item_id='indo-beef-rendang' order by option_pos")]==['nasi','bami'],'option order survives the seed (the card says Nasi first)')
# --- Part Two columns are present BEFORE the schema freezes (PR #76, P2) ---
cols={r[1] for r in db.execute("pragma table_info(menu_items)")}
for c in ('prep_minutes','photo_key','archived_at','sold_out_at'): check(c in cols,'menu_items.%s folded into 0001'%c)
# sold-out is a DIFFERENT fact from orderable, and a timestamp rather than a boolean so that Q19
# (clears at opening vs stays until cleared) is answered by the reader, not by a second column
check([r[2] for r in db.execute("pragma table_info(menu_items)") if r[1]=='sold_out_at']==['TEXT'],'sold_out_at is a timestamp, not a boolean')
check(db.execute("select count(*) from menu_items where sold_out_at is not null").fetchone()[0]==0,'nothing ships sold out')
check('options_json' not in cols,'options_json is gone — one place holds the choices, not two')
ocols={r[1] for r in db.execute("pragma table_info(orders)")}
for c in ('kitchen_state','accepted_at','accepted_by','kitchen_prep_min','refused_at','refused_reason'):
    check(c in ocols,'orders.%s folded into 0001'%c)
icols={r[1] for r in db.execute("pragma table_info(order_items)")}
check('options_cents' in icols,'order_items.options_cents folded into 0001')
check(db.execute("select value from settings where key='ready_round_to_min'").fetchone()[0]=='5','ready-time numbers are settings, not code')
# the kitchen's state is its own field, and it must NOT be constrained like the payment status
db.execute("insert into orders(id,public_ref,lang,subtotal_cents,vat_low_cents,vat_high_cents,total_cents,pickup_eta_min) values('o2','EFGH','nl',1250,103,0,1250,45)")
check(db.execute("select kitchen_state from orders where id='o2'").fetchone()[0]=='new','a new order starts unseen by the kitchen')
db.execute("update orders set kitchen_state='ready' where id='o2'")
check(db.execute("select kitchen_state from orders where id='o2'").fetchone()[0]=='ready','kitchen_state takes a state we did not foresee — widening a CHECK in SQLite is a table rebuild')
check(db.execute("select status from orders where id='o2'").fetchone()[0]=='pending','the payment status is untouched by a kitchen move')
db.execute("insert into order_items(order_id,line,item_id,qty,unit_price_cents,vat_rate,name_snapshot,options_snapshot) values('o1',2,'indo-sajoer-lodeh',1,1695,9,'Sajoer Lodeh','Nasi goreng of bami goreng?: Nasi goreng')")
check(db.execute("select options_snapshot from order_items where order_id='o1' and line=2").fetchone()[0]=='Nasi goreng of bami goreng?: Nasi goreng','the choice is snapshotted on the order line')
try: db.execute("insert into orders(id,public_ref,lang,subtotal_cents,vat_low_cents,vat_high_cents,total_cents,pickup_eta_min) values('x','ABCD','xx',1,0,0,1,45)"); check(False,'lang CHECK enforced')
except sqlite3.IntegrityError: pass
try: db.execute("insert into order_items(order_id,line,item_id,qty,unit_price_cents,vat_rate,name_snapshot) values('x',1,'pizza-margherita',21,1250,9,'Margherita')"); check(False,'qty<=20 CHECK enforced')
except sqlite3.IntegrityError: pass
print(('FAIL %d: '%len(fails)+'; '.join(fails)) if fails else 'tests/test_menu.py: %d items, all checks passed'%len(menu))
sys.exit(1 if fails else 0)
