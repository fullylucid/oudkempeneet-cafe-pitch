/* LIVE = this is the real manager at /beheer/menu (tools/build-beheer.py --live): the menu comes from
   the Worker and Opslaan sends the operations to it. Not LIVE = the practice version, one file, nothing saved. */
var LIVE=true;
var MENU=/*__MENU__*/[];
var CATS=/*__CATS__*/{};
var CATORDER=/*__ORDER__*/[];   // from data/menu.json (cats), never a list kept here
/* The manager's own words, in the café's three languages. Schyler and Zach read it in English, the
   café runs it in Dutch; the switch is shared with the rest of the site (ok-lang), so whoever has
   picked a language on the customer pages lands here in the same one. The MENU CONTENT stays
   trilingual underneath whichever is chosen — the editor still shows all three fields. */
var UI={"nl": {"title": "Menukaart beheren", "sandbox": "Oefenversie — <b>er wordt niets opgeslagen</b>. Wijzigingen blijven alleen in deze browser staan.", "add": "+ Nieuw gerecht", "search": "Zoek een gerecht of drankje…", "searchA": "Zoeken", "onlySo": "Alleen uitverkocht", "reset": "Alles terugzetten", "save": "Opslaan", "mTitle": "Dit zou naar de kassa gaan", "mBody": "In de echte versie stuurt deze knop precies dit naar de server, die het in de database zet. Nu niet — dit is een oefenversie.", "close": "Sluiten", "edit": "Bewerken", "all": "Alles", "none": "Niets gevonden.", "drag": "Versleep om te ordenen", "up": "Omhoog", "down": "Omlaag", "noName": "(zonder naam)", "newTag": "NIEUW", "vatShort": "btw", "soldOut": "Uitverkocht", "tSold": "Uitverkocht — direct zichtbaar voor klanten", "tBack": "Weer te bestellen", "fName": "Naam", "fDesc": "Omschrijving", "fPrice": "Prijs", "fPrep": "Bereidingstijd (min)", "prepPh": "standaard 45", "fVat": "Btw", "vat9": "9% — eten & frisdrank", "vat21": "21% — alcohol", "notTake": "Niet op de afhaalkaart", "notDaily": "Dit is geen dagelijkse knop zoals uitverkocht — het hoort bij wat het gerecht is. Wilt u dit veranderen, laat het ons weten.", "vatWarn": "Het btw-tarief staat op het door de eigenaar ondertekende blad. Wijzig het alleen als dat blad wijzigt — niet omdat een categorie er anders uitziet.", "photo": "Foto", "photoOff": "Nog niet ingeschakeld. Foto-opslag (Cloudflare R2) staat uit op de account van het café, en of er überhaupt foto's komen is een vraag aan de eigenaar. Zodra dat ja is, komt hier een uploadveld.", "remove": "Verwijderen van de kaart", "removeNote": "Blijft in de geschiedenis staan: oude bestellingen bewaren hun eigen naam en prijs.", "badPrice": "Geen geldige prijs", "tRemoved": "Van de kaart gehaald", "noOpts": "Dit gerecht heeft geen keuzes. (Keuzes toevoegen komt in de volgende stap.)", "srcImplied": "niet op de kaart", "srcMenu": "van de kaart", "surcharge": "Meerprijs voor {n}", "inherit": "btw {r}% — zelfde als het gerecht", "optWarn": "Een keuze met een meerprijs verandert wat de klant betaalt. Het btw-tarief volgt het gerecht (zie hierboven), en zodra een keuze geld kost moet de eigenaar dat blad opnieuw ondertekenen.", "badSurcharge": "Geen geldige meerprijs", "tNew": "Nieuw gerecht in {c}", "one": "1 wijziging", "many": "{n} wijzigingen", "noChanges": "Geen wijzigingen", "tReset": "Terug naar de kaart zoals hij nu is", "lockBar": "alleen aan de bar", "lockRes": "reserveren", "whyDraught": "Tapbier kan niet mee naar huis — staat niet op de afhaalkaart.", "whyReserve": "Reserveren, minimaal 1 dag van tevoren — staat niet op de afhaalkaart."}, "en": {"title": "Manage the menu", "sandbox": "Practice copy — <b>nothing is saved</b>. Changes stay in this browser only.", "add": "+ New dish", "search": "Search for a dish or drink…", "searchA": "Search", "onlySo": "Sold out only", "reset": "Undo everything", "save": "Save", "mTitle": "This is what would go to the till", "mBody": "In the real version this button sends exactly this to the server, which writes it to the database. Not here — this is a practice copy.", "close": "Close", "edit": "Edit", "all": "All", "none": "Nothing found.", "drag": "Drag to reorder", "up": "Move up", "down": "Move down", "noName": "(no name)", "newTag": "NEW", "vatShort": "VAT", "soldOut": "Sold out", "tSold": "Sold out — customers see it straight away", "tBack": "Back on the menu", "fName": "Name", "fDesc": "Description", "fPrice": "Price", "fPrep": "Prep time (min)", "prepPh": "default 45", "fVat": "VAT", "vat9": "9% — food & soft drinks", "vat21": "21% — alcohol", "notTake": "Not on the takeaway menu", "notDaily": "This is not a daily switch like sold out — it is part of what the dish is. If you want it changed, tell us.", "vatWarn": "The VAT rate is on the sheet the owner signed. Change it only when that sheet changes — not because a category looks different.", "photo": "Photo", "photoOff": "Not switched on yet. Photo storage (Cloudflare R2) is off on the café's account, and whether there will be photos at all is a question for the owner. Once that is yes, an upload field appears here.", "remove": "Remove from the menu", "removeNote": "Stays in the history: past orders keep their own name and price.", "badPrice": "Not a valid price", "tRemoved": "Taken off the menu", "noOpts": "This dish has no choices. (Adding choices comes in the next step.)", "srcImplied": "not on the menu", "srcMenu": "from the menu", "surcharge": "Surcharge for {n}", "inherit": "VAT {r}% — same as the dish", "optWarn": "A choice with a surcharge changes what the customer pays. Its VAT rate follows the dish (see above), and once any choice costs money the owner has to sign that sheet again.", "badSurcharge": "Not a valid surcharge", "tNew": "New dish in {c}", "one": "1 change", "many": "{n} changes", "noChanges": "No changes", "tReset": "Back to the menu as it stands", "lockBar": "at the bar only", "lockRes": "reservation", "whyDraught": "Draught beer cannot be taken home — it is not on the takeaway menu.", "whyReserve": "Reservation, at least 1 day ahead — it is not on the takeaway menu."}, "de": {"title": "Speisekarte verwalten", "sandbox": "Übungsversion — <b>es wird nichts gespeichert</b>. Änderungen bleiben nur in diesem Browser.", "add": "+ Neues Gericht", "search": "Gericht oder Getränk suchen…", "searchA": "Suchen", "onlySo": "Nur ausverkauft", "reset": "Alles zurücksetzen", "save": "Speichern", "mTitle": "Das würde an die Kasse gehen", "mBody": "In der echten Version schickt dieser Knopf genau das an den Server, der es in die Datenbank schreibt. Hier nicht — das ist eine Übungsversion.", "close": "Schließen", "edit": "Bearbeiten", "all": "Alle", "none": "Nichts gefunden.", "drag": "Zum Sortieren ziehen", "up": "Nach oben", "down": "Nach unten", "noName": "(ohne Namen)", "newTag": "NEU", "vatShort": "MwSt.", "soldOut": "Ausverkauft", "tSold": "Ausverkauft — sofort für Gäste sichtbar", "tBack": "Wieder bestellbar", "fName": "Name", "fDesc": "Beschreibung", "fPrice": "Preis", "fPrep": "Zubereitung (Min.)", "prepPh": "Standard 45", "fVat": "MwSt.", "vat9": "9 % — Speisen & Softdrinks", "vat21": "21 % — Alkohol", "notTake": "Nicht auf der Abholkarte", "notDaily": "Das ist kein täglicher Schalter wie ausverkauft — es gehört zum Gericht. Wenn Sie es ändern möchten, sagen Sie uns Bescheid.", "vatWarn": "Der MwSt.-Satz steht auf dem vom Inhaber unterschriebenen Blatt. Ändern Sie ihn nur, wenn sich dieses Blatt ändert — nicht weil eine Kategorie anders aussieht.", "photo": "Foto", "photoOff": "Noch nicht eingeschaltet. Der Fotospeicher (Cloudflare R2) ist im Konto des Cafés aus, und ob es überhaupt Fotos gibt, ist eine Frage an den Inhaber. Sobald das ja ist, erscheint hier ein Upload-Feld.", "remove": "Von der Karte nehmen", "removeNote": "Bleibt in der Historie: frühere Bestellungen behalten ihren eigenen Namen und Preis.", "badPrice": "Kein gültiger Preis", "tRemoved": "Von der Karte genommen", "noOpts": "Dieses Gericht hat keine Auswahl. (Auswahl hinzufügen kommt im nächsten Schritt.)", "srcImplied": "nicht auf der Karte", "srcMenu": "von der Karte", "surcharge": "Aufpreis für {n}", "inherit": "MwSt. {r} % — wie das Gericht", "optWarn": "Eine Auswahl mit Aufpreis ändert, was der Gast zahlt. Ihr MwSt.-Satz folgt dem Gericht (siehe oben), und sobald eine Auswahl Geld kostet, muss der Inhaber das Blatt neu unterschreiben.", "badSurcharge": "Kein gültiger Aufpreis", "tNew": "Neues Gericht in {c}", "one": "1 Änderung", "many": "{n} Änderungen", "noChanges": "Keine Änderungen", "tReset": "Zurück zur aktuellen Karte", "lockBar": "nur an der Bar", "lockRes": "Reservierung", "whyDraught": "Fassbier kann nicht mitgenommen werden — steht nicht auf der Abholkarte.", "whyReserve": "Reservierung, mindestens 1 Tag vorher — steht nicht auf der Abholkarte."}};
var LANG='nl'; try{ var s=localStorage.getItem('ok-lang'); if(UI[s]) LANG=s; }catch(e){}
function T(k,v){ var s=(UI[LANG]&&UI[LANG][k]); if(s==null) s=UI.nl[k]; if(s==null) s=k;
  Object.keys(v||{}).forEach(function(x){ s=s.split('{'+x+'}').join(v[x]); }); return s; }
