#!/usr/bin/env python3
"""Step-2 checks: menu.json ↔ menu.html ↔ migrations agree. Run: python3 tests/test_menu.py (from repo root)."""
import json,re,sqlite3,sys,glob
fails=[]
def check(cond,msg):
    if not cond: fails.append(msg)
menu=json.load(open('data/menu.json',encoding='utf-8'))['items']
html=open('menu.html',encoding='utf-8').read()
I18N=json.loads(re.search(r'var I18N=(\{.*?\});\n',html,re.S).group(1))
check(len(menu)==110,'110 items expected, got %d'%len(menu))
check(len(set(i['id'] for i in menu))==110,'ids unique')
for i in menu:
    k=i['id'].replace('-','.')
    for l in ('nl','en','de'):
        check(i['name'][l]==I18N[l][k+'.n'],'name %s %s matches page'%(i['id'],l))
    check(i['price_cents']>0,'price %s'%i['id'])
    check(i['vat_rate'] in (9,21),'vat %s'%i['id'])
by={i['id']:i for i in menu}
check(by['d-hot-8']['name']['nl']=='Irish Coffee' and by['d-hot-8']['vat_rate']==21,'Irish Coffee 21%')
for z in ('d-beer-5','d-beer-6','d-beer-13'):
    check('0.0' in by[z]['name']['nl'] and by[z]['vat_rate']==9,'%s 0.0 beer 9%%'%z)
check(by['d-beer-4']['vat_rate']==21,'Radler 2.0% stays 21')
check(all(i['vat_rate']==9 for i in menu if i['kind']=='food'),'all food 9%')
check(sum(1 for i in menu if not i['orderable'])==3,'3 non-orderable (fondue + 2 draught)')
check(not by['m-main-0']['orderable'] and not by['d-beer-0']['orderable'] and not by['d-beer-1']['orderable'],'fondue, Tap bier, Groot tapbier excluded')
# ---- per-dish choices (data/options.json resolved into the menu) ----
OPT=json.load(open('data/options.json',encoding='utf-8'))
groups={g['id']:g for g in OPT['groups']}
check(len(groups)==len(OPT['groups']),'group ids unique')
for g in OPT['groups']:
    for l in ('nl','en','de'): check(g['label'].get(l),'group %s has a %s question'%(g['id'],l))
    check(len(g['options'])>=2,'group %s offers at least two options'%g['id'])
    check(len({o['id'] for o in g['options']})==len(g['options']),'option ids unique in %s'%g['id'])
    for o in g['options']:
        for l in ('nl','en','de'): check(o['label'].get(l),'option %s/%s has a %s label'%(g['id'],o['id'],l))
    check(g['source'] in ('menu','implied'),'group %s declares its source'%g['id'])
check({g['id'] for g in OPT['groups'] if g['source']=='implied'}=={'bakwijze'},
      'only the steak doneness is ours to invent — everything else must come from the printed menu')
withopts=[i for i in menu if i.get('options')]
check(len(withopts)==10,'10 dishes carry choices, got %d'%len(withopts))
check(all(i['id'] in OPT['items'] for i in withopts),'every dish with choices is listed in options.json')
check(all(k in by for k in OPT['items']),'options.json names only dishes that exist')
check(all(by[k]['orderable'] for k in OPT['items']),'a dish with choices must be orderable')
# a menu-sourced choice must actually be written in the café's own Dutch description
WORDS={'bami-nasi':('bami','nasi'),'boontjes-sajoer':('boontjes','sajoer'),'schnitzelsaus':('champignon','pepersaus'),
       'patat-brood':('patat','brood'),'kindermenu':('frikandel','kroket','nuggets','pannenkoek')}
for iid,gids in OPT['items'].items():
    d=(by[iid]['desc']['nl'] or '').lower()
    for gid in gids:
        if groups[gid]['source']!='menu': continue
        for w in WORDS[gid]: check(w in d,'"%s" is not in the printed description of %s — do not invent choices'%(w,iid))
check(not by['m-main-1']['desc']['nl'] or 'gebakken' not in by['m-main-1']['desc']['nl'].lower(),
      'the steak doneness is not on the printed menu (that is why it is source:implied)')

