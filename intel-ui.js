/* COASTFINDER V2 UI. Loaded after app.js, uses its pre-existing navigation. */
(() => {
'use strict';
const api=globalThis.CoastIntel;
if(!api)return;
const esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const fmt=(n,digits=1,suffix='')=>Number.isFinite(n)?`${n.toFixed(digits)}${suffix}`:'–';
const compass=deg=>Number.isFinite(deg)?['N','NO','O','SO','S','SW','W','NW'][Math.round(((deg%360)+360)%360/45)%8]:'–';
const timestr=t=>String(t).slice(11,16);
function attachSpot(spot,region){
 const host=document.querySelector('#detail-panel .section-body');if(!host)return;
 const section=document.createElement('section');section.className='intel-box';section.innerHTML=`<div class="intel-label">ENVIRONMENT INTELLIGENCE · V2</div><h3 class="intel-title">Wind · Wellen · Strömung · Jahreszeit</h3><p class="intel-muted">Modellwerte für die Umgebung der Koordinate. Nicht die tatsächliche Brandung am konkreten Angelplatz und keine Fangprognose.</p><button class="intel-action" id="intel-load" type="button">7-Tage-Modell laden ↗</button><div id="intel-live" class="intel-live" role="status" aria-live="polite"></div><p class="intel-credit">Daten: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> (CC BY 4.0) · Wetter/Marine · Prognose, nicht Messung.</p>`;
 host.appendChild(section);
 const live=section.querySelector('#intel-live');const button=section.querySelector('#intel-load');
 button.addEventListener('click',async()=>{
   if(button.disabled)return;
   button.disabled=true;button.textContent='Modelldaten werden geladen …';live.innerHTML='<p class="intel-muted">Zwei API-Anfragen: Wetter und Meeresmodell, ohne API-Schlüssel.</p>';
   const controller=new AbortController();
   try{
     const data=await api.load(spot.lat,spot.lon,region.country,controller.signal);
     if(!section.isConnected)return;
     button.textContent=data.cached?'Daten aus Cache · erneut anzeigen':'Modell geladen · erneut anzeigen';
     renderForecast(live,data,region);
   }catch(e){if(!section.isConnected)return;live.innerHTML=`<div class="intel-error">Kein Modellabruf möglich: ${esc(e.message)}. Verbindung prüfen oder später erneut versuchen.</div>`;button.textContent='Erneut versuchen';}
   finally{button.disabled=false;}
 });
 const link=document.createElement('button');link.type='button';link.className='intel-research-link';link.textContent='Passende Angelberichte und Foren öffnen ↗';link.onclick=()=>{selectTab('forum');};section.appendChild(link);
}
function renderForecast(host,data,region){
 const now=new Date();const groups=api.dayGroups(data.hours).filter(g=>g.records.some(h=>new Date(h.time).getTime()>=now.getTime()-60*60*1000));
 if(!groups.length){host.innerHTML='<div class="intel-error">Keine zukünftigen Modellstunden gefunden.</div>';return;}
 const best=api.relativeWindows(data.hours,now,3);
 const suggested=best.length?`<div class="intel-windows"><h4>Relativ geringere Modellbelastung</h4><p>Im 7-Tage-Vergleich, unabhängig von Fangchancen, Landzugang und lokalen Warnungen.</p><div class="intel-window-list">${best.map(h=>`<div><b>${esc(new Date(h.time).toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit'}))} · ${esc(timestr(h.time))}</b><span>Belastung ${h.assessment.burden}/100</span></div>`).join('')}</div></div>`:'<div class="intel-error">Kein belastbarer Zeitvergleich: Wind- und Wellenwerte fehlen.</div>';
 host.innerHTML=`${data.errors.length?'<div class="intel-error">Teilweise verfügbar: '+data.errors.map(esc).join(' · ')+'</div>':''}${suggested}<div class="intel-days" id="intel-days" aria-label="Prognosetag wählen"></div><div id="intel-times" class="intel-times"></div><div id="intel-reading"></div><div class="intel-footnote">Wichtig: Strömung ist ein grob aufgelöstes Modell (~8 km). Windrichtung = Herkunft; Strömungsrichtung = Bewegungsziel. Für den konkreten Küstenzugang, die Brandung, geschützte Buchten und lokale Strudel fehlt eine exakte Messung. Modellwerte ersetzen keine Warnungen oder Ortskenntnis.</div>`;
 let groupIndex=0, hourIndex=0;
 const days=host.querySelector('#intel-days'),hours=host.querySelector('#intel-times'),reading=host.querySelector('#intel-reading');
 function updateDay(){days.replaceChildren();groups.forEach((g,i)=>{const d=document.createElement('button');d.className='intel-day'+(i===groupIndex?' active':'');const dt=new Date(g.day+'T12:00:00');d.innerHTML=`<b>${esc(dt.toLocaleDateString('de-DE',{weekday:'short'}))}</b><span>${esc(dt.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'}))}</span>`;d.onclick=()=>{groupIndex=i;hourIndex=0;updateDay();updateHours();};days.appendChild(d);});}
 function updateHours(){hours.replaceChildren();const arr=groups[groupIndex].records.filter(h=>new Date(h.time)>=new Date(Date.now()-3600000));const pick=arr.filter(h=>[6,9,12,15,18,21].includes(parseInt(timestr(h.time).slice(0,2),10)));
   const selected=pick.length?pick:arr.filter((_,i)=>i%3===0);
   if(!selected.length){reading.innerHTML='<div class="intel-error">Keine aktuellen Daten für diesen Tag.</div>';return;}
   if(hourIndex>=selected.length)hourIndex=0;
   selected.forEach((h,i)=>{const b=document.createElement('button');b.className='intel-hour'+(i===hourIndex?' active':'');b.textContent=timestr(h.time);b.onclick=()=>{hourIndex=i;updateHours();};hours.appendChild(b);});
   renderHour(reading,selected[hourIndex],region);
 }
 updateDay();updateHours();
}
function renderHour(host,h,region){
 const season=api.season(Number(h.time.slice(5,7))),year=h.time.slice(0,4);
 const a=h.assessment;const burden=a.burden;
 const clues=api.regionalClues(region,Number(h.time.slice(5,7)));
 const pct=burden!==null?burden:0;
 const warnings=a.risks.filter(x=>!x.includes('fehlt')&&!x.includes('fehlen'));
 host.innerHTML=`<div class="intel-stats">
  <div class="intel-stat"><span>WIND</span><strong>${fmt(h.wind,0,' km/h')}</strong><small>aus ${compass(h.windFrom)} · Böen ${fmt(h.gust,0,' km/h')}</small></div>
  <div class="intel-stat"><span>WELLEN</span><strong>${fmt(h.wave,1,' m')}</strong><small>aus ${compass(h.waveFrom)} · ${fmt(h.wavePeriod,0,' s')} Periode</small></div>
  <div class="intel-stat"><span>STRÖMUNG</span><strong>${fmt(h.current,2,' km/h')}</strong><small>nach ${compass(h.currentTo)} · grobes Modell</small></div>
  <div class="intel-stat"><span>WASSERTEMPERATUR</span><strong>${fmt(h.sst,1,' °C')}</strong><small>Oberfläche · Modell</small></div>
  </div><div class="intel-season"><strong>${esc(season)} ${esc(year)}</strong><span>Jahreszeit aus Kalender · Wassertemperatur ist separat modelliert. Saison ist kein Beweis für Fischvorkommen.</span></div>
  <div class="intel-load-card"><div class="intel-load-head"><b>Wetter-/Meeresbelastung</b><strong>${burden===null?'nicht berechenbar':burden+' / 100'}</strong></div><div class="intel-meter"><span style="width:${pct}%"></span></div><p>${esc(a.level)}. Je höher der Wert, desto stärker sind die modellierten Einflüsse; kein Sicherheits- oder Fangscore.</p>${a.reasons.length?`<details><summary>Berechnung offenlegen</summary><p>${a.reasons.map(esc).join(' · ')}. Die Gewichtung ist eine erste, nicht wissenschaftlich kalibrierte Heuristik.</p></details>`:''}</div>
  ${a.against?'<div class="intel-risk">Achtung: Wind und Strömung verlaufen laut Grobmodell gegenläufig – mögliche zusätzliche Wellenbelastung.</div>':''}
  ${warnings.length?`<div class="intel-risk">Warnsignale: ${warnings.map(esc).join(' · ')}. Küsten- und Wetterwarnungen vor Ort prüfen.</div>`:''}
  ${clues.length?`<div class="intel-clues"><h4>Regionale Erfahrungswerte</h4>${clues.map(c=>`<p><b>${esc(c.kind)}</b> ${esc(c.text)} <a href="${esc(c.source)}" target="_blank" rel="noopener noreferrer">Quelle ↗</a></p>`).join('')}</div>`:''}
  <div class="intel-caveat">Wellen aus ${compass(h.waveFrom)} heißt: sie kommen aus dieser Richtung. Die Exposition der konkreten Küstenstelle wurde nicht vermessen. Tiden-, Zugangs- und Schutzgebietsprüfung fehlt.</div>`;
}

let radarRequest=0;
async function loadRadar(host,region){
 if(!host)return;
 const seq=++radarRequest;
 host.innerHTML='<h3>Automatischer Quellen-Radar <span class="radar-beta">FREE</span></h3><p class="small-muted">Lese gespeicherte Quellenhinweise …</p>';
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),7000);
 try {
   const res=await fetch('./feed/radar.json',{signal:controller.signal,cache:'no-store'});
   if(!res.ok)throw Error('Öffentlicher RSS-Datenstand fehlt');
   const raw=await res.json();
   if(!Array.isArray(raw.articles))throw Error('Ungültiger Feed-Datenstand');
   const sourceList=Array.isArray(raw.sources)?raw.sources:[];
   const regionRows=raw.articles.filter(x=>Array.isArray(x.regions)&&x.regions.includes(region.id)).slice(0,35);
   const editorialIDs=new Set(sourceList.filter(x=>x.kind==='editorial'&&x.enabled).map(x=>x.id));
   // Never count unlocated editorial posts as regional catches or fishing spots.
   const unlocatedRows=region.country==='HR'?raw.articles.filter(x=>Array.isArray(x.regions)&&
     x.regions.length===0&&editorialIDs.has(x.source_id)).slice(0,8):[];
   const counts=new Map(),pairs=new Map();
   for(const x of regionRows){for(const fish of x.fish||[])counts.set(fish,(counts.get(fish)||0)+1);
     for(const fish of x.fish||[])for(const theme of x.themes||[]){const key=fish+'|'+theme,entry=pairs.get(key)||{fish,theme,mentions:0,sources:new Set()};entry.mentions++;entry.sources.add(x.source_id);pairs.set(key,entry);}}
   const summary={fish_mentions:[...counts].map(([name,mentions])=>({name,mentions})).sort((a,b)=>b.mentions-a.mentions),
     co_mentions:[...pairs.values()].map(x=>({...x,source_count:x.sources.size})).sort((a,b)=>b.source_count-a.source_count)};
   const data={articles:regionRows},status={sources:sourceList};
   if(seq!==radarRequest||!host.isConnected)return;
   if(!Array.isArray(data.articles)||!Array.isArray(status.sources))throw new Error('Ungültige Datenantwort');
   const rows=data.articles.slice(0,35), sources=status.sources;
   const seenSources=sources.filter(s=>s.enabled&&s.last_check?.status==='ok');
   const failed=sources.filter(s=>s.enabled&&s.last_check?.status==='error');
   const latest=sources.filter(s=>s.enabled).reduce((t,s)=>s.last_check?.checked_at&&s.last_check.checked_at>t?s.last_check.checked_at:t,'');
   const stale=!!latest&&Number.isFinite(Date.parse(latest))&&Date.now()-Date.parse(latest)>48*3600*1000;
   const fishs=(Array.isArray(summary.fish_mentions)?summary.fish_mentions:[]).slice(0,5).map(x=>[x.name,x.mentions]);
   const combinations=(Array.isArray(summary.co_mentions)?summary.co_mentions:[]).filter(x=>x.source_count>=2).slice(0,4);
   const dt=x=>{if(!x)return 'kein Datum';const d=new Date(x);return Number.isNaN(d.getTime())?'Datum unklar':d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'});};
   const sourceBadges=sources.map(s=>`<span class="radar-source-tag" title="${esc(s.last_check?.message||s.scope||'')}">${esc(s.name)}: ${!s.enabled?'pausiert':s.last_check?.status==='ok'?'Abruf OK ('+Number(s.last_check?.fetched||0)+' Einträge)':s.last_check?.status==='error'?'Fehler':'noch nicht geprüft'}</span>`).join('');
   const broadMarkup=unlocatedRows.length?
     `<details class="radar-unlocated"><summary>Weitere Adria-Uferangel-Berichte ohne belegten Ort (${unlocatedRows.length})</summary>
       <p class="small-muted">Redaktionelle Beiträge: Region und Fang sind nicht verifiziert. Diese Meldungen beeinflussen keine Spot-Wertung oder Fangstatistik.</p>
       <div class="radar-entries">${unlocatedRows.map(x=>`<article class="intel-source"><div class="intel-source-meta">REDAKTION · ${esc(dt(x.published_at))} · Ort unbekannt</div>
       <a href="${esc(/^https:\/\//.test(x.url)?x.url:'#')}" target="_blank" rel="noopener noreferrer">${esc(x.title)} ↗</a>
       ${x.excerpt?`<p>${esc(x.excerpt)}</p>`:''}</article>`).join('')}</div></details>`:'';
   host.innerHTML=`<h3>Automatischer Quellen-Radar <span class="radar-beta">FREE</span></h3>
    <div class="radar-stat-row"><div><strong>${rows.length}</strong><span>Regionale Treffer</span></div><div><strong>${seenSources.length}/${sources.filter(s=>s.enabled).length}</strong><span>Quellen erreichbar</span></div></div>
    <p class="small-muted">Letzter Quellcheck: ${esc(dt(latest))}. ${stale?'Datenstand älter als 48 Stunden.':''} ${failed.length?'Einzelne Feeds fehlgeschlagen.':''} Angezeigt wird der gespeicherte GitHub-Actions-Datenstand.</p>
    <div class="radar-source-tags">${sourceBadges}</div>
    ${fishs.length?`<div class="radar-fishes"><b>Häufige Fisch-Erwähnungen:</b> ${fishs.map(([n,v])=>`${esc(n)} (${v})`).join(' · ')}</div>`:''}
    ${combinations.length?`<div class="radar-fishes"><b>Wiederkehrende Diskussionskombinationen (mind. 2 Quellen):</b><div>${combinations.map(x=>`${esc(x.fish)} + ${esc(x.theme)}: ${Number(x.mentions)||0} Beiträge aus ${Number(x.source_count)||0} Quellen`).join('<br>')}</div></div>`:''}
    <p class="radar-warning">Erwähnungen ≠ Fänge; Veröffentlichungsmonat ≠ Fangmonat. Keine statistisch gesicherten Wind- oder Saisonkorrelationen.</p>
    <div class="radar-entries">${rows.map(s=>`<article class="intel-source"><div class="intel-source-meta">AUTO-RSS · ${esc(dt(s.published_at))} · ${esc(s.source_id)} · Textsignal ${Number(s.relevance)||0}/100</div><a href="${esc(/^https:\/\//.test(s.url)?s.url:'#')}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a>${s.excerpt?`<p>${esc(s.excerpt)}</p>`:''}<p class="radar-tags">${esc((s.fish||[]).concat(s.themes||[]).join(' · ')||'Keine klare Fischart')}</p></article>`).join('')}</div>
    ${broadMarkup}
    ${!rows.length?'<p class="small-muted">Keine geografisch zugeordneten Treffer in dieser Region. Überregionale Artikel sind keine Spot-Belege.</p>':''}
    <button class="radar-refresh" type="button">Quellenstatus neu laden</button>`;
   host.querySelector('.radar-refresh')?.addEventListener('click',()=>loadRadar(host,region));
 } catch(err) {
   if(seq!==radarRequest||!host.isConnected)return;
   host.innerHTML=`<h3>Automatischer Quellen-Radar <span class="radar-beta">FREE</span></h3><p class="intel-muted">Für den kostenlosen Foren-Radar liegt noch kein abrufbarer RSS-Datenstand vor. Nach GitHub-Pages-Veröffentlichung können die geplanten GitHub-Actions-Läufe den Datenstand erzeugen. Die übrige App funktioniert ohne Backend.</p><button class="radar-refresh" type="button">Verbindung prüfen</button>`;
   host.querySelector('.radar-refresh')?.addEventListener('click',()=>loadRadar(host,region));
 } finally {clearTimeout(timeout);}
}
function renderForum(region){
 const host=document.getElementById('forum-panel');if(!host)return;
 const entries=api.SOURCES.filter(s=>s.country===region.country&&(s.region==='all'||s.region===region.id));
 const search=api.searchLinks(region);
 host.innerHTML=`<div class="section-body"><div class="intel-label">COMMUNITY EVIDENCE · QUELLEN-RADAR</div><h2>Angelberichte für ${esc(region.name)}</h2><div class="radar-live" id="radar-live"><h3>Automatischer Quellen-Radar <span class="radar-beta">FREE</span></h3><p class="small-muted">Lade gespeicherte RSS-Treffer, überprüfte Quellenstatus und regionale Erwähnungen …</p></div><p class="small-muted">${entries.length} recherchierte Quellen zur Region bzw. zum Land. Kein automatisches Durchsuchen aller Foren. Alte Beiträge, Meinung und unbestätigte Fänge bleiben getrennt von Wetterdaten.</p><div class="intel-source-list">${entries.map(s=>`<article class="intel-source"><div class="intel-source-meta">${esc(s.kind)} · ${esc(s.date)} · ${esc(s.topic)}</div><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a><p>${esc(s.insight)}</p></article>`).join('')}</div><h3>Weitere öffentliche Beiträge suchen</h3><p class="small-muted">Die folgenden Suchanfragen öffnen externe Suchmaschinen. Ergebnisse werden nicht automatisch importiert oder als überprüft markiert.</p><div class="intel-search-links">${search.map(s=>`<a target="_blank" rel="noopener noreferrer" href="${esc(s.url)}">${esc(s.name)} ↗</a>`).join('')}</div><div class="intel-caveat">Automatischer Radar: ausschließlich konfigurierte, freigegebene RSS-Feeds mit Quelllink, Veröffentlichungsdatum und Relevanz-Heuristik. Keine Volltexte, Reddit-API, Fangstatistik oder Beweise für Fischaktivität. Regelmäßige Aktualisierung erfolgt bei aktiviertem GitHub-Actions-Workflow; nicht minutengenau garantiert.</div></div>`;
 loadRadar(host.querySelector('#radar-live'),region);
}
window.CoastIntelUI={attachSpot,renderForum,renderForecast};
})();