function nm(m){ return (m.name&&(m.name[LANG]||m.name.nl))||''; }
function catLabel(c){ return (CATS[LANG]&&CATS[LANG][c])||(CATS.nl&&CATS.nl[c])||c; }
var BY={}; MENU.forEach(function(m){ BY[m.id]=m; });

/* The draft lives in this browser and nowhere else. Every change the owner makes is recorded as an
   OPERATION rather than as a new copy of the menu, because that is what the Worker will accept
   later: one endpoint per verb, and a price edit that never touches an order already placed. */
var DRAFT={edits:{},added:[],removed:{},order:{}};
var DKEY=LIVE?'ok-beheer-live':'ok-beheer';   /* a practice draft must never be sent to the real menu */
try{ var d=JSON.parse(localStorage.getItem(DKEY)||'null'); if(d&&d.edits) DRAFT=d; }catch(e){}
function store(){ try{ localStorage.setItem(DKEY,JSON.stringify(DRAFT)); }catch(e){} }

function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function eur(c){ return '€ '+Math.floor(c/100)+','+String(Math.abs(c)%100).padStart(2,'0'); }
function cents(s){ s=String(s).replace(/[^0-9,.\-]/g,'').replace(',','.'); var n=parseFloat(s); return isNaN(n)?null:Math.round(n*100); }
function toast(m){ var el=document.getElementById('toast'); el.textContent=m; el.classList.add('on'); clearTimeout(toast._t); toast._t=setTimeout(function(){el.classList.remove('on');},2200); }

