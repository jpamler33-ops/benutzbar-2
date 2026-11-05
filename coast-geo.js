/* COASTFINDER Geo Intelligence: depth transects + EUSeaMap modeled habitat overlay.
   Static browser app, no backend, no key, no inferred fish/catch probability.
   External models are coarse. Users must choose the seaward bearing themselves. */
(function(root, factory) {
  const moduleApi = factory();
  if (typeof module === 'object' && module.exports) module.exports = moduleApi;
  if (root) root.CoastGeo = moduleApi;
})(typeof globalThis !== 'undefined' ? globalThis : null, function() {
'use strict';
const root=typeof globalThis!=='undefined'?globalThis:{};
const DEPTH_ENDPOINT = 'https://rest.emodnet-bathymetry.eu/depth_profile';
const HABITAT_ENDPOINT = 'https://ows.emodnet-seabedhabitats.eu/geoserver/emodnet_view/wms';
const HABITAT_LAYER = 'eusm2025_eunis2019_400';
const CACHE_MS = 30 * 60 * 1000;
const depthCache = new Map();
const directions = [['N',0],['NO',45],['O',90],['SO',135],['S',180],['SW',225],['W',270],['NW',315]];
const isNumber = v => typeof v === 'number' && Number.isFinite(v);
const clean = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function checkCoordinate(lat, lon) {
  if (!isNumber(lat) || !isNumber(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw Error('Ungültige Koordinaten');
}
function destination(lat,lon,bearing,distanceM) {
  checkCoordinate(lat,lon);
  if (!Number.isInteger(bearing) || bearing < 0 || bearing >= 360 || ![250,500,1000].includes(distanceM)) throw Error('Ungültige Profilrichtung oder Länge');
  const r = Math.PI / 180, R = 6371008.8, d = distanceM / R, theta = bearing * r;
  const phi1 = lat * r, lambda1 = lon * r;
  const phi2 = Math.asin(Math.sin(phi1)*Math.cos(d)+Math.cos(phi1)*Math.sin(d)*Math.cos(theta));
  const lambda2 = lambda1+Math.atan2(Math.sin(theta)*Math.sin(d)*Math.cos(phi1),Math.cos(d)-Math.sin(phi1)*Math.sin(phi2));
  return {lat: phi2/r, lon: ((lambda2/r+540)%360)-180};
}
function depthUrl(lat,lon,bearing,distanceM) {
  const end = destination(lat,lon,bearing,distanceM);
  const geom = `LINESTRING(${lon.toFixed(6)} ${lat.toFixed(6)},${end.lon.toFixed(6)} ${end.lat.toFixed(6)})`;
  const url = new URL(DEPTH_ENDPOINT); url.searchParams.set('geom',geom);
  return url.toString();
}
function parseProfile(data,distanceM) {
  if (!Array.isArray(data) || data.length > 10000) throw Error('Profilantwort hat kein gültiges Rasterformat');
  // DTM elevation: negative values are below LAT (water); >= 0 is land/unknown.
  const values = data.map(v => isNumber(v) && v < 0 && v > -12000 ? -v : null);
  const measured = values.filter(isNumber);
  // Missing raster cells are unknown, not a plausible sea-floor gradient.
  // A few valid cells in a mostly empty transect must not produce a "confirmed" range.
  const count = measured.length, total = values.length;
  const coverage = total ? count / total : 0;
  const spacingM = total > 1 ? distanceM / (total - 1) : null;
  const complete = count >= 5 && coverage >= 0.75;
  if (!complete) return {values,count,total,coverage,spacingM,complete:false,min:null,max:null,delta:null,distanceM};
  const min = Math.min(...measured), max = Math.max(...measured);
  return {values,count,total,coverage,spacingM,complete:true,min,max,delta:max-min,distanceM};
}
async function fetchDepth(lat,lon,bearing,distanceM,signal) {
  const url = depthUrl(lat,lon,bearing,distanceM), now = Date.now();
  const item = depthCache.get(url);
  if (item && now-item.time < CACHE_MS) return {...item.value,cached:true};
  if (signal?.aborted) throw Object.assign(Error('Abgebrochen'),{name:'AbortError'});
  const controller = new AbortController(), abort = () => controller.abort();
  signal?.addEventListener('abort',abort,{once:true});
  const timeout = setTimeout(()=>controller.abort(),13000);
  try {
    const response = await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'}});
    if (!response.ok) throw Error('EMODnet HTTP '+response.status);
    const data = await response.json();
    const parsed = parseProfile(data,distanceM);
    const value = {...parsed,url,cached:false};
    depthCache.set(url,{time:Date.now(),value});
    return value;
  } finally {clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
}
function projectedBounds(bounds){
  if (![bounds.s,bounds.w,bounds.n,bounds.e].every(isNumber) || bounds.s >= bounds.n || bounds.w >= bounds.e) throw Error('Kartenausschnitt ungültig');
  return [bounds.s.toFixed(6),bounds.w.toFixed(6),bounds.n.toFixed(6),bounds.e.toFixed(6)].join(',');
}
function habitatUrl(bounds,width,height){
  const url=new URL(HABITAT_ENDPOINT);
  const q={service:'WMS',version:'1.3.0',request:'GetMap',layers:HABITAT_LAYER,styles:'',format:'image/png',transparent:'true',crs:'EPSG:4326',bbox:projectedBounds(bounds),width:String(Math.min(512,Math.max(128,Math.round(width)))),height:String(Math.min(512,Math.max(128,Math.round(height))))};
  Object.entries(q).forEach(([k,v])=>url.searchParams.set(k,v));
  return url.toString();
}
function nearestModelHour(hours,country,at=new Date()){
  if (!Array.isArray(hours)) return null;
  const timezone=country==='FR'?'Europe/Paris':'Europe/Zagreb';
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(at);
  const part=n=>parts.find(p=>p.type===n)?.value;
  const localIso=`${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
  return hours.find(h=>typeof h.time==='string' && h.time>=localIso) || null;
}
function profileChart(profile){
  const v=profile.values;
  if (!profile.complete || v.length<5) return '';
  const w=300,h=98,low=profile.min,range=Math.max(1,profile.max-profile.min);
  const points=v.map((depth,i)=>depth===null?null:[(i/Math.max(1,v.length-1)*w).toFixed(2),(14+(depth-low)/range*(h-24)).toFixed(2)]);
  const segments=[];let current=[];
  for(const p of points){if(p)current.push(p.join(','));else if(current.length){segments.push(current.join(' '));current=[];}}
  if(current.length)segments.push(current.join(' '));
  return `<svg class="geo-profile-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Tiefenprofil mit ${v.length} Rasterwerten über ${profile.distanceM} Meter; größere Tiefe nach unten">${segments.map(s=>`<polyline points="${s}" fill="none" stroke="#80daca" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}</svg>`;
}
function attachSpot(spot,region){
  const host=document.querySelector('#detail-panel .section-body');
  if (!host || !isNumber(spot.lat) || !isNumber(spot.lon)) return;
  const section=document.createElement('section');section.className='geo-intel';
  section.innerHTML=`<div class="intel-label">COAST GEO · ECHTE RASTERDATEN</div><h3>Tiefenprofil + Lebensraumkarte + Wetter</h3><p class="geo-hint">Wähle selbst die Richtung vom Kartenpunkt ins Meer. Die App kennt keine sichere Küstennormale. Profile können über Land oder durch Buchten führen.</p><div class="geo-settings"><label>Profilrichtung<select class="geo-bearing" aria-label="Richtung des Tiefenprofils">${directions.map(([label,deg])=>`<option value="${deg}">${label} (${deg}°)</option>`).join('')}</select></label><label>Distanz<select class="geo-distance" aria-label="Länge des Tiefenprofils"><option value="250">250 m</option><option value="500" selected>500 m</option><option value="1000">1000 m</option></select></label></div><button class="intel-action geo-run" type="button">Tiefenprofil + Wetter analysieren</button><button class="geo-show-layer" type="button">Lebensraumkarte anzeigen</button><div class="geo-reading" aria-live="polite"></div><p class="geo-credit">Quellen: <a target="_blank" rel="noopener noreferrer" href="https://rest.emodnet-bathymetry.eu/">EMODnet Bathymetry</a> · <a target="_blank" rel="noopener noreferrer" href="https://emodnet.ec.europa.eu/en/seabed-habitats">EMODnet Seabed Habitats</a> · <a target="_blank" rel="noopener noreferrer" href="https://open-meteo.com/en/docs/marine-weather-api">Open-Meteo</a>. Keine Fangwahrscheinlichkeit, keine geprüfte Ufertiefe, keine Sicherheitsfreigabe.</p>`;
  host.appendChild(section);
  section.querySelector('.geo-show-layer').onclick=()=>{const btn=document.getElementById('habitat-btn');if(btn?.getAttribute('aria-pressed')!=='true')btn?.click();document.getElementById('drawer')?.classList.remove('expanded');};
  const button=section.querySelector('.geo-run'),reading=section.querySelector('.geo-reading');
  let controller=null;
  section.querySelectorAll('select').forEach(el=>el.addEventListener('change',()=>{controller?.abort();reading.textContent='Richtung/Länge geändert. Für neue Ergebnisse erneut analysieren.';button.disabled=false;}));
  button.onclick=async()=>{
    if(button.disabled)return;
    const bearing=Number(section.querySelector('.geo-bearing').value),distance=Number(section.querySelector('.geo-distance').value);
    controller?.abort();controller=new AbortController();const signal=controller.signal;
    button.disabled=true;reading.textContent='Profil und Modelle werden auf Knopfdruck abgefragt …';
    const profileLink=depthUrl(spot.lat,spot.lon,bearing,distance);
    const [depth,weather]=await Promise.allSettled([fetchDepth(spot.lat,spot.lon,bearing,distance,signal),root.CoastIntel?.load ? root.CoastIntel.load(spot.lat,spot.lon,region.country,signal) : Promise.reject(Error('Wettermodul fehlt'))]);
    if (!section.isConnected||signal.aborted)return;
    let html='';
    if(depth.status==='fulfilled'){
      const p=depth.value;
      html+=p.complete?`<div class="geo-metrics"><div><b>${p.min.toFixed(1)}–${p.max.toFixed(1)} m</b><small>Rastertiefen entlang Profil</small></div><div><b>${p.delta.toFixed(1)} m</b><small>Spannweite, keine Steigung</small></div><div><b>${p.count}/${p.total}</b><small>gültige Rasterpunkte · ${Math.round(p.coverage*100)} %</small></div></div>${profileChart(p)}<p class="geo-hint">Tiefe wird nach unten größer. Tiefenwerte (negative Höhen in positive Wassertiefe umgerechnet). Rechnerischer Profil-Stützpunktabstand ca. ${p.spacingM?.toFixed(0)??"?"} m; tatsächliche Rasterauflösung unbekannt. Küstennahe Genauigkeit begrenzt.</p>`:`<div class="geo-warning">Nicht ausreichend abgedeckt: ${p.count}/${p.total} verwertbare Rasterpunkte (${Math.round(p.coverage*100)} %). Für ein Profil brauchen wir mindestens 5 Werte und 75 % Abdeckung. Land, Modelllücken oder geringe Auflösung möglich. Keine Kante bestätigt.</div>`;
    }else{
      html+=`<div class="geo-warning">Tiefenprofil nicht abrufbar (${clean(depth.reason?.name==='TypeError'?'Netzwerk/CORS':depth.reason?.message||'Dienst nicht verfügbar')}). <a href="${clean(profileLink)}" target="_blank" rel="noopener noreferrer">EMODnet-Abfrage separat öffnen</a>.</div>`;
    }
    if(weather.status==='fulfilled'){
      const h=nearestModelHour(weather.value.hours,region.country);
      html+=h?`<div class="geo-weather"><b>Nächste Modellstunde · ${clean(h.time.replace('T',' '))}</b><p>Wind ${isNumber(h.wind)?h.wind.toFixed(0)+' km/h':'–'} · Wellen ${isNumber(h.wave)?h.wave.toFixed(1)+' m':'–'} · Strömung ${isNumber(h.current)?h.current.toFixed(2)+' km/h':'–'} · Oberflächentemperatur ${isNumber(h.sst)?h.sst.toFixed(1)+' °C':'–'}</p><p>Modellbelastung: ${h.assessment?.burden===null||h.assessment?.burden===undefined?'nicht berechenbar':h.assessment.burden+'/100'} (keine Fangchance).</p></div>`:'<div class="geo-warning">Keine aktuelle Modellstunde verfügbar.</div>';
      if(weather.value.errors?.length)html+=`<p class="geo-hint">Teilweise fehlend: ${clean(weather.value.errors.join(' · '))}</p>`;
    }else html+=`<div class="geo-warning">Wetter-/Meeresmodelle nicht verfügbar: ${clean(weather.reason?.message||'Fehler')}. Kein Ersatzwert erzeugt.</div>`;
    html+=`<p class="geo-hint">EUSeaMap EUNIS 2019 zeigt modellierte Meeresboden-Lebensräume, keine direkte Substratmessung. Keine punktgenaue Fels-/Sand-Bestätigung für diesen Pin. Für Weg, Verbote, Brandung und Sicherheit gelten lokale Quellen.</p>`;
    reading.innerHTML=html;button.disabled=false;
  };
}
function enableMapLayer(){
  const map=document.getElementById('map'),bathymetry=document.getElementById('bathy'),bathyBtn=document.getElementById('bathy-btn'),parent=document.querySelector('.map-layers');
  if(!map||!bathymetry||!bathyBtn||!parent)return;
  let layer=document.createElement('img');layer.className='habitat-wms';layer.alt='';layer.draggable=false;layer.hidden=true;map.insertBefore(layer,document.getElementById('markers'));
  const btn=document.createElement('button');btn.type='button';btn.id='habitat-btn';btn.className='layer-btn';btn.setAttribute('aria-pressed','false');btn.innerHTML='<span class="layer-icon">≋</span> Lebensräume <span class="switch"></span>';
  const status=document.createElement('span');status.className='geo-layer-status';status.setAttribute('aria-live','polite');
  parent.append(btn,status);
  let enabled=false,lastUrl='',loadedFrame=null,requestId=0;
  const api=()=>root.__COASTFINDER_TEST__;
  const disable=()=>{
    enabled=false;requestId++;loadedFrame=null;lastUrl='';
    layer.hidden=true;layer.removeAttribute('src');layer.style.transform='';
    status.textContent='';btn.setAttribute('aria-pressed','false');
  };
  function follow(){
    const a=api(),st=a?.getState?.(),p=a?.project;
    if(!enabled||!loadedFrame||!st||typeof p!=='function'||
       loadedFrame.zoom!==st.zoom||loadedFrame.width!==map.clientWidth||
       loadedFrame.height!==map.clientHeight){layer.hidden=true;return;}
    const old=p(loadedFrame.lat,loadedFrame.lon,st.zoom),now=p(st.lat,st.lon,st.zoom);
    const world=256*2**st.zoom;
    let dx=old.x-now.x;
    if(dx>world/2)dx-=world;
    if(dx< -world/2)dx+=world;
    const dy=old.y-now.y;
    layer.style.transform=`translate3d(${Math.round(dx)}px,${Math.round(dy)}px,0)`;
    layer.hidden=Math.abs(dx)>map.clientWidth||Math.abs(dy)>map.clientHeight;
  }
  function sync(){
    if(!enabled)return;
    const st=api()?.getState?.();
    if(typeof st?.zoom==='number'&&st.zoom>13){
      disable();status.textContent='Ab Zoom 14 zu grob: Tiefenprofil am Spot verwenden.';
      return;
    }
    // Hide a stale snapshot immediately if the zoom level changed.
    follow();
    const bbox=api()?.visibleBBox?.();
    if(!bbox)return;
    let url;try{url=habitatUrl(bbox,map.clientWidth,map.clientHeight);}
    catch{layer.hidden=true;status.textContent='Kartenbereich ungültig';return;}
    if(url===lastUrl){follow();return;}
    lastUrl=url;const version=++requestId;
    const frame={lat:st.lat,lon:st.lon,zoom:st.zoom,width:map.clientWidth,height:map.clientHeight};
    status.textContent='EUSeaMap-Modell wird geladen …';
    const preload=new Image();
    preload.onload=()=>{
      if(!enabled||version!==requestId)return;
      preload.className='habitat-wms';preload.alt='';preload.draggable=false;preload.hidden=true;
      layer.replaceWith(preload);layer=preload;loadedFrame=frame;follow();
      status.textContent='EUSeaMap 2025 · grobes Lebensraum-Modell, keine Spotmessung';
    };
    preload.onerror=()=>{
      if(!enabled||version!==requestId)return;
      lastUrl='';follow();status.textContent='Lebensraumkarte nicht verfügbar';
    };
    preload.src=url;
  }
  btn.onclick=()=>{
    if(enabled){disable();return;}
    if(bathyBtn.getAttribute('aria-pressed')==='true')bathyBtn.click();
    enabled=true;btn.setAttribute('aria-pressed','true');sync();
  };
  bathyBtn.addEventListener('click',()=>{
    if(bathyBtn.getAttribute('aria-pressed')==='true'&&enabled)disable();
  });
  root.addEventListener('coastfinder:mapmotion',follow);
  root.addEventListener('coastfinder:mapchange',sync);
}
if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enableMapLayer,{once:true});else enableMapLayer();
}
return {destination,depthUrl,parseProfile,fetchDepth,habitatUrl,nearestModelHour,attachSpot,enableMapLayer};
});
