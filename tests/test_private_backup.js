'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');

// Run the real browser-local storage module, not a reimplemented backup function.
const memory=new Map();let lastBlob=null,downloads=0;
class MockURL extends URL {}
MockURL.createObjectURL=blob=>{lastBlob=blob;return 'blob:coastfinder-private-test';};
MockURL.revokeObjectURL=()=>{};
const context={
  window:null,URL:MockURL,URLSearchParams,Blob,crypto:webcrypto,Date,Intl,console,
  setTimeout:()=>1,clearTimeout(){},
  localStorage:{
    getItem:key=>memory.has(key)?memory.get(key):null,
    setItem:(key,value)=>memory.set(key,String(value)),
    removeItem:key=>memory.delete(key)
  },
  document:{createElement:()=>({click(){downloads++;}})},
};
context.window=context;context.globalThis=context;
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../free-store.js'),'utf8'),context,{filename:'free-store.js'});
const store=context.CoastFreeStore,KEY='coastfinder:free:catches:v1';
const base={
  region:'istria',fish:'Dentex',catches:0,effort_hours:2,method:'Spinnfischen',
  caught_at_utc:'2026-10-15T12:00:00Z',lat:44.87,lon:13.85,note:'Uferbericht'
};
const file=payload=>{const text=JSON.stringify(payload);return {size:Buffer.byteLength(text),text:async()=>text};};
const backup=records=>({format:'coastfinder-free-catches',version:1,records});
async function run(){
  const own=(await store.api('records',{method:'POST',
    body:JSON.stringify({...base,source_kind:'own'})})).record;
  const external=(await store.api('records',{method:'POST',
    body:JSON.stringify({...base,source_kind:'external',catches:2,
      source_url:'https://naudici.com/example/'})})).record;
  assert.equal(store.asArray().length,2);
  const note='Quelltext und Veröffentlichungsdatum manuell geprüft.';
  const reviewed=(await store.api('record/'+external.id+'/review',{
    method:'POST',body:JSON.stringify({note})
  })).record;
  assert.equal(reviewed.evidence_status,'source_reviewed');
  // The weather retrieval also persists these source notes/error conditions.
  const entries=store.asArray();
  entries[0].weather_status='partial';
  entries[0].weather={wind_kmh:12.25,wind_from_deg:240,wave_m:null,
    warnings:['ERA5 Raster, keine Ufermessung']};
  entries[0].weather_error='Marine-Wellenhistorie nicht verfügbar';
  memory.set(KEY,JSON.stringify(entries));

  store.exportData();
  assert.equal(downloads,1,'real exportData() triggered browser download');
  assert(lastBlob instanceof Blob,'a JSON Blob was created');
  const exported=JSON.parse(await lastBlob.text());
  assert.equal(exported.records.length,2);
  assert.equal(exported.records[0].weather_status,'partial');
  assert.equal(exported.records[0].weather_error,'Marine-Wellenhistorie nicht verfügbar');
  assert.equal(exported.records[1].review_note,note);
  assert.equal(exported.records[1].evidence_status,'source_reviewed');

  memory.delete(KEY);
  assert.equal(store.asArray().length,0);
  assert.equal(await store.importData(file(exported)),2);
  const restored=store.asArray();
  assert.equal(restored.length,2);
  const a=restored.find(x=>x.id===own.id);
  const b=restored.find(x=>x.id===external.id);
  assert(a&&b,'both original IDs preserved');
  assert.equal(a.catches,0);
  assert.equal(a.effort_hours,2);
  assert.equal(a.weather_status,'partial');
  assert.equal(a.weather.wind_kmh,12.25);
  assert.equal(a.weather.wind_from_deg,240);
  assert.equal(a.weather.wave_m,null);
  assert.equal(a.weather.warnings[0],'ERA5 Raster, keine Ufermessung');
  assert.equal(a.weather_error,'Marine-Wellenhistorie nicht verfügbar');
  assert.equal(b.source_url,'https://naudici.com/example/');
  assert.equal(b.evidence_status,'source_reviewed');
  assert.equal(b.review_note,note);
  assert.equal(b.created_at,external.created_at);
  assert.equal(b.caught_at_utc,external.caught_at_utc);
  assert.equal(store.stats(restored).groups[0].zero_sessions,1);
  assert.equal(await store.importData(file(exported)),0,'repeat import adds no duplicates');
  assert.equal(store.asArray().length,2);

  // An imported backup cannot forge a reviewed source without the review note
  // and URL required by the normal review action.
  const forged={...external,id:cryptoId(),evidence_status:'source_reviewed',review_note:'Too short'};
  assert.equal(await store.importData(file(backup([forged]))),1);
  const unchecked=store.asArray().find(x=>x.id===forged.id);
  assert.equal(unchecked.evidence_status,'unverified');
  assert.equal(unchecked.review_note,undefined);

  const future={...own,id:cryptoId(),weather:null,weather_status:'available',
    created_at:'not a date'};
  assert.equal(await store.importData(file(backup([future]))),1);
  const recovered=store.asArray().find(x=>x.id===future.id);
  assert.equal(recovered.weather_status,'unavailable','cannot claim weather without actual data');
  assert(Number.isFinite(Date.parse(recovered.created_at)));
  assert.notEqual(recovered.created_at,'not a date');

  const before=memory.get(KEY);
  await assert.rejects(store.importData(file(backup([{
    ...own,id:cryptoId(),source_kind:'external',source_url:'javascript:alert(1)'
  }]))),/HTTPS/);
  assert.equal(memory.get(KEY),before,'invalid backup must not partially write data');
  await assert.rejects(store.importData(file(backup([{...own,catches:-1}]))),/Fanganzahl/);
  assert.equal(memory.get(KEY),before);
  const huge={size:2_000_001,text:async()=>JSON.stringify(exported)};
  await assert.rejects(store.importData(huge),/2 MB/);
  assert.equal(memory.get(KEY),before);
  console.log('PRIVATE_BACKUP_ROUNDTRIP_OK: export, 2 restored IDs, weather, manual review, duplicates, malicious files');
}
function cryptoId(){return webcrypto.randomUUID();}
run().catch(err=>{console.error(err);process.exitCode=1;});