/* `orderable` currently carries TWO different facts: "sold out today" (the owner's daily toggle)
   and "never orderable online" (the fondue needs a day's notice; draught beer cannot be carried
   home). They are not the same thing and must not share one checkbox — unticking it for the
   fondue would quietly put a reservation-only dish on the takeaway menu. Here the second kind is
   shown as a locked state with its reason. Whether the database should separate them is a
   question for the gate, raised from this sandbox rather than guessed at. */
/* sold out lasts for the Amsterdam day it was set on: yesterday's mark is over, here as on the ordering page */
function amsDay(d){ return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date(d)); }
function soldOut(m){ if(!m.sold_out_at) return false; var t=Date.parse(m.sold_out_at); return !isNaN(t)&&amsDay(t)===amsDay(Date.now()); }
function lockShort(m){ return m.orderable_note==='draught' ? T('lockBar') : T('lockRes'); }
function lockWhy(m){ return m.orderable_note==='draught'
  ? T('whyDraught') : T('whyReserve'); }

/* the item as the owner currently sees it: the real row with their unsaved edits laid over it */
function view(id){ var base=BY[id]||DRAFT.added.filter(function(a){return a.id===id;})[0]; if(!base) return null;
  var e=DRAFT.edits[id]||{}, out={};
  Object.keys(base).forEach(function(k){ out[k]=base[k]; });
  Object.keys(e).forEach(function(k){
    if(k==='name'||k==='desc'){ out[k]={}; Object.keys(base[k]||{}).forEach(function(l){out[k][l]=base[k][l];}); Object.keys(e[k]).forEach(function(l){out[k][l]=e[k][l];}); }
    else out[k]=e[k]; });
  return out; }
function edit(id,k,v){ if(!DRAFT.edits[id]) DRAFT.edits[id]={}; DRAFT.edits[id][k]=v; store(); patchRow(id); refreshCount(); }
function editLang(id,k,lang,v){ if(!DRAFT.edits[id]) DRAFT.edits[id]={}; if(!DRAFT.edits[id][k]) DRAFT.edits[id][k]={}; DRAFT.edits[id][k][lang]=v; store(); patchRow(id); refreshCount(); }
/* Update the one row's summary without touching the editor below it. Text nodes and a class only —
   rebuilding the header would destroy the checkbox or input the owner just used. Rebuilding the
   whole list, which is what this used to do, destroyed the field they were still typing in and the
   edit was lost on the way to the payload. */
