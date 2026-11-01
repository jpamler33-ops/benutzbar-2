/* COASTFINDER FREE – private browser data. No server, no account, no money. */
(()=>{'use strict';
let accessToken=''; // intentionally never persisted in localStorage, URLs or cookies
let prefill=null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const regions=[['istria','Istrien'],['zadar','Zadar'],['split','Split'],['dubrovnik','Dubrovnik'],['brittany','Bretagne'],['normandy','Normandie'],['riviera','Côte d’Azur']];
const methods=['Spinnfischen','Shore Jigging','Brandungsangeln','Grundangeln','Posenangeln','Andere'];
const species=['Wolfsbarsch','Dorade','Dentex','Bonito','Makrele','Meeräsche','Sargo','Barrakuda','Tintenfisch'];
const options=(items,selected)=>items.map(([id,title])=>`<option value="${esc(id)}" ${selected===id?'selected':''}>${esc(title)}</option>`).join('');
/* Time in the COAST region, NOT the browser clock. Handles DST, rejects nonexistent
   March times and asks explicitly for an offset during October's repeated hour. */
function coastLocalToUTC(localTime,regionId,offsetChoice='auto'){
 const parts=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localTime);
 if(!parts)throw Error('Lokale Fangzeit im Format JJJJ-MM-TT HH:MM erforderlich.');
 const [y,m,d,h,min]=parts.slice(1).map(Number);
 const naive=Date.UTC(y,m-1,d,h,min);
 const naiveDate=new Date(naive);
 if(naiveDate.getUTCFullYear()!==y||naiveDate.getUTCMonth()+1!==m||naiveDate.getUTCDate()!==d||h>23||min>59)
   throw Error('Datum oder Uhrzeit ungültig.');
 const tz=['brittany','normandy','riviera'].includes(regionId)?'Europe/Paris':'Europe/Zagreb';
 const f=new Intl.DateTimeFormat('en-GB',{timeZone:tz,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
 const ok=[];
 for(const offset of [1,2]){
  const ms=naive-offset*3600000;
  const p=Object.fromEntries(f.formatToParts(new Date(ms)).map(x=>[x.type,x.value]));
  if(Number(p.year)===y&&Number(p.month)===m&&Number(p.day)===d&&Number(p.hour)===h&&Number(p.minute)===min)
    ok.push({offset,ms});
 }
 if(!ok.length)throw Error('Diese lokale Uhrzeit existiert wegen der Sommerzeit-Umstellung nicht.');
 if(ok.length===2&&offsetChoice==='auto')throw Error('Diese Uhrzeit kommt bei der Zeitumstellung zweimal vor. Wähle +01 oder +02 UTC-Offset.');
 const found=offsetChoice==='auto'?ok[0]:ok.find(x=>'+'+String(x.offset).padStart(2,'0')===offsetChoice);
 if(!found)throw Error('Gewählter UTC-Offset passt nicht zu Datum und Region.');
 return new Date(found.ms).toISOString();
}

function host(){return document.getElementById('catches-panel');}
function warn(t){const h=host();const el=h?.querySelector('#catch-notice');if(el){el.textContent=t;el.hidden=false;}else if(typeof notify==='function')notify(t);}
async function api(path,opts={}){return window.CoastFreeStore.api(path,opts);}
function loading(){const h=host();if(h)h.innerHTML='<div class="section-body"><div class="catch-head"><b>Fangarchiv · FREE</b><span class="catch-private">PRIVAT</span></div><p class="small-muted">Lade deine Fangdatenbank …</p></div>';}
async function render(region){
 const h=host();if(!h)return;loading();
 try{
  const [r,s]=await Promise.all([api('records?limit=100'),api('stats')]);
  if(!h.isConnected||!document.querySelector('[data-tab="catches"].selected'))return;
  dashboard(h,r.records||[],s,region);
 }catch(e){offline(h,String(e.message),true,region);}
}
function offline(h,message,canRetry=false,region=null){
 h.innerHTML=`<div class="section-body"><div class="catch-head"><b>Fangarchiv · FREE</b><span class="catch-private">PRIVAT</span></div><div class="catch-hint">${esc(message)}</div><p class="small-muted">Ohne laufenden Python-Server funktioniert die Küstenkarte weiter. Es werden keine Demo-Fänge erfunden oder in Statistiken eingesetzt.</p>${canRetry?'<button class="catch-action" id="catch-try">Erneut laden</button>':''}</div>`;
 h.querySelector('#catch-try')?.addEventListener('click',()=>render(region));
}
function login(h,region,err=''){
 h.innerHTML=`<div class="section-body"><div class="catch-head"><b>Fangarchiv · FREE</b><span class="catch-private">PRIVAT</span></div><p class="small-muted">Serverseitige SQLite-Datenbank. Eigene Fänge und Null-Fang-Ausflüge bleiben hinter einem privaten Zugriffsschlüssel. Keine öffentlich einsehbaren Angelstellen.</p><form class="catch-login" id="catch-login"><label>Zugriffsschlüssel aus COASTFINDER_RADAR_ADMIN_TOKEN<input type="password" id="catch-token" autocomplete="off" required placeholder="Server-Schlüssel eingeben"></label><button class="catch-action" type="submit">Mit Datenbank verbinden</button></form><div class="catch-hint" id="catch-error" ${err?'':'hidden'}>${esc(err)}</div><p class="small-muted">Schlüssel wird nur im aktuellen Browser-Tab im Arbeitsspeicher gehalten und nicht dauerhaft gespeichert.</p></div>`;
 h.querySelector('#catch-login').onsubmit=async e=>{e.preventDefault();const t=h.querySelector('#catch-token').value;accessToken=t;
  try{await api('records?limit=1');render(region);}catch(er){accessToken='';h.querySelector('#catch-error').hidden=false;h.querySelector('#catch-error').textContent=String(er.message);}};
}
function dashboard(h,rows,s,region){
 const chosen=prefill?.region||region?.id||'istria';
 const p=prefill;
 const tracked=(s.groups||[]).length;
 h.innerHTML=`<div class="section-body catch-page"><div class="catch-head"><b>Private Fangdaten · 0 €</b><button id="catch-export" class="catch-signout" type="button">Export</button><button id="catch-import" class="catch-signout" type="button">Import</button><input id="catch-import-file" type="file" accept="application/json,.json" hidden></div>
 <p class="small-muted">Nur auf diesem Gerät gespeichert, keine Cloud-Synchronisierung. Daten regelmäßig als JSON exportieren, sonst droht Verlust beim Löschen der Browserdaten. Echte Ausflüge inkl. Schneider-Tage erfassen. Externe Berichte sind unbestätigte Quellenangaben und werden nicht in Fangquoten eingerechnet. Positionsgenauigkeit in der Datenbank bewusst ca. 1 km.</p>
 <div class="catch-metrics"><div><strong>${Number(s.total_sessions)||0}</strong><span>Eigene Ausflüge</span></div><div><strong>${Number(s.external_claims)||0}</strong><span>Externe Meldungen</span></div><div><strong>${Number(s.weather_matched)||0}</strong><span>Mit Wetterdaten</span></div></div>
 <details id="catch-new" class="catch-form-card" ${p?'open':''}><summary>+ Angelausflug oder Quellenbericht erfassen</summary>
  <form id="catch-form" class="catch-form">
   <div class="catch-grid"><label>Meldungsart<select name="source_kind" id="catch-kind"><option value="own">Eigener Angelausflug</option><option value="external">Externe, unbelegte Fangmeldung</option></select></label>
    <label>Region<select name="region" id="catch-region">${options(regions,chosen)}</select></label>
    <label>Zielart / berichtete Fischart<input name="fish" list="catch-species" maxlength="60" required placeholder="z. B. Wolfsbarsch"><datalist id="catch-species">${species.map(x=>`<option value="${esc(x)}">`).join('')}</datalist></label>
    <label>Fänge dieser Art<input name="catches" type="number" min="0" max="10000" step="1" required value="0"></label>
    <label id="catch-effort-field">Angelstunden (auch bei 0 Fängen)<input name="effort_hours" type="number" min="0.25" max="48" step="0.25" required placeholder="z. B. 3,5"></label>
    <label>Angelart<select name="method">${options(methods.map(x=>[x,x]),'Spinnfischen')}</select></label>
    <label>Datum/Uhrzeit am Fangort (Frankreich/Kroatien)<input name="local_time" type="datetime-local" required></label>
    <label>Zeitoffset (bei Oktober-Zeitumstellung)<select name="offset_choice"><option value="auto">Automatisch (CET/CEST)</option><option value="+01">UTC+01 – Winterzeit</option><option value="+02">UTC+02 – Sommerzeit</option></select></label>
    <label>Ungefähre Breite (°)<input name="lat" type="number" step="any" required placeholder="44.87" ${p?`value="${p.lat.toFixed(2)}"`:''}></label>
    <label>Ungefähre Länge (°)<input name="lon" type="number" step="any" required placeholder="13.85" ${p?`value="${p.lon.toFixed(2)}"`:''}></label>
    <label>Öffentlicher HTTPS-Quelllink (bei Fremdberichten Pflicht)<input name="source_url" type="url" id="catch-link" placeholder="https://forum.example/beitrag"></label>
   </div><label>Notiz / Belegkontext<textarea name="note" rows="3" maxlength="1000" placeholder="Köder, Fang/kein Fang, Besonderheiten, Quelle …"></textarea></label>
   <div class="catch-hint">Uhrzeit wird passend zur Region (Europe/Paris bzw. Europe/Zagreb) und Sommerzeit in UTC umgerechnet – unabhängig von der Gerätezeitzone. Die App speichert Koordinaten nur auf 0,01° gerundet; kein exakt geheimer Angelspot.</div>
   <button type="submit" class="catch-action" id="catch-save">Meldung speichern</button></form>
  </details>
 <p class="catch-feedback" id="catch-notice" hidden></p>
 <div class="catch-section-title">Auswertung nach Region · Art · Saison</div>
 ${tracked?`<div class="catch-stat-list">${(s.groups||[]).slice(0,20).map(g=>`<div class="catch-stat"><strong>${esc(g.fish)} · ${esc(regions.find(x=>x[0]===g.region)?.[1]||g.region)} · ${esc(g.season)}</strong><div class="catch-stat-grid"><span>${g.sessions} Trips (${g.zero_sessions} ohne Fang)</span><span>${g.hours} h Gesamt</span><span>${g.caught_fish} Fische</span><span>${g.cpue_fish_per_hour} Fische/h</span></div><p>${esc(g.sample_quality)} · ${g.weather_matched} mit Wetterdaten. Anteil Trips mit Fang: ${g.catch_session_share_pct}% (nur gemeldete Trips).</p></div>`).join('')}</div>`:'<div class="catch-hint">Noch keine eigenen Ausflüge dokumentiert. Statistik bleibt leer, bis echte Angaben vorliegen.</div>'}
 <div class="catch-hint">Die Fang-/Nullfang-Quote ist eine <b>deskriptive Eigenstatistik</b>, keine Vorhersage. Freiwillige Einträge, fehlende Null-Fänge, Köder, Tageszeiten und Spotwahl können das Ergebnis stark verzerren.</div>
 <div class="catch-section-title">Wind- & Wellen-Vergleich (explorativ)</div>
 ${(s.condition_groups||[]).length?`<div class="catch-stat-list">${s.condition_groups.slice(0,18).map(g=>`<div class="catch-stat"><strong>${esc(g.fish)} · ${esc(g.season)} · ${esc(g.metric)} ${esc(g.band)}</strong><div class="catch-stat-grid"><span>${g.sessions} Sessions</span><span>${g.zero_sessions} ohne Fang</span><span>${g.catch_session_share_pct}% mit Fang</span><span>${g.cpue_fish_per_hour} Fische/h</span></div><p>${esc(g.interpretation)}. Gleiche Region & Art & Saison; Methodik und Spotwahl nicht kontrolliert.</p></div>`).join('')}</div>`:'<div class="catch-hint">Noch keine historischen Wind-/Wellendaten mit echten Fang- und Nullfang-Ausflügen verknüpft.</div>'}
 <div class="catch-hint">Ohne ausreichend Null-Fang-Ausflüge und unabhängige Daten lassen sich keine Bedingungen als „besser zum Angeln“ bezeichnen. Selbst bei großen Stichproben ist Korrelation nicht Ursache.</div>
 <div class="catch-section-title">Einträge (${rows.length})</div><div class="catch-list">${rows.map(rowCard).join('')||'<p class="small-muted">Keine Fangdaten. Du kannst den ersten echten Ausflug erfassen.</p>'}</div>
 <div class="catch-footer">COASTFINDER ist <b>kein amtliches Meldesystem</b>. Die in Frankreich seit 2026 geltenden Registrierungs-/Fangmeldepflichten und das kroatische nationale Verfahren bitte separat beachten: <a href="https://www.service-public.gouv.fr/particuliers/vosdroits/F2118" target="_blank" rel="noopener noreferrer">Frankreich (Service Public)</a> · <a href="https://www.gov.hr/en/marine-recreational-and-sport-fisheries/1542" target="_blank" rel="noopener noreferrer">Kroatien (gov.hr)</a>.<br><br>Wetterhistorie: <a href="https://open-meteo.com/en/docs/historical-weather-api" target="_blank" rel="noopener noreferrer">Open-Meteo ERA5</a>. Marine-Modellwerte, falls für das Fangdatum verfügbar. Nur für private/nichtkommerzielle Nutzung ohne bezahlten API-Vertrag.</div>
 </div>`;
 h.querySelector('#catch-export').onclick=()=>{try{window.CoastFreeStore.exportData();}catch(e){warn(String(e.message));}};
 h.querySelector('#catch-import').onclick=()=>h.querySelector('#catch-import-file').click();
 h.querySelector('#catch-import-file').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;
   try{if(!confirm('Lokale JSON-Fangdaten importieren und mit bestehenden Einträgen zusammenführen?'))return;
     const n=await window.CoastFreeStore.importData(f);await render(region);warn(n+' Datensätze geprüft und importiert.');}
   catch(err){warn(String(err.message));}finally{e.target.value='';}};
 h.querySelector('#catch-kind').onchange=e=>{
  const ext=e.target.value==='external';
  h.querySelector('#catch-effort-field').hidden=ext;
  const effort=h.querySelector('[name="effort_hours"]');effort.required=!ext;
  if(ext)effort.value='';
  h.querySelector('#catch-link').required=ext;
 };
 h.querySelector('#catch-form').onsubmit=async e=>{
  e.preventDefault();const f=new FormData(e.target);
  let utcTime;try{utcTime=coastLocalToUTC(String(f.get('local_time')),String(f.get('region')),String(f.get('offset_choice')));}catch(err){return warn(String(err.message));}
  const kind=f.get('source_kind');const effort=f.get('effort_hours');
  const body={source_kind:kind,region:f.get('region'),fish:String(f.get('fish')).trim(),catches:Number(f.get('catches')),
    effort_hours:kind==='external'||effort===''?null:Number(effort),method:f.get('method'),
    caught_at_utc:utcTime,lat:Number(f.get('lat')),lon:Number(f.get('lon')),
    source_url:f.get('source_url')||null,note:f.get('note')||''};
  const b=h.querySelector('#catch-save');b.disabled=true;
  try{await api('records',{method:'POST',body:JSON.stringify(body)});prefill=null;await render(region);warn('Lokal gespeichert. Sichere deine Daten gelegentlich über Export. Wetterhistorie kann später geladen werden.');}
  catch(err){warn(String(err.message));b.disabled=false;}
 };
 h.querySelectorAll('[data-catch-weather]').forEach(b=>b.onclick=()=>action('record/'+b.dataset.catchWeather+'/weather','POST',region,b));
 h.querySelectorAll('[data-catch-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('Diesen Datensatz unwiderruflich löschen?'))return;action('record/'+b.dataset.catchDelete,'DELETE',region,b);});
 h.querySelectorAll('[data-catch-review]').forEach(b=>b.onclick=async()=>{const note=prompt('Welche Quelle hast du manuell geprüft? Notiere konkret, was du prüfen konntest. Dies verifiziert keinen Fang.');if(note!==null)action('record/'+b.dataset.catchReview+'/review','POST',region,b,{note});});
}
async function action(path,method,region,button,payload){
 button.disabled=true;
 try{await api(path,{method,...(payload?{body:JSON.stringify(payload)}:{})});render(region);}
 catch(e){warn(String(e.message));button.disabled=false;}
}
function fmt(x,suf='',digits=1){return x==null?'—':Number(x).toLocaleString('de-DE',{minimumFractionDigits:digits,maximumFractionDigits:digits})+suf;}
function rowCard(r){
 const wt=r.weather;
 const allowedURL=typeof r.source_url==='string'&&r.source_url.startsWith('https://');
 const d=new Date(r.caught_at_utc),date=Number.isFinite(d.getTime())?d.toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short',timeZone:r.country==='FR'?'Europe/Paris':'Europe/Zagreb'}):'Unbekannt';
 const label=r.source_kind==='own'?'Eigener Ausflug':'Externe Behauptung';
 const weather=r.weather_status==='available'?'Wetter + Meeresmodell':r.weather_status==='partial'?'Teilweise historische Daten':r.weather_status==='unavailable'?'Keine Modellhistorie':r.weather_status==='error'?'Abruf fehlgeschlagen':'Noch keine Wetterhistorie';
 return `<article class="catch-entry"><div class="catch-entry-top"><span class="catch-tag">${esc(label)}</span><span class="catch-date">${esc(date)}</span></div>
 <strong>${esc(r.fish)} · ${r.catches} gefangen</strong><p>${esc(regions.find(x=>x[0]===r.region)?.[1]||r.region)} · ${esc(r.season)} · ${esc(r.method)} ${r.effort_hours?`· ${fmt(r.effort_hours,' h')}`:''}</p>
 <p class="catch-entry-meta">Beleg: ${r.evidence_status==='source_reviewed'?'Quelle manuell geprüft (kein unabhängiger Fangbeweis)':'Unbestätigt'} · Standort auf 0,01° gerundet: ${Number(r.lat).toFixed(2)}, ${Number(r.lon).toFixed(2)}</p>
 ${r.note?`<p class="catch-entry-note">${esc(r.note)}</p>`:''}
 ${allowedURL?`<a href="${esc(r.source_url)}" target="_blank" rel="noopener noreferrer">Externer Originalbeitrag ↗</a>`:''}
 <div class="catch-weather"><span>${esc(weather)}</span>${wt?`<div class="catch-weather-grid"><span>Wind: ${fmt(wt.wind_kmh,' km/h')}</span><span>aus ${fmt(wt.wind_from_deg,'°',0)}</span><span>Böen: ${fmt(wt.gust_kmh,' km/h')}</span><span>Wellen: ${fmt(wt.wave_m,' m')}</span><span>Strömung: ${fmt(wt.current_kmh,' km/h')}</span><span>Wassertemp.: ${fmt(wt.sst_c,' °C')}</span></div><p class="small-muted">Raster-/Reanalysedaten, keine lokalen Messungen. ${esc((wt.warnings||[]).join(' '))}</p>`:''}</div>
 <div class="catch-entry-actions">${wt?'':`<button data-catch-weather="${esc(r.id)}">Wetter laden</button>`}${allowedURL&&r.evidence_status!=='source_reviewed'?`<button data-catch-review="${esc(r.id)}">Quelle prüfen</button>`:''}<button data-catch-delete="${esc(r.id)}">Löschen</button></div></article>`;
}
function attachSpot(s,region){
 const grid=document.getElementById('detail-panel')?.querySelector('.action-grid');if(!grid||!s)return;
 const btn=document.createElement('button');btn.type='button';btn.textContent='◉ Fang/Ausflug erfassen';btn.title='Koordinaten ungefähr übernehmen, um eigene echte Beobachtungen zu dokumentieren';
 btn.onclick=()=>{prefill={lat:s.lat,lon:s.lon,region:region.id};document.querySelector('[data-tab="catches"]')?.click();};
 grid.appendChild(btn);
}
window.CoastCatches={render,attachSpot};
window.__COASTFINDER_TIME_TEST__=coastLocalToUTC;
})();
