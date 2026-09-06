#!/usr/bin/env python3
# gen-vat-sheet — data/menu.json → the one-page-per-section sign-off sheet for the café
# (Q17 VAT per item + Q39 which items are orderable for takeaway). Output is a PDF OUTSIDE the
# repo (a PDF at the root would be published on the live domain). Usage:
#   python3 tools/gen-vat-sheet.py data/menu.json /path/out.pdf
import json,sys,html,datetime
from weasyprint import HTML
d=json.load(open(sys.argv[1],encoding='utf-8')); items=d['items']
CAT={'start':'Voorgerechten','main':'Hoofdgerechten','lunch':'Lunch','snack':'Snacks','indo':'Indonesisch','veg':'Vegetarisch','kids':'Kindermenu','pancake':'Pannenkoeken','dessert':'Desserts','extra':'Extra','hot':'Warme dranken','soft':'Frisdranken','beer':'Bier','wine':'Wijn','spirit':'Sterke drank','cocktail':'Cocktails'}
e=html.escape
def eur(c): return '€ %d,%02d'%(c//100,c%100)
css='''@page{size:A4;margin:14mm 14mm 16mm 14mm;@bottom-center{content:"Oud-Kempen Eetcafé · afhaalbestellen · btw & afhaallijst · blz. " counter(page) "/" counter(pages);font:8.5pt "DejaVu Sans",sans-serif;color:#7A817A}}
body{font:9.6pt/1.35 "DejaVu Sans",sans-serif;color:#1B1F1A}h1{font-size:17pt;margin:0 0 1mm;color:#1F4D37}.sub{color:#4A5147;margin:0 0 4mm}
.box{border:1px solid #CFD3CA;background:#F3F4F0;border-radius:2mm;padding:3mm 4mm;margin:0 0 5mm;font-size:9.2pt}.box p{margin:0 0 1.2mm}
h2{font-size:11.5pt;margin:5mm 0 2mm;color:#1F4D37;border-bottom:1.2px solid #2F6B4F;padding-bottom:.8mm;page-break-after:avoid}
table{width:100%;border-collapse:collapse;page-break-inside:auto}tr{page-break-inside:avoid}th,td{padding:1.3mm 2mm;border-bottom:1px solid #E1E4DD;vertical-align:middle;text-align:left}
th{font-size:8.2pt;text-transform:uppercase;letter-spacing:.04em;color:#4A5147;border-bottom:1.2px solid #CFD3CA}
td.p{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}td.c{text-align:center;white-space:nowrap}
.bx{display:inline-block;width:3.6mm;height:3.6mm;border:1.1px solid #1B1F1A;border-radius:.5mm;vertical-align:middle}
.bx.on{background:#1B1F1A}.fix{background:#F3E7C8;color:#9A6B12;font-size:7.6pt;font-weight:600;border-radius:1mm;padding:0 1.4mm;margin-left:1.5mm}
.no{background:#F2DED3;color:#A8502A;font-size:7.6pt;font-weight:600;border-radius:1mm;padding:0 1.4mm;margin-left:1.5mm}
.sign{margin-top:8mm;display:flex;gap:10mm;page-break-inside:avoid}.sign div{flex:1;border-top:1px solid #1B1F1A;padding-top:1.5mm;font-size:8.6pt;color:#4A5147}
'''
today=datetime.date.today().strftime('%d-%m-%Y')
out=['<h1>Afhaalbestellen — btw-tarief en afhaallijst</h1><p class="sub">Oud-Kempen Eetcafé · %d gerechten en dranken · voorstel van %s · ter ondertekening</p>'%(len(items),today)]
out.append('''<div class="box"><p><b>Wat u doet.</b> Twee kolommen per regel. <b>btw</b>: het tarief dat wij voor dit artikel zullen rekenen (9% eten en alcoholvrij, 21% alcohol). Vier regels zijn met <span class="fix">correctie</span> gemarkeerd: daar wijkt het tarief af van de categorie. Klopt het niet? Streep door en schrijf het juiste tarief ernaast.
<b>afhalen</b>: voorgevinkt = online te bestellen voor afhalen. Wilt u een artikel <i>niet</i> online aanbieden, zet dan een kruis in het vakje ernaast. Twee zijn al uitgesloten: tapbier en de kaasfondue (reserveren, 1 dag vooraf).</p>
<p>Prijzen zijn de huidige kaartprijzen inclusief btw; ze veranderen hier niet. Onderteken onderaan en geef het blad terug via Zach. Zonder dit blad gaat de live betaalkoppeling niet aan.</p></div>''')
order=['start','main','lunch','snack','indo','veg','kids','pancake','dessert','extra','hot','soft','beer','wine','spirit','cocktail']
for cat in order:
    rows=[i for i in items if i['cat']==cat]
    if not rows: continue
    out.append('<h2>%s</h2><table><tr><th style="width:52%%">Artikel</th><th style="width:14%%;text-align:right">Prijs</th><th style="width:14%%;text-align:center">btw</th><th style="width:20%%;text-align:center">afhalen · níet</th></tr>'%e(CAT[cat]))
    for i in rows:
        default=9 if (i['kind']=='food' or cat in ('hot','soft')) else 21
        fix=' <span class="fix">correctie</span>' if i['vat_rate']!=default else ''
        no=' <span class="no">%s</span>'%e('tap' if i['orderable_note']=='draught' else 'reservering') if not i['orderable'] else ''
        out.append('<tr><td>%s%s</td><td class="p">%s</td><td class="c">%d%%%s</td><td class="c"><span class="bx%s"></span> &nbsp;·&nbsp; <span class="bx"></span></td></tr>'%(e(i['name']['nl']),no,eur(i['price_cents']),i['vat_rate'],fix,'' if i['orderable'] else ' on'))
    out.append('</table>')
out.append('<div class="sign"><div>Naam</div><div>Functie (eigenaar / boekhouder)</div><div>Handtekening en datum</div></div>')
doc='<!doctype html><html><head><meta charset="utf-8"><style>'+css+'</style></head><body>'+''.join(out)+'</body></html>'
HTML(string=doc).write_pdf(sys.argv[2]); print('wrote',sys.argv[2])