function patchRow(id){ var el=document.querySelector('.row[data-id="'+CSS.escape(id)+'"]'); if(!el) return; var m=view(id);
  var isNew=DRAFT.added.some(function(a){return a.id===id;});
  el.querySelector('.nm').textContent=(m.name.nl||'(zonder naam)')+(isNew?' NIEUW':'');
  el.querySelector('.pr').textContent=eur(m.price_cents||0);
  el.querySelector('.vat').textContent='btw '+m.vat_rate+'%';
  el.classList.toggle('soldout',soldOut(m)); }

function allIds(){ var ids=MENU.map(function(m){return m.id;}).concat(DRAFT.added.map(function(a){return a.id;}));
  return ids.filter(function(i){ return !DRAFT.removed[i]; }); }
function inCat(cat){ var ids=allIds().filter(function(i){ return view(i).cat===cat; });
  var ord=DRAFT.order[cat];
  if(ord){ var pos={}; ord.forEach(function(i,n){pos[i]=n;});
    ids.sort(function(a,b){ var pa=pos[a],pb=pos[b]; if(pa==null&&pb==null) return view(a).pos-view(b).pos; if(pa==null) return 1; if(pb==null) return -1; return pa-pb; }); }
  else ids.sort(function(a,b){ return view(a).pos-view(b).pos; });
  return ids; }

/* ---- filters ---- */
var filterCat='', query='', onlySold=false;
function visible(id){ var m=view(id);
  if(filterCat && m.cat!==filterCat) return false;
  if(onlySold && !soldOut(m)) return false;
  if(query){ var q=query.toLowerCase();
    var hay=[m.name.nl,m.name.en,m.name.de,(m.desc||{}).nl||''].join(' ').toLowerCase();
    if(hay.indexOf(q)<0) return false; }
  return true; }

/* ---- render ---- */
function renderCats(){ var el=document.getElementById('cats');
  el.innerHTML='<button type="button" data-cat="" aria-pressed="'+(filterCat===''?'true':'false')+'">'+esc(T('all'))+'</button>'+
    CATORDER.filter(function(c){ return allIds().some(function(i){return view(i).cat===c;}); }).map(function(c){
      return '<button type="button" data-cat="'+esc(c)+'" aria-pressed="'+(filterCat===c?'true':'false')+'">'+esc(catLabel(c))+'</button>'; }).join('');
  el.querySelectorAll('button').forEach(function(b){ b.addEventListener('click',function(){ filterCat=b.dataset.cat; renderCats(); renderList(); }); }); }

function renderList(){ var root=document.getElementById('list'); root.innerHTML='';
  var open=root.dataset.open||'';
  CATORDER.forEach(function(cat){
    var ids=inCat(cat).filter(visible); if(!ids.length) return;
    var h=document.createElement('div'); h.className='cat-h';
    h.innerHTML='<h2>'+esc(catLabel(cat))+'</h2><span class="n">'+ids.length+'</span>';
    root.appendChild(h);
    var box=document.createElement('div'); box.className='rows'; box.dataset.cat=cat;
    ids.forEach(function(id){ box.appendChild(rowEl(id,cat,id===open)); });
    root.appendChild(box); });
  if(!root.children.length) root.innerHTML='<p class="note">'+esc(T('none'))+'</p>';
  wireDrag(); }

function rowEl(id,cat,openIt){ var m=view(id), el=document.createElement('div');
  el.className='row'+(soldOut(m)?' soldout':''); el.dataset.id=id;
  var isNew=DRAFT.added.some(function(a){return a.id===id;});
  el.innerHTML='<div class="rhead">'+
    '<button class="grip" type="button" aria-label="'+esc(T('drag'))+'" title="'+esc(T('drag'))+'">⠿</button>'+
    '<span class="moves"><button type="button" data-mv="-1" aria-label="'+esc(T('up'))+'">▲</button><button type="button" data-mv="1" aria-label="'+esc(T('down'))+'">▼</button></span>'+
    '<span class="nm">'+esc(nm(m)||T('noName'))+(isNew?' <span class="lang-tag">'+esc(T('newTag'))+'</span>':'')+'</span>'+
    '<span class="pr">'+eur(m.price_cents||0)+'</span>'+
    '<span class="vat">'+esc(T('vatShort'))+' '+m.vat_rate+'%</span>'+
    (m.orderable_note ? '<span class="locked" title="'+esc(lockWhy(m))+'">'+esc(lockShort(m))+'</span>'
                      : '<label class="so"><input type="checkbox" '+(soldOut(m)?'checked':'')+'> '+esc(T('soldOut'))+'</label>')+
    '<button class="btn btn-quiet" type="button" data-act="edit">'+(openIt?T('close'):T('edit'))+'</button>'+
  '</div><div class="edit" '+(openIt?'':'hidden')+'></div>';
  var so=el.querySelector('.so input');
  if(so) so.addEventListener('change',function(e){
    /* writes sold_out_at, NEVER orderable: that column already means "never orderable online" and
       is correct as it stands. The sandbox caught the display conflation and this is the other
       half of it — showing them apart while still writing them into one field would have been a
       fix in appearance only. */
    edit(id,'sold_out_at', e.target.checked ? new Date().toISOString() : null);
    toast(e.target.checked?T('tSold'):T('tBack')); });
  el.querySelectorAll('[data-mv]').forEach(function(b){ b.addEventListener('click',function(){ move(cat,id,parseInt(b.dataset.mv,10)); }); });
  el.querySelector('[data-act=edit]').addEventListener('click',function(){
    var root=document.getElementById('list'); root.dataset.open=(root.dataset.open===id?'':id); renderList(); });
  if(openIt) fillEditor(el.querySelector('.edit'),id);
  return el; }