db=sqlite3.connect(':memory:')
for f in sorted(glob.glob('migrations/*.sql')): db.executescript(open(f,encoding='utf-8').read())
n=db.execute('select count(*) from menu_items').fetchone()[0]; check(n==110,'seed rows %d'%n)
for f in sorted(glob.glob('migrations/*.sql')): db.executescript(open(f,encoding='utf-8').read())   # idempotent
check(db.execute('select count(*) from menu_items').fetchone()[0]==110,'seed idempotent')
r=db.execute("select vat_rate,orderable from menu_items where id='d-hot-8'").fetchone(); check(r==(21,1),'D1 Irish Coffee row')
check(db.execute("select count(*) from menu_items where orderable=0").fetchone()[0]==3,'D1 non-orderable count')
check(db.execute("select value from settings where key='standard_wait_min'").fetchone()[0]=='45','settings seeded')
check(db.execute("select value from settings where key='strip_contact_after_days'").fetchone()[0]=='0','retention = never (Q15 = b)')
db.execute("insert into orders(id,public_ref,lang,subtotal_cents,vat_low_cents,vat_high_cents,total_cents,pickup_eta_min) values('o1','ABCD','nl',850,70,0,850,45)")
db.execute("insert into order_items(order_id,line,item_id,qty,unit_price_cents,vat_rate,name_snapshot,line_note) values('o1',1,'m-start-0',1,850,9,'Soep van de dag','zonder brood')")
check(db.execute("select line_note from order_items where order_id='o1'").fetchone()[0]=='zonder brood','line_note column (Q23 = a)')
# choices are ROWS now, not a blob on the item — Part Two's manager edits one option at a time
n_opt=db.execute("select count(*) from item_options").fetchone()[0]
want=sum(len(g['options']) for i in menu for g in (i.get('options') or []))
check(n_opt==want,'every option is a row in D1 (%d, want %d)'%(n_opt,want))
check(db.execute("select count(distinct item_id) from item_options").fetchone()[0]==10,'10 dishes carry choices in D1')
r=db.execute("select group_nl,label_nl,required,source,price_cents from item_options where item_id='m-indo-3' and option_id='nasi'").fetchone()
check(r==('Bami of nasi?','Nasi',1,'menu',0),'a choice row carries its question, its answer, its source and a zero surcharge (got %r)'%(r,))
check(db.execute("select count(*) from item_options where item_id='m-start-0'").fetchone()[0]==0,'a dish with no choice has no rows')
check(db.execute("select count(*) from item_options where price_cents<>0").fetchone()[0]==0,'no option costs money today — Q14 decides whether any ever does')
check(db.execute("select count(*) from item_options where source='implied'").fetchone()[0]==3,'only the steak doneness is ours to invent (3 rows)')
# ordering is preserved so the manager can drag without inventing it
check([x[0] for x in db.execute("select option_id from item_options where item_id='m-main-1' order by option_pos")]==['rood','medium','doorbakken'],'option order survives the seed')
# --- Part Two columns are present BEFORE the schema freezes (PR #76, P2) ---
cols={r[1] for r in db.execute("pragma table_info(menu_items)")}
for c in ('prep_minutes','photo_key','archived_at','sold_out_at'): check(c in cols,'menu_items.%s folded into 0001'%c)
# sold-out is a DIFFERENT fact from orderable, and a timestamp rather than a boolean so that Q19
# (clears at opening vs stays until cleared) is answered by the reader, not by a second column
check([r[2] for r in db.execute("pragma table_info(menu_items)") if r[1]=='sold_out_at']==['TEXT'],'sold_out_at is a timestamp, not a boolean')
check(db.execute("select count(*) from menu_items where sold_out_at is not null").fetchone()[0]==0,'nothing ships sold out')
check(db.execute("select count(*) from menu_items where orderable=0").fetchone()[0]==3,'orderable still means never-orderable-online: fondue + 2 draught, unchanged')
check([r[0] for r in db.execute("select orderable_note from menu_items where orderable=0 order by id")]==['draught','draught','reservation-only, 1 day ahead'],'and each one still says why')
check('options_json' not in cols,'options_json is gone — one place holds the choices, not two')
ocols={r[1] for r in db.execute("pragma table_info(orders)")}
for c in ('kitchen_state','accepted_at','accepted_by','kitchen_prep_min','refused_at','refused_reason'):
    check(c in ocols,'orders.%s folded into 0001'%c)
icols={r[1] for r in db.execute("pragma table_info(order_items)")}
check('options_cents' in icols,'order_items.options_cents folded into 0001')
check(db.execute("select value from settings where key='ready_round_to_min'").fetchone()[0]=='5','ready-time numbers are settings, not code')
# the kitchen's state is its own field, and it must NOT be constrained like the payment status
db.execute("insert into orders(id,public_ref,lang,subtotal_cents,vat_low_cents,vat_high_cents,total_cents,pickup_eta_min) values('o2','EFGH','nl',850,70,0,850,45)")
check(db.execute("select kitchen_state from orders where id='o2'").fetchone()[0]=='new','a new order starts unseen by the kitchen')
db.execute("update orders set kitchen_state='ready' where id='o2'")
check(db.execute("select kitchen_state from orders where id='o2'").fetchone()[0]=='ready','kitchen_state takes a state we did not foresee — widening a CHECK in SQLite is a table rebuild')
check(db.execute("select status from orders where id='o2'").fetchone()[0]=='pending','the payment status is untouched by a kitchen move')
db.execute("insert into order_items(order_id,line,item_id,qty,unit_price_cents,vat_rate,name_snapshot,options_snapshot) values('o1',2,'m-indo-3',1,1695,9,'Sajoer Lodeh','Bami of nasi: Nasi')")
check(db.execute("select options_snapshot from order_items where order_id='o1' and line=2").fetchone()[0]=='Bami of nasi: Nasi','the choice is snapshotted on the order line')
try: db.execute("insert into orders(id,public_ref,lang,subtotal_cents,vat_low_cents,vat_high_cents,total_cents,pickup_eta_min) values('x','ABCD','xx',1,0,0,1,45)"); check(False,'lang CHECK enforced')
except sqlite3.IntegrityError: pass
try: db.execute("insert into order_items(order_id,line,item_id,qty,unit_price_cents,vat_rate,name_snapshot) values('x',1,'m-start-0',21,850,9,'Soep')"); check(False,'qty<=20 CHECK enforced')
except sqlite3.IntegrityError: pass
print(('FAIL %d: '%len(fails)+'; '.join(fails)) if fails else 'tests/test_menu.py: %d items, all checks passed'%len(menu))
sys.exit(1 if fails else 0)
