/* COASTFINDER Angelzentrale — local trip planning, not a catch prediction. */
(function(root){
'use strict';
const KEY='coastfinder:angler-plan:v1';
const FISH=['Wolfsbarsch','Dorade','Meerbrasse','Dentex','Makrele','Andere Art'];
const METHODS=['Spinnfischen','Grundangeln','Posenangeln','Jiggen vom Ufer','Anderes'];
const CHECKS=[
  ['license','Erlaubnis, Artenschutz und Mindestmaße vor Ort geprüft'],
  ['access','Zugang, Privatgelände und Schutzgebiet geprüft'],
  ['safety','Brandung, Wind, Strömung und Fluchtweg vor Ort geprüft'],
  ['gear','Notfallkontakt, Handy und passende Sicherheitsausrüstung']
];
const PACK={
  'Spinnfischen':['Rute und Rolle','Kunstköder und Vorfach','Hakenlöser/Zange','Kescherausrüstung'],
  'Grundangeln':['Rute und Rolle','Vorfach, Haken und Gewichte','Zulässiger Köder','Bissanzeiger'],
  'Posenangeln':['Rute und Rolle','Pose und Vorfach','Zulässiger Köder','Kescherausrüstung'],
  'Jiggen vom Ufer':['Rute und Rolle','Jigs und Vorfach','Zange/Hakenlöser','Kescherausrüstung'],
  'Anderes':['Rute und Rolle','Geeignete Montage','Hakenlöser','Kescherausrüstung']
};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const validSpot=s=>s&&typeof s==='object'&&typeof s.name==='string'&&
 Number.isFinite(s.lat)&&Number.isFinite(s.lon)&&Math.abs(s.lat)<=90&&Math.abs(s.lon)<=180;
function localDatetime(country='HR'){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:country==='FR'?'Europe/Paris':'Europe/Zagreb',
    year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const part=k=>parts.find(p=>p.type===k)?.value;
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}
function fresh(){return {fish:'Wolfsbarsch',method:'Spinnfischen',time:'',spot:null,checks:{}};}
function safeRead(){
  try{
    const v=JSON.parse(root.localStorage.getItem(KEY)||'null');
    if(!v||typeof v!=='object'||Array.isArray(v))return fresh();
    return {
      fish:FISH.includes(v.fish)?v.fish:'Andere Art',
      method:METHODS.includes(v.method)?v.method:'Anderes',
      time:typeof v.time==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(v.time)?v.time:'',
      spot:validSpot(v.spot)?{name:v.spot.name.slice(0,130),lat:v.spot.lat,lon:v.spot.lon,
        region:String(v.spot.region||'').slice(0,30),country:v.spot.country==='FR'?'FR':'HR',
        category:String(v.spot.category||'').slice(0,30)}:null,
      checks:Object.fromEntries(CHECKS.map(([id])=>[id,v.checks?.[id]===true]))
    };
  }catch{return fresh();}
}
let plan=safeRead(),weatherSerial=0;
function persist(){try{root.localStorage.setItem(KEY,JSON.stringify(plan));return true;}catch{return false;}}
function useSpot(spot,region){
  if(!validSpot(spot))return false;
  plan.spot={name:spot.name.slice(0,130),lat:spot.lat,lon:spot.lon,
    category:String(spot.category||'').slice(0,30),region:region?.id||'',
    country:region?.country==='FR'?'FR':'HR'};
  plan.checks={};persist();return true;
}
function modelForPlan(hours,date){
  if(!Array.isArray(hours)||!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(date||''))return null;
  // Model hours are already in the chosen region's local time zone.
  const target=date.slice(0,16);
  return hours.find(h=>typeof h?.time==='string'&&h.time>=target&&
    (Date.parse(h.time.slice(0,19)) - Date.parse(target))>=0&&
    (Date.parse(h.time.slice(0,19)) - Date.parse(target))<=2*3600000)||null;
}
function render(region){
  const host=root.document?.getElementById('angeln-panel');
  if(!host)return;
  const country=plan.spot?.country||region?.country||'HR';
  const legal=country==='HR'
    ?{url:'https://www.gov.hr/en/marine-recreational-and-sport-fisheries/1542',
      title:'Kroatien: staatliche Angel-Lizenzen und Meeresangelregeln',
      note:'Beim Meeresangeln ist grundsätzlich auch vom Ufer eine Lizenz nötig. Schutzgebiete können zusätzliche Regeln haben.'}
    :{url:'https://www.service-public.gouv.fr/particuliers/vosdroits/F2118',
      title:'Frankreich: offizielle Meeresangel-Regeln',
      note:'Registrierung, Artenschutz und Fangmeldung unterscheiden sich nach Küstenabschnitt und Fischart. Aktuelle örtliche Regeln prüfen.'};
  if(!plan.time)plan.time=localDatetime(country);
  const options=(values,chosen)=>values.map(x=>`<option value="${esc(x)}"${x===chosen?' selected':''}>${esc(x)}</option>`).join('');
  const checked=CHECKS.filter(([id])=>plan.checks[id]).length;
  const spot=plan.spot;
  host.innerHTML=`<div class="section-body angler-hub">
    <div class="angler-intro"><b>ANGELZENTRALE · PRIVAT</b><h2>Deinen nächsten Angeltrip planen</h2>
      <p>Zielfisch und Methode festlegen, Spot übernehmen, Bedingungen abrufen und Sicherheitsfragen prüfen. Keine erfundene Fangchance.</p></div>
    <div class="angler-form">
      <label>Zielfisch<select id="angler-fish">${options(FISH,plan.fish)}</select></label>
      <label>Angelmethode<select id="angler-method">${options(METHODS,plan.method)}</select></label>
      <label>Geplante Zeit am Fangort<input id="angler-time" type="datetime-local" value="${esc(plan.time)}"></label>
    </div>
    <div class="angler-spot">
      <strong>${spot?esc(spot.name):'Noch kein Spot gewählt'}</strong>
      <p>${spot?`${spot.lat.toFixed(4)}, ${spot.lon.toFixed(4)} · ${esc(spot.region||'ohne Region')} · selbst ausgewählter Kartenpunkt`:'Öffne einen gefundenen Spot und wähle „Angeltrip planen“, oder nutze den Kartenmittelpunkt als unverifizierten Kandidaten.'}</p>
      <button type="button" id="angler-mapcenter">Kartenmittelpunkt übernehmen</button>
      ${spot?`<button type="button" id="angler-clearspot">Spot entfernen</button><a target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/dir/?api=1&amp;destination=${encodeURIComponent(spot.lat+','+spot.lon)}">Route ansehen</a>`:''}
    </div>
    <div class="angler-section"><h3>Ausrüstung für ${esc(plan.method)}</h3>
      <ul>${(PACK[plan.method]||PACK.Anderes).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
      <p>Beispielliste, keine verbindliche Materialempfehlung.</p></div>
    <div class="angler-section"><h3>Vor dem Angeln prüfen · ${checked}/4</h3>
      ${CHECKS.map(([id,text])=>`<label class="angler-check"><input type="checkbox" data-angler-check="${id}"${plan.checks[id]?' checked':''}> ${esc(text)}</label>`).join('')}
      <p>Häkchen sind deine eigene Bestätigung. Die App prüft weder lokale Angelgenehmigungen noch die Sicherheit eines Zugangs.</p>
      <div class="angler-legal"><strong>Amtliche Informationen · ${country}</strong>
      <p>${esc(legal.note)}</p><a href="${legal.url}" target="_blank" rel="noopener noreferrer">${esc(legal.title)} ↗</a></div></div>
    <div class="angler-section"><h3>Wind, Wellen und Strömung</h3>
      <button id="angler-weather" type="button"${!spot?' disabled':''}>Prognose für diesen Plan prüfen</button>
      <div id="angler-weather-result" class="angler-weather-result" aria-live="polite">${spot?'Noch keine aktuellen Modelldaten geladen.':'Für die Wetterprüfung zuerst einen Kartenpunkt auswählen.'}</div>
      <p>Wettermodelle sind keine Messungen am Ufer. Gezeiten, Fischereirecht und Schutzgebiete separat anhand offizieller Stellen prüfen.</p></div>
    <div class="angler-section"><h3>Nach dem Angeln</h3>
      <p>Fang und auch Nullfang im privaten Logbuch dokumentieren. Nur solche eigenen Daten können später überprüfbare Muster liefern.</p>
      <button id="angler-log" type="button">Zum Fanglogbuch</button></div>
    <div id="angler-save-status" class="angler-save-status">Plan ausschließlich im Browser gespeichert. Exportiere wichtige Fangdaten separat.</div>
  </div>`;
  const notify=()=>{const el=host.querySelector('#angler-save-status');el.textContent=persist()?
    'Plan lokal gespeichert. Keine Cloud-Synchronisierung.':'Speichern fehlgeschlagen: Gerätespeicher oder privater Modus prüfen.';};
  host.querySelector('#angler-fish').onchange=e=>{plan.fish=e.target.value;notify();};
  host.querySelector('#angler-method').onchange=e=>{plan.method=e.target.value;notify();render(region);};
  host.querySelector('#angler-time').onchange=e=>{plan.time=e.target.value;notify();};
  host.querySelectorAll('[data-angler-check]').forEach(el=>el.onchange=e=>{plan.checks[e.target.dataset.anglerCheck]=e.target.checked;notify();render(region);});
  host.querySelector('#angler-mapcenter').onclick=()=>{
    const state=root.__COASTFINDER_TEST__?.getState?.();
    if(!state)return;
    useSpot({name:'Kartenmittelpunkt (nicht als Angelspot verifiziert)',lat:state.lat,lon:state.lon,category:'unknown'},region);
    render(region);
  };
  host.querySelector('#angler-clearspot')?.addEventListener('click',()=>{plan.spot=null;plan.checks={};persist();render(region);});
  host.querySelector('#angler-log').onclick=()=>root.document.querySelector('[data-tab="catches"]')?.click();
  host.querySelector('#angler-weather').onclick=async()=>{
    const out=host.querySelector('#angler-weather-result'),button=host.querySelector('#angler-weather');
    const chosen=plan.spot;if(!chosen)return;
    const serial=++weatherSerial;button.disabled=true;out.textContent='Aktuelle Modelle werden geladen …';
    try{
      if(!root.CoastIntel?.load)throw Error('Wettermodul nicht verfügbar');
      const forecast=await root.CoastIntel.load(chosen.lat,chosen.lon,chosen.country);
      if(serial!==weatherSerial||!host.isConnected)return;
      const h=modelForPlan(forecast.hours,plan.time);
      if(!h){out.textContent='Keine passende Modellstunde innerhalb von zwei Stunden des geplanten Termins. Kein Ersatzwert.';return;}
      const fmt=(value,unit,d=1)=>Number.isFinite(value)?value.toFixed(d)+unit:'keine Daten';
      out.innerHTML=`<b>${esc(h.time.replace('T',' '))} Uhr · Modell</b>
        <p>Wind: ${fmt(h.wind,' km/h',0)} · Wellen: ${fmt(h.wave,' m')} · Strömung: ${fmt(h.current,' km/h',2)}</p>
        <p>Modellbelastung: ${Number.isFinite(h.assessment?.burden)?h.assessment.burden+'/100':'nicht berechenbar'}.
        ${h.assessment?.risks?.length?esc(h.assessment.risks.join(' · ')):'Keine Warnung aus den verfügbaren Modellvariablen; keine Sicherheitsfreigabe.'}</p>
        ${forecast.errors?.length?`<p>Fehlende Quellen: ${esc(forecast.errors.join('; '))}</p>`:''}`;
    }catch(e){if(serial===weatherSerial)out.textContent='Wetterprüfung fehlgeschlagen: '+String(e.message).slice(0,160);}
    finally{if(serial===weatherSerial)button.disabled=false;}
  };
}
root.CoastAngling={render,useSpot,modelForPlan,readPlan:()=>plan,validateSpot:validSpot};
})(typeof window!=='undefined'?window:globalThis);