/* ---- the editor for one dish ---- */
var LANGS=[['nl','Nederlands'],['en','English'],['de','Deutsch']];
function fillEditor(box,id){ var m=view(id);
  var h='';
  h+='<div class="cols">'+LANGS.map(function(L){ return '<div class="fld"><label>'+esc(T('fName'))+' <span class="lang-tag">'+L[0].toUpperCase()+'</span></label>'+
      '<input type="text" data-f="name" data-l="'+L[0]+'" value="'+esc((m.name||{})[L[0]]||'')+'" maxlength="80"></div>'; }).join('')+'</div>';
  h+='<div class="cols">'+LANGS.map(function(L){ return '<div class="fld"><label>'+esc(T('fDesc'))+' <span class="lang-tag">'+L[0].toUpperCase()+'</span></label>'+
      '<textarea data-f="desc" data-l="'+L[0]+'" maxlength="300">'+esc((m.desc||{})[L[0]]||'')+'</textarea></div>'; }).join('')+'</div>';
  h+='<div class="cols">'+
    '<div class="fld"><label>'+esc(T('fPrice'))+'</label><input type="text" inputmode="decimal" data-f="price" value="'+(((m.price_cents||0)/100).toFixed(2).replace('.',','))+'"></div>'+
    '<div class="fld"><label>'+esc(T('fPrep'))+'</label><input type="number" min="0" max="180" data-f="prep" value="'+(m.prep_minutes==null?'':m.prep_minutes)+'" placeholder="'+esc(T('prepPh'))+'"></div>'+
    '<div class="fld"><label>'+esc(T('fVat'))+'</label><select data-f="vat"><option value="9"'+(m.vat_rate===9?' selected':'')+'>'+esc(T('vat9'))+'</option><option value="21"'+(m.vat_rate===21?' selected':'')+'>'+esc(T('vat21'))+'</option></select></div>'+
  '</div>';
  if(m.orderable_note) h+='<div class="stub"><strong>'+esc(T('notTake'))+'</strong><p class="note tight">'+esc(lockWhy(m))+' '+esc(T('notDaily'))+'</p></div>';
  h+='<p class="note warn" data-vatwarn hidden>'+esc(T('vatWarn'))+'</p>';
  /* photos: the field is hidden rather than broken while R2 is off and the question is open */
  h+='<div class="stub"><strong>'+esc(T('photo'))+'</strong><p class="note tight">'+esc(T('photoOff'))+'</p></div>';
  h+=optionsEditor(id,m);
  h+='<div><button class="btn btn-quiet" type="button" data-act="rm">'+esc(T('remove'))+'</button> '+
     '<span class="note">'+esc(T('removeNote'))+'</span></div>';
  box.innerHTML=h;

  box.querySelectorAll('[data-f=name],[data-f=desc]').forEach(function(el){
    el.addEventListener('change',function(){ editLang(id,el.dataset.f,el.dataset.l,el.value); }); });
  box.querySelector('[data-f=price]').addEventListener('change',function(e){ var c=cents(e.target.value);
    if(c==null||c<0){ toast(T('badPrice')); return; } edit(id,'price_cents',c); });
  box.querySelector('[data-f=prep]').addEventListener('change',function(e){ var v=e.target.value.trim();
    edit(id,'prep_minutes', v===''?null:Math.max(0,Math.min(180,parseInt(v,10)||0))); });
  var vatSel=box.querySelector('[data-f=vat]'), vw=box.querySelector('[data-vatwarn]');
  vatSel.addEventListener('change',function(e){ vw.hidden=false; edit(id,'vat_rate',parseInt(e.target.value,10)); });
  box.querySelector('[data-act=rm]').addEventListener('click',function(){
    DRAFT.removed[id]=true; delete DRAFT.edits[id]; store();
    document.getElementById('list').dataset.open=''; refresh(); toast(T('tRemoved')); });
  wireOptions(box,id); }

