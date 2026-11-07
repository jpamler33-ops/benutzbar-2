/* COASTFINDER V2 – weather/marine model connector and transparent conditions indicator.
 * No catch predictions, no navigation/safety certification. Standalone and Node-testable.
 */
(function(root,factory){
  const out=factory();
  if(typeof module==='object'&&module.exports)module.exports=out;
  if(root)root.CoastIntel=out;
})(typeof globalThis!=='undefined'?globalThis:null,function(){
'use strict';
const WEATHER='https://api.open-meteo.com/v1/forecast';
const MARINE='https://marine-api.open-meteo.com/v1/marine';
const W_VARS=['wind_speed_10m','wind_direction_10m','wind_gusts_10m','temperature_2m','precipitation'];
const M_VARS=['wave_height','wave_direction','wave_period','swell_wave_height','sea_surface_temperature','ocean_current_velocity','ocean_current_direction','sea_level_height_msl'];
const cache=new Map(), CACHE_MS=30*60*1000;
function num(x){return typeof x==='number'&&Number.isFinite(x)?x:null;}
function angle(x){return ((x%360)+360)%360;}
function diff(a,b){if(num(a)===null||num(b)===null)return null;const d=Math.abs(angle(a)-angle(b));return Math.min(d,360-d);}
function season(month){if(!Number.isInteger(month)||month<1||month>12)throw new Error('Ungültiger Monat');return [12,1,2].includes(month)?'Winter':[3,4,5].includes(month)?'Frühling':[6,7,8].includes(month)?'Sommer':'Herbst';}
function validateCoord(lat,lon){if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lon)||Math.abs(lon)>180)throw Error('Ungültige Koordinaten');}
function urls(lat,lon,country='HR'){
  validateCoord(lat,lon);
  // UTC timestamps are unambiguous across device zones and DST transitions.
  const base={latitude:lat.toFixed(5),longitude:lon.toFixed(5),timezone:'UTC',forecast_days:'7'};
  const weather=new URL(WEATHER);for(const[k,v]of Object.entries({...base,hourly:W_VARS.join(','),wind_speed_unit:'kmh'}))weather.searchParams.set(k,v);
  const marine=new URL(MARINE);for(const[k,v]of Object.entries({...base,hourly:M_VARS.join(','),cell_selection:'sea',wind_speed_unit:'kmh'}))marine.searchParams.set(k,v);
  return {weather:weather.toString(),marine:marine.toString()};
}
async function fetchOne(url,outerSignal){
  const ctl=new AbortController();const stop=()=>ctl.abort();if(outerSignal?.aborted)throw Object.assign(new Error('Abgebrochen'),{name:'AbortError'});
  outerSignal?.addEventListener('abort',stop,{once:true});const tid=setTimeout(()=>ctl.abort(),15000);
  try{
    const response=await fetch(url,{signal:ctl.signal,headers:{Accept:'application/json'}});
    if(!response.ok)throw Error('API HTTP '+response.status);
    const data=await response.json();if(data.error)throw Error(String(data.reason||'Ungültige Modellantwort'));
    if(!data.hourly?.time||!Array.isArray(data.hourly.time))throw Error('Keine Stundenwerte verfügbar');
    return data;
  }finally{clearTimeout(tid);outerSignal?.removeEventListener('abort',stop);}
}
// Fetches are on explicit user interaction only; no background polling and no bundled historical data.
async function load(lat,lon,country='HR',signal){
  const key=`${lat.toFixed(3)},${lon.toFixed(3)},${country}`;
  const hit=cache.get(key);if(hit&&Date.now()-hit.at<CACHE_MS)return {...hit.value,cached:true};
  const q=urls(lat,lon,country);
  const results=await Promise.allSettled([fetchOne(q.weather,signal),fetchOne(q.marine,signal)]);
  if(signal?.aborted)throw Object.assign(new Error('Abgebrochen'),{name:'AbortError'});
  const weather=results[0].status==='fulfilled'?results[0].value:null;
  const marine=results[1].status==='fulfilled'?results[1].value:null;
  const errors=results.map((x,i)=>x.status==='rejected'?`${i?'Marine':'Wetter'}: ${String(x.reason?.message||'Abruf fehlgeschlagen')}`:null).filter(Boolean);
  if(!weather&&!marine)throw Error(errors.join(' · ')||'Keine Modelldaten verfügbar');
  const hours=joinHours(weather,marine);
  const value={hours,errors,weatherLoaded:!!weather,marineLoaded:!!marine,weatherApi:q.weather,marineApi:q.marine,updatedAt:Date.now(),cached:false};
  cache.set(key,{value,at:Date.now()});return value;
}
function joinHours(w,m){
  // Weather and marine models may differ by timestamp or coverage. Never index-join arrays.
  const wm=new Map(), mm=new Map();
  if(w?.hourly?.time)w.hourly.time.forEach((t,i)=>wm.set(t,i));
  if(m?.hourly?.time)m.hourly.time.forEach((t,i)=>mm.set(t,i));
  const times=[...new Set([...wm.keys(),...mm.keys()])].sort();
  const read=(obj,key,index)=>index===undefined?null:num(obj?.hourly?.[key]?.[index]);
  return times.map(time=>{
    const wi=wm.get(time),mi=mm.get(time);
    const h={time,wind:read(w,'wind_speed_10m',wi),windFrom:read(w,'wind_direction_10m',wi),gust:read(w,'wind_gusts_10m',wi),precipitation:read(w,'precipitation',wi),airTemp:read(w,'temperature_2m',wi),wave:read(m,'wave_height',mi),waveFrom:read(m,'wave_direction',mi),wavePeriod:read(m,'wave_period',mi),swell:read(m,'swell_wave_height',mi),sst:read(m,'sea_surface_temperature',mi),current:read(m,'ocean_current_velocity',mi),currentTo:read(m,'ocean_current_direction',mi),seaLevel:read(m,'sea_level_height_msl',mi)};
    h.assessment=assess(h);return h;
  });
}
function assess(h){
  const wind=num(h.wind),gust=num(h.gust),wave=num(h.wave),current=num(h.current);
  const complete=wind!==null&&wave!==null;
  const windTo=num(h.windFrom)===null?null:angle(h.windFrom+180);
  const opposite=diff(windTo,h.currentTo);
  const against=opposite!==null&&opposite>=130&&wind!==null&&wind>=12&&current!==null&&current>=0.4;
  const risks=[],reasons=[];
  if(wave===null)risks.push('Wellenmodell fehlt');
  if(wind===null)risks.push('Windmodell fehlt');
  if(gust===null)risks.push('Böen fehlen');
  if(current===null)risks.push('Strömungsmodell fehlt');
  if(wind!==null&&wind>=30)risks.push('Kräftiger Wind');
  if(gust!==null&&gust>=45)risks.push('Starke Böen');
  if(wave!==null&&wave>=1.5)risks.push('Erhöhte Wellenhöhe');
  if(against)risks.push('Wind und Modellströmung gegenläufig');
  // Burden 0..100, only when both wind and wave available. Higher means MORE load, not catch chance.
  if(!complete)return {burden:null,against,oppositionAngle:opposite,risks,level:'Daten unvollständig',reasons};
  const windP=Math.min(30,wind*0.75);const waveP=Math.min(38,wave*20);
  const gustP=gust!==null?Math.min(18,Math.max(0,gust-15)*0.5):0;
  const currentP=current!==null?Math.min(8,current*6):0;
  const contraP=against?6:0;
  reasons.push(`Wind ${windP.toFixed(1)}/30`,`Wellen ${waveP.toFixed(1)}/38`,`Böen ${gustP.toFixed(1)}/18`,`Strömung ${currentP.toFixed(1)}/8`,`Gegenläufigkeit ${contraP}/6`);
  const burden=Math.min(100,Math.round(windP+waveP+gustP+currentP+contraP));
  const elevated=risks.some(x=>['Kräftiger Wind','Starke Böen','Erhöhte Wellenhöhe','Wind und Modellströmung gegenläufig'].includes(x));
  return {burden,against,oppositionAngle:opposite,risks,level:elevated?'Deutlich erhöhte Belastung':burden>=45?'Erhöhte Belastung':burden>=20?'Mäßige Belastung':'Modell: geringe Belastung',reasons};
}
function modelDate(time){return new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(time)?time:time+'Z');}
function localIso(time,country='HR'){
  const date=modelDate(time),tz=country==='FR'?'Europe/Paris':'Europe/Zagreb';
  if(!Number.isFinite(date.getTime()))return '';
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(x=>[x.type,x.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
function dayGroups(hours,now=new Date(),country='HR'){
  const o=new Map();
  for(const h of hours){const day=localIso(h.time,country).slice(0,10);if(!day)continue;if(!o.has(day))o.set(day,[]);o.get(day).push(h);
  }
  return [...o].map(([day,records])=>({day,records}));
}
// Relative model-load windows, not advice to enter a coast or prediction of fish activity.
function relativeWindows(hours,now=new Date(),maxResults=3,country='HR'){
  const future=hours.filter(h=>{
    const at=modelDate(h.time);return Number.isFinite(at.getTime())&&at.getTime()>=now.getTime()&&h.assessment?.burden!==null;
  });
  const perWindow=new Map();
  for(const h of future){
    // Four-hour time buckets prevent returning adjacent hours as independent opportunities.
    const local=localIso(h.time,country),bucket=local.slice(0,10)+'-'+Math.floor(Number(local.slice(11,13))/4);
    const prev=perWindow.get(bucket);
    if(!prev||h.assessment.burden<prev.assessment.burden)perWindow.set(bucket,h);
  }
  return [...perWindow.values()].sort((a,b)=>a.assessment.burden-b.assessment.burden).slice(0,maxResults);
}
function regionalClues(region,month){
  const clues=[];
  if(region?.country==='HR'&&[6,7,8].includes(month))clues.push({kind:'HYPOTHESE · Forum',text:'Einige Kroatien-Erfahrungsberichte bevorzugen im Hochsommer frühe Morgen- und späte Abendstunden. Das ist keine allgemeine Fangregel.',source:'https://www.barsch-alarm.de/community/threads/k%C3%BCstenfischerei-kroatien.35427/'});
  if(region?.id==='brittany')clues.push({kind:'FORUMBEOBACHTUNG',text:'In Bretagne-Berichten werden Wind und Tiden als wesentliche Kontextfaktoren diskutiert. Verlässliche örtliche Gezeitenzeiten sind hier noch nicht eingebunden.',source:'https://forum.gobages.com/t/premier-sejour-en-bretagne-comment-pecher-le-bar-du-bord/40708'});
  if(region?.id==='normandy')clues.push({kind:'FORUMBEOBACHTUNG',text:'An der Normandieküste berichten Angler von unterschiedlichen Präferenzen je nach Tide, Wind und Brandung. Die appübergreifende Aussage bleibt unsicher.',source:'https://pechemercotentin.forumactif.org/t156-conditions-meteo-pour-peche-au-leurre-du-bord'});
  return clues;
}
const SOURCES=[
 {id:'hr-2026-zadar',region:'zadar',country:'HR',kind:'Forum',title:'Zadar: Shore-Fishing-Austausch (2026)',url:'https://www.anglerboard.de/threads/travel-rute-fuers-shore-fishing-in-kroatien-gesucht.365103/',date:'2026-05',topic:'Uferangeln / Methoden',insight:'Erfahrungsbericht zu Methoden und Bedingungen rund um Zadar; persönliche Einschätzung, keine Fangstatistik.'},
 {id:'hr-istria-pula',region:'istria',country:'HR',kind:'Forum',title:'Pula / Istrien: felsige Küste und Tiefenkanten',url:'https://www.barsch-alarm.de/community/threads/angeln-in-pula-kroatien.42978/',date:'2019',topic:'Strukturen',insight:'Mitglieder diskutieren Tiefenkanten und mögliche Küstenbereiche. Tiefenangaben sind nicht vermessen.'},
 {id:'hr-general',region:'all',country:'HR',kind:'Forum',title:'Küstenfischerei Kroatien: Ufer und Tageszeit',url:'https://www.barsch-alarm.de/community/threads/k%C3%BCstenfischerei-kroatien.35427/',date:'2017',topic:'Saison',insight:'Ein Angler beschreibt unterschiedliche Erlebnisse je nach Tageszeit und Saison; nicht repräsentativ.'},
 {id:'hr-current',region:'all',country:'HR',kind:'Forum-Übersicht',title:'Morski ribolov: regionale Adria-Diskussionen',url:'https://morski-ribolov.net/',date:'2026',topic:'Regionale Berichte',insight:'Regionale Unterforen zu Istrien, Kvarner und Dalmatien; einzelne Beiträge müssen separat geprüft werden.'},
 {id:'hr-cres-2026',region:'istria',country:'HR',kind:'Forum',title:'Kroatien 2026: Erfahrung aus Cres',url:'https://angelforum.at/viewtopic.php?t=24743&start=105',date:'2026-07',topic:'Sommer',insight:'Ein Nutzer berichtet von wenig sichtbarer Aktivität bei Hitze und Windstille. Einzelfall.'},
 {id:'fr-bretagne',region:'brittany',country:'FR',kind:'Forum',title:'Bretagne: Wolfsbarsch vom Ufer, Wind und Gezeiten',url:'https://forum.gobages.com/t/premier-sejour-en-bretagne-comment-pecher-le-bar-du-bord/40708',date:'2026-08',topic:'Wind / Gezeiten',insight:'Austausch über Wind, Tiden und Küstenwechsel; keine allgemeingültige Erfolgsregel.'},
 {id:'fr-normandy',region:'normandy',country:'FR',kind:'Forum',title:'Cotentin: Wetterbedingungen beim Küstenangeln',url:'https://pechemercotentin.forumactif.org/t156-conditions-meteo-pour-peche-au-leurre-du-bord',date:'Datum unklar',topic:'Wind / Tiden',insight:'Subjektive Meinungen zu Windrichtung, Gezeiten und Brandung.'},
 {id:'fr-azur',region:'riviera',country:'FR',kind:'Forum',title:'Côte d’Azur: Ufer-Spinnfischen im Var',url:'https://www.achigan.net/msgforum.php?id_sujet=26633',date:'2014',topic:'Technik / Orte',insight:'Älterer Thread über Spinnfischen vom Ufer, lokale Tipps und Angeltechniken.'},
 {id:'fr-azur2',region:'riviera',country:'FR',kind:'Forum',title:'Shore Jigging / Côte d’Azur',url:'https://www.barsch-alarm.de/community/threads/der-shore-jigging-spinning-plausch.61193/page-191',date:'2025-04',topic:'Erfahrungsbericht',insight:'Diskussion von Einzelfängen und Methoden an Mittelmeerküsten; keine gesicherten allgemeinen Muster.'}
];
const QUERIES={HR:['ribolov s obale','shore fishing','angeln vom ufer'],FR:['pêche du bord mer','surfcasting','shore fishing']};
function searchLinks(region){const country=region?.country==='FR'?'FR':'HR';const regionName=region?.name||'';const q=QUERIES[country][0]+' '+regionName+' courant vent saison';const data=[
  {name:'Forum-übergreifend',url:'https://www.google.com/search?q='+encodeURIComponent(q+' forum')},
  {name:'Reddit (Websuche)',url:'https://www.google.com/search?q='+encodeURIComponent(q+' site:reddit.com')},
  {name:'Erfahrungen (Barsch-Alarm)',url:'https://www.google.com/search?q='+encodeURIComponent(q+' site:barsch-alarm.de/community')},
  {name:country==='HR'?'Adria-Forum':'Französische Angelforen',url:'https://www.google.com/search?q='+encodeURIComponent(q+(country==='HR'?' site:morski-ribolov.net':' site:forum.gobages.com OR site:achigan.net'))},
];return data;
}
return {urls,load,joinHours,assess,season,diff,dayGroups,SOURCES,searchLinks,num,relativeWindows,regionalClues,modelDate,localIso};
});
