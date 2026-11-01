/* COASTFINDER FREE – PRIVATE local device storage. No paid backend, no tokens, no sync. */
(()=>{'use strict';
const KEY='coastfinder:free:catches:v1';
const regions=['istria','zadar','split','dubrovnik','brittany','normandy','riviera'];
const seasons=['Winter','Frühling','Sommer','Herbst'];
const MAX_RECORDS=500;
function asArray(){let arr;try{arr=JSON.parse(localStorage.getItem(KEY)||'[]');}catch{arr=[];}return Array.isArray(arr)?arr:[];}
function persist(rows){try{localStorage.setItem(KEY,JSON.stringify(rows));}catch{throw Error('Speicher voll oder im privaten Modus gesperrt. Exportiere deine Daten und prüfe den Gerätespeicher.');}}
function validSource(s){if(!s)return null;try{const u=new URL(s);if(u.protocol!=='https:'||u.username||u.password)throw 0;return u.href;}catch{throw Error('Externe Quelle muss ein gültiger HTTPS-Link sein.');}}
function validate(p){
 if(!p||typeof p!=='object')throw Error('Ungültige Meldung');
 const kind=p.source_kind,region=p.region;
 if(!['own','external'].includes(kind)||!regions.includes(region))throw Error('Ungültige Region oder Meldungsart');
 const fish=String(p.fish||'').trim(),method=String(p.method||'').trim(),note=String(p.note||'');
 if(!fish||fish.length>60||!method||method.length>80||note.length>1000)throw Error('Fischart, Angelmethode oder Notiz ungültig');
 const catches=Number(p.catches),effort=p.effort_hours==null?null:Number(p.effort_hours),lat=Number(p.lat),lon=Number(p.lon);
 if(!Number.isInteger(catches)||catches<0||catches>10000)throw Error('Fanganzahl ungültig');
 if(kind==='own'&&(!Number.isFinite(effort)||effort<.25||effort>48))throw Error('Eigene Ausflüge benötigen 0,25–48 Angelstunden');
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw Error('Koordinaten ungültig');
 const timestamp=Date.parse(p.caught_at_utc||'');if(!Number.isFinite(timestamp)||timestamp>Date.now()+86400000)throw Error('Datum ungültig oder in der Zukunft');
 const sourceUrl=validSource(p.source_url);if(kind==='external'&&!sourceUrl)throw Error('Externe Meldungen brauchen einen Quelllink');
 const local=new Intl.DateTimeFormat('en-CA',{timeZone:region==='brittany'||region==='normandy'||region==='riviera'?'Europe/Paris':'Europe/Zagreb',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(timestamp));
 const month=Number(new Intl.DateTimeFormat('en-US',{timeZone:region==='brittany'||region==='normandy'||region==='riviera'?'Europe/Paris':'Europe/Zagreb',month:'numeric'}).format(new Date(timestamp)));
 const season=month===12||month<=2?'Winter':month<=5?'Frühling':month<=8?'Sommer':'Herbst';
 return {id:crypto.randomUUID(),source_kind:kind,evidence_status:'unverified',source_url:sourceUrl,region,country:['brittany','normandy','riviera'].includes(region)?'FR':'HR',fish,catches,
   effort_hours:kind==='own'?effort:null,method,lat:Math.round(lat*100)/100,lon:Math.round(lon*100)/100,caught_at_utc:new Date(timestamp).toISOString(),season,local_date:local,
   note,created_at:new Date().toISOString(),weather_status:'not_loaded',weather:null};
}
function stats(rows){
 const own=rows.filter(x=>x.source_kind==='own'&&x.effort_hours!=null);
 const groups=new Map(),strata=new Map();
 for(const r of own){
  const k=[r.region,r.fish,r.season].join('|');
  if(!groups.has(k))groups.set(k,{region:r.region,fish:r.fish,season:r.season,sessions:0,zero_sessions:0,catch_sessions:0,caught_fish:0,hours:0,weather_matched:0,days:new Set()});
  const g=groups.get(k);g.sessions++;g.zero_sessions+=Number(r.catches===0);g.catch_sessions+=Number(r.catches>0);g.caught_fish+=r.catches;g.hours+=r.effort_hours;g.days.add(r.local_date);g.weather_matched+=Number(r.weather?.wind_kmh!=null);
  for(const [metric,val,lims] of [['Wind km/h',r.weather?.wind_kmh,[10,25]],['Wellen m',r.weather?.wave_m,[.5,1.5]]]){
    if(!Number.isFinite(val))continue;
    const band=val<=lims[0]?`≤ ${lims[0]}`:val<=lims[1]?`${lims[0]}–${lims[1]}`:`> ${lims[1]}`;
    const kk=[k,metric,band].join('|');
    if(!strata.has(kk))strata.set(kk,{region:r.region,fish:r.fish,season:r.season,metric,band,sessions:0,zero_sessions:0,catch_sessions:0,hours:0,catches:0,days:new Set()});
    const s=strata.get(kk);s.sessions++;s.zero_sessions+=Number(r.catches===0);s.catch_sessions+=Number(r.catches>0);s.hours+=r.effort_hours;s.catches+=r.catches;s.days.add(r.local_date);
  }
 }
 const round=(n,d=2)=>Number(n.toFixed(d));
 const groupRows=[...groups.values()].map(g=>{const days=g.days.size;delete g.days;return {...g,distinct_days:days,hours:round(g.hours),cpue_fish_per_hour:round(g.caught_fish/g.hours,3),catch_session_share_pct:round(100*g.catch_sessions/g.sessions,1),sample_quality:g.sessions<10||days<5?'kleine, verzerrungsanfällige Stichprobe':'mehr Meldungen; weiterhin nicht repräsentativ'};}).sort((a,b)=>b.sessions-a.sessions);
 const conditionRows=[...strata.values()].map(g=>{const days=g.days.size;delete g.days;return {...g,distinct_days:days,hours:round(g.hours),cpue_fish_per_hour:round(g.catches/g.hours,3),catch_session_share_pct:round(100*g.catch_sessions/g.sessions,1),interpretation:g.sessions>=8&&days>=4?'Explorativ, nicht kausal':'Zu kleine Stichprobe für Vergleiche'};});
 return {total_sessions:own.length,external_claims:rows.length-own.length,weather_matched:own.filter(r=>r.weather?.wind_kmh!=null).length,groups:groupRows,condition_groups:conditionRows};
}
async function withTimeout(url){const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),14000);try{const resp=await fetch(url,{signal:ctrl.signal});if(!resp.ok)throw Error('Wetter-API HTTP '+resp.status);const data=await resp.json();if(data.error)throw Error(data.reason||'Wetter-API-Fehler');return data;}finally{clearTimeout(timer);}}
function hourValue(obj,key,stamp){const t=obj?.hourly?.time,v=obj?.hourly?.[key];if(!Array.isArray(t)||!Array.isArray(v)||t.length!==v.length)return null;let pos=-1,dist=3601;for(let i=0;i<t.length;i++){const n=Math.abs(Number(t[i])-stamp);if(n<=3600&&n<dist){pos=i;dist=n;}}return pos>=0&&typeof v[pos]==='number'&&Number.isFinite(v[pos])?v[pos]:null;}
async function weather(record){
 const at=new Date(record.caught_at_utc);const days=(Date.now()-at.getTime())/86400000;
 if(days<6)return {status:'unavailable',weather:null,reason:'Historische ERA5-Daten erst nach mehreren Tagen sinnvoll verfügbar.'};
 const day=record.caught_at_utc.slice(0,10),stamp=at.getTime()/1000;
 const p=new URLSearchParams({latitude:String(record.lat),longitude:String(record.lon),start_date:day,end_date:day,timezone:'UTC',timeformat:'unixtime',models:'era5',wind_speed_unit:'kmh',hourly:'wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,precipitation'});
 const res={wind_kmh:null,wind_from_deg:null,gust_kmh:null,air_temp_c:null,rain_mm:null,wave_m:null,current_kmh:null,sst_c:null,warnings:['Historische Rasterdaten sind keine Messung direkt am Ufer.']};
 try{const obj=await withTimeout('https://archive-api.open-meteo.com/v1/archive?'+p.toString());for(const [key,field] of Object.entries({wind_kmh:'wind_speed_10m',wind_from_deg:'wind_direction_10m',gust_kmh:'wind_gusts_10m',air_temp_c:'temperature_2m',rain_mm:'precipitation'}))res[key]=hourValue(obj,field,stamp);}
 catch(e){res.warnings.push('Wetterdienst nicht erreichbar: '+String(e.message).slice(0,100));}
 const found=Object.keys(res).some(k=>k!=='warnings'&&res[k]!=null);
 if(!found)return {status:'unavailable',weather:null,reason:res.warnings.join(' ')};
 res.warnings.push('Keine historischen Wellen- oder Strömungswerte in dieser kostenlosen Browser-Auswertung.');
 return {status:'partial',weather:res,reason:null};
}
async function api(path,opts={}){
 const method=(opts.method||'GET').toUpperCase();let rows=asArray();
 if(path==='health')return {configured:true,backend:'COASTFINDER FREE – browser local only',private:true};
 if(path.startsWith('records?')||path==='records'&&method==='GET')return {records:rows.slice().sort((a,b)=>b.caught_at_utc.localeCompare(a.caught_at_utc)).slice(0,100),count:rows.length};
 if(path==='stats')return stats(rows);
 if(path==='records'&&method==='POST'){
   if(rows.length>=MAX_RECORDS)throw Error('Lokales Limit von 500 Einträgen erreicht – Daten exportieren und archivieren.');
   const record=validate(JSON.parse(opts.body||'{}'));rows.push(record);persist(rows);return {record};
 }
 const match=/^record\/([0-9a-f-]{20,50})(?:\/(weather|review))?$/.exec(path);
 if(!match)throw Error('Lokale Aktion unbekannt');const ix=rows.findIndex(r=>r.id===match[1]);if(ix<0)throw Error('Eintrag nicht gefunden');
 if(method==='DELETE'&&!match[2]){rows.splice(ix,1);persist(rows);return {deleted:true};}
 if(method==='POST'&&match[2]==='weather'){
   const w=await weather(rows[ix]);rows[ix].weather=w.weather;rows[ix].weather_status=w.status;rows[ix].weather_error=w.reason;persist(rows);return {record:rows[ix]};
 }
 if(method==='POST'&&match[2]==='review'){
   const note=JSON.parse(opts.body||'{}').note;
   if(!rows[ix].source_url||typeof note!=='string'||note.trim().length<12||note.trim().length>300)throw Error('Quellenprüfung erfordert Link und 12–300 Zeichen Prüfbeschreibung');
   rows[ix].evidence_status='source_reviewed';rows[ix].review_note=note.trim();persist(rows);return {record:rows[ix]};
 }
 throw Error('Lokale Aktion nicht unterstützt');
}
function exportData(){const body=JSON.stringify({format:'coastfinder-free-catches',version:1,exported_at:new Date().toISOString(),records:asArray()},null,2);const url=URL.createObjectURL(new Blob([body],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='coastfinder-private-fangdaten-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function safeWeather(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const allowed=['wind_kmh','wind_from_deg','gust_kmh','air_temp_c','rain_mm','wave_m','current_kmh','sst_c'];
 const out={};for(const k of allowed){const n=raw[k];out[k]=typeof n==='number'&&Number.isFinite(n)?n:null;}
 out.warnings=Array.isArray(raw.warnings)?raw.warnings.filter(x=>typeof x==='string').slice(0,8).map(x=>x.slice(0,160)):[];
 return out;
}
async function importData(file){if(!file||file.size>2_000_000)throw Error('Datei fehlt oder über 2 MB');const raw=JSON.parse(await file.text());if(raw.format!=='coastfinder-free-catches'||raw.version!==1||!Array.isArray(raw.records))throw Error('Nicht das COASTFINDER-Exportformat');if(raw.records.length>MAX_RECORDS)throw Error('Zu viele Datensätze');const rows=raw.records.map(r=>{const val=validate(r);return {...val,id:/^[0-9a-f-]{20,50}$/.test(r.id||'')?r.id:val.id,created_at:typeof r.created_at==='string'?r.created_at:val.created_at,weather_status:['available','partial','unavailable','not_loaded'].includes(r.weather_status)?r.weather_status:'not_loaded',weather:safeWeather(r.weather)};});const seen=new Set(),merged=[...asArray()];for(const row of rows){if(seen.has(row.id))continue;seen.add(row.id);if(!merged.some(x=>x.id===row.id))merged.push(row);}if(merged.length>MAX_RECORDS)throw Error('Zusammen zu viele Datensätze');persist(merged);return rows.length;}
window.CoastFreeStore={api,stats,validate,exportData,importData,asArray};
})();