/* ---- options: the one place Part Two can change what a customer pays ---- */
function optionsEditor(id,m){ var gs=m.options||[];
  if(!gs.length) return '<p class="note">'+esc(T('noOpts'))+'</p>';
  return gs.map(function(g){
    return '<div class="grp" data-g="'+esc(g.id)+'"><div class="grp-h"><span class="t">'+esc(g.label[LANG]||g.label.nl)+'</span>'+
      '<span class="src'+(g.source==='implied'?' implied':'')+'">'+(g.source==='implied'?T('srcImplied'):T('srcMenu'))+'</span></div>'+
      g.options.map(function(o){ var pc=optPrice(id,g.id,o.id);
        return '<div class="opt'+(pc>0?' priced':'')+'" data-o="'+esc(o.id)+'"><span class="l">'+esc(o.label[LANG]||o.label.nl)+'</span>'+
          '<span class="price">+<input type="text" inputmode="decimal" aria-label="'+esc(T('surcharge',{n:o.label[LANG]||o.label.nl}))+'" value="'+((pc/100).toFixed(2).replace('.',','))+'"></span>'+
          '<span class="inh">'+esc(T('inherit',{r:m.vat_rate}))+'</span></div>'; }).join('')+
      '</div>'; }).join('')+
    '<p class="note warn" data-optwarn'+(anyPriced(id)?'':' hidden')+'>'+esc(T('optWarn'))+'</p>'; }
/* an edit wins; otherwise the price the menu already charges (sauces cost money, msg 143) */
function optPrice(id,gid,oid){ var e=(DRAFT.edits[id]||{}).optPrices||{}; if(e[gid+'/'+oid]!=null) return e[gid+'/'+oid];
  var m=BY[id]||{}, g=(m.options||[]).find(function(x){return x.id===gid;}), o=g&&g.options.find(function(x){return x.id===oid;}); return (o&&o.price_cents)||0; }
function anyPriced(id){ var m=BY[id]||{}; return (m.options||[]).some(function(g){ return g.options.some(function(o){ return optPrice(id,g.id,o.id)>0; }); }); }
function wireOptions(box,id){ box.querySelectorAll('.grp .opt').forEach(function(row){
  var gid=row.closest('.grp').dataset.g, oid=row.dataset.o, inp=row.querySelector('input');
  inp.addEventListener('change',function(){ var c=cents(inp.value);
    if(c==null||c<0){ toast(T('badSurcharge')); inp.value='0,00'; return; }
    if(!DRAFT.edits[id]) DRAFT.edits[id]={}; if(!DRAFT.edits[id].optPrices) DRAFT.edits[id].optPrices={};
    DRAFT.edits[id].optPrices[gid+'/'+oid]=c; store();
    row.classList.toggle('priced',c>0);
    var w=box.querySelector('[data-optwarn]'); if(w) w.hidden=!anyPriced(id);
    refreshCount(); }); }); }

/* ---- reordering: drag for the tablet, arrows for everyone else ----
   A drag-only reorder is unusable with a keyboard and awkward with a trembling hand, so the same
   operation has two doors. Both write the SAME thing: the category's full id order. */
function move(cat,id,dir){ var ids=inCat(cat), i=ids.indexOf(id), j=i+dir;
  if(i<0||j<0||j>=ids.length) return;
  ids.splice(j,0,ids.splice(i,1)[0]); DRAFT.order[cat]=ids; store();
  refresh(); var el=document.querySelector('.row[data-id="'+id+'"]'); if(el) el.querySelector('.grip').focus(); }

function wireDrag(){ document.querySelectorAll('.rows').forEach(function(box){
  box.querySelectorAll('.grip').forEach(function(grip){
    grip.addEventListener('pointerdown',function(ev){
      if(ev.button!==0&&ev.pointerType==='mouse') return;
      var row=grip.closest('.row'), cat=box.dataset.cat, started=false;
      grip.setPointerCapture(ev.pointerId);
      function onMove(e){
        if(!started){ started=true; row.classList.add('drag'); }
        var over=document.elementFromPoint(e.clientX,e.clientY); over=over&&over.closest('.row');
        box.querySelectorAll('.row.over').forEach(function(r){r.classList.remove('over');});
        if(over&&over!==row&&over.parentNode===box) over.classList.add('over');
        e.preventDefault(); }
      function onUp(e){
        grip.removeEventListener('pointermove',onMove); grip.removeEventListener('pointerup',onUp); grip.removeEventListener('pointercancel',onUp);
        row.classList.remove('drag');
        var tgt=box.querySelector('.row.over'); box.querySelectorAll('.row.over').forEach(function(r){r.classList.remove('over');});
        if(!started||!tgt) return;
        var ids=inCat(cat), from=ids.indexOf(row.dataset.id), to=ids.indexOf(tgt.dataset.id);
        if(from<0||to<0||from===to) return;
        ids.splice(to,0,ids.splice(from,1)[0]); DRAFT.order[cat]=ids; store(); refresh(); }
      grip.addEventListener('pointermove',onMove); grip.addEventListener('pointerup',onUp); grip.addEventListener('pointercancel',onUp); }); }); }); }

/* ---- a new dish ---- */
var newSeq=0;
document.getElementById('add').addEventListener('click',function(){
  var cat=filterCat||(LIVE&&CATORDER.length?CATORDER[0]:'main');
  var id='nieuw-'+(++newSeq)+'-'+Date.now().toString(36).slice(-4);
  var maxPos=allIds().filter(function(i){return view(i).cat===cat;}).reduce(function(a,i){return Math.max(a,view(i).pos||0);},-1);
  DRAFT.added.push({id:id,kind:(['hot','soft','beer','wine','cocktail','spirit'].indexOf(cat)>=0?'drink':'food'),
    cat:cat,pos:maxPos+1,name:{nl:'',en:'',de:''},desc:{nl:'',en:'',de:''},
    price_cents:0,vat_rate:(['beer','wine','cocktail','spirit'].indexOf(cat)>=0?21:9),orderable:true,orderable_note:'',options:[],prep_minutes:null});
  store(); filterCat=cat; document.getElementById('list').dataset.open=id; refresh();
  var el=document.querySelector('.row[data-id="'+id+'"] input[data-f=name][data-l=nl]'); if(el) el.focus();
  toast(T('tNew',{c:catLabel(cat)})); });

/* ---- what would actually be sent ---- */
function ops(){ var out=[];
  var isNew={}; DRAFT.added.forEach(function(a){ isNew[a.id]=1; });
  Object.keys(DRAFT.edits).forEach(function(id){ if(DRAFT.removed[id]||isNew[id]) return;   /* a new dish travels whole, in its create */
    var e=DRAFT.edits[id], fields={}, optp=null;
    Object.keys(e).forEach(function(k){ if(k==='optPrices') optp=e[k]; else fields[k]=e[k]; });
    if(Object.keys(fields).length) out.push({op:'update',id:id,fields:fields});
    if(optp) Object.keys(optp).forEach(function(k){ var p=k.split('/');
      out.push({op:'option_price',item_id:id,group_id:p[0],option_id:p[1],price_cents:optp[k]}); }); });
  DRAFT.added.forEach(function(a){ if(!DRAFT.removed[a.id]) out.push({op:'create',item:view(a.id)}); });   /* as the owner sees it: their edits laid over the blank */
  Object.keys(DRAFT.removed).forEach(function(id){ if(!isNew[id]) out.push({op:'archive',id:id}); });
  Object.keys(DRAFT.order).forEach(function(cat){ out.push({op:'reorder',cat:cat,ids:DRAFT.order[cat]}); });
  return out; }
function refreshCount(){ var n=ops().length;
  document.getElementById('count').textContent=n?(n===1?T('one'):T('many',{n:n})):T('noChanges');
  document.getElementById('save').disabled=!n; document.getElementById('reset').disabled=!n; }

/* ---- the real manager: load from the Worker, save to it ---- */
function setMenu(j){ MENU=j.items; BY={}; MENU.forEach(function(m){ BY[m.id]=m; });
  CATS={nl:{},en:{},de:{}}; j.cats.forEach(function(c){ ['nl','en','de'].forEach(function(l){ CATS[l][c.id]=c.label[l]||c.label.nl; }); });
  CATORDER=j.cats.map(function(c){ return c.id; }); }
function say(k,v){ var m=T(k,v); toast(m); }
function saveLive(){ var btn=document.getElementById('save'), list=ops(); if(!list.length) return; btn.disabled=true;
  fetch('/beheer/api/menu/ops',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({ops:list})})
    .then(function(r){ if(r.status===401){ location.replace('/beheer'); return null; } return r.json().then(function(j){ return {ok:r.ok,j:j}; }); })
    .then(function(r){ if(!r) return; btn.disabled=false;
      if(!r.ok){ say(r.j.error==='role'?'eRole':'eSave',{why:r.j.error+(r.j.at!=null?' #'+(r.j.at+1):'')}); return; }   /* nothing was written: the batch is all or nothing */
      DRAFT={edits:{},added:[],removed:{},order:{}}; store(); setMenu(r.j.menu); document.getElementById('list').dataset.open=''; refresh(); say('tSaved',{n:r.j.applied}); })
    .catch(function(){ btn.disabled=false; say('eNet'); }); }
document.getElementById('save').addEventListener('click',function(){
  if(LIVE){ saveLive(); return; }
  document.getElementById('payload').textContent=JSON.stringify(ops(),null,1);
  document.getElementById('modal').classList.add('on'); document.getElementById('mx').focus(); });
document.getElementById('mx').addEventListener('click',function(){ document.getElementById('modal').classList.remove('on'); });
document.getElementById('modal').addEventListener('click',function(e){ if(e.target===this) this.classList.remove('on'); });
document.addEventListener('keydown',function(e){ if(e.key==='Escape') document.getElementById('modal').classList.remove('on'); });
document.getElementById('reset').addEventListener('click',function(){
  DRAFT={edits:{},added:[],removed:{},order:{}}; store(); document.getElementById('list').dataset.open=''; refresh(); toast(T('tReset')); });

document.getElementById('q').addEventListener('input',function(e){ query=e.target.value.trim(); renderList(); });
document.getElementById('only-so').addEventListener('click',function(){ onlySold=!onlySold;
  this.setAttribute('aria-pressed',String(onlySold)); this.classList.toggle('btn-gold',onlySold); renderList(); });

function applyLang(l){ if(!UI[l]) l='nl'; LANG=l; document.documentElement.lang=l;
  try{ localStorage.setItem('ok-lang',l); }catch(e){}
  document.title=T('title')+' — Oud-Kempen Eetcafé';
  document.querySelectorAll('[data-i18n]').forEach(function(el){ el.textContent=T(el.getAttribute('data-i18n')); });
  document.querySelectorAll('[data-i18n-html]').forEach(function(el){ el.innerHTML=T(el.getAttribute('data-i18n-html')); });
  document.querySelectorAll('[data-i18n-ph]').forEach(function(el){ el.placeholder=T(el.getAttribute('data-i18n-ph')); });
  document.querySelectorAll('[data-i18n-aria]').forEach(function(el){ el.setAttribute('aria-label',T(el.getAttribute('data-i18n-aria'))); });
  document.querySelectorAll('.lang button').forEach(function(b){ b.setAttribute('aria-pressed',String(b.dataset.lang===l)); });
  /* a toast still fading in the old language is stale the moment the language changes */
  var to=document.getElementById('toast'); to.classList.remove('on'); to.textContent=''; clearTimeout(toast._t);
  refresh(); }
document.querySelectorAll('.lang button').forEach(function(b){ b.addEventListener('click',function(){ applyLang(b.dataset.lang); }); });
function refresh(){ renderCats(); renderList(); refreshCount(); }
UI.nl.back='← Openingstijden'; UI.en.back='← Opening hours'; UI.de.back='← Öffnungszeiten';
UI.nl.tSaved='Opgeslagen ({n}). Gasten zien dit binnen een minuut.'; UI.en.tSaved='Saved ({n}). Guests see this within a minute.'; UI.de.tSaved='Gespeichert ({n}). Gäste sehen das innerhalb einer Minute.';
UI.nl.eSave='Niet opgeslagen: {why}. Er is niets gewijzigd.'; UI.en.eSave='Not saved: {why}. Nothing was changed.'; UI.de.eSave='Nicht gespeichert: {why}. Es wurde nichts geändert.';
UI.nl.eRole='Niet opgeslagen: alleen de eigenaar mag dit wijzigen. U kunt wel gerechten uitverkocht melden.'; UI.en.eRole='Not saved: only the owner may change this. You can still mark dishes sold out.'; UI.de.eRole='Nicht gespeichert: nur der Inhaber darf das ändern. Ausverkauft melden geht.';
UI.nl.eNet='Dat lukte niet. Controleer de verbinding en probeer het opnieuw.'; UI.en.eNet='That did not work. Check the connection and try again.'; UI.de.eNet='Das hat nicht geklappt. Verbindung prüfen und erneut versuchen.';
UI.nl.eLoad='De menukaart kon niet worden geladen.'; UI.en.eLoad='The menu could not be loaded.'; UI.de.eLoad='Die Speisekarte konnte nicht geladen werden.';
if(!LIVE) applyLang(LANG);
else { var sb=document.querySelector('.sandbox'); if(sb) sb.remove(); document.getElementById('back').hidden=false;
  fetch('/beheer/api/menu',{credentials:'same-origin'}).then(function(r){ if(r.status===401){ location.replace('/beheer'); return null; } return r.ok?r.json():Promise.reject(); })
    .then(function(j){ if(!j) return; setMenu(j);
      /* a draft that names dishes which no longer exist is dropped rather than sent */
      Object.keys(DRAFT.edits).concat(Object.keys(DRAFT.removed)).forEach(function(id){ if(!BY[id]&&!DRAFT.added.some(function(a){return a.id===id;})){ delete DRAFT.edits[id]; delete DRAFT.removed[id]; } }); store();
      applyLang(LANG); })
    .catch(function(){ applyLang(LANG); say('eLoad'); }); }
