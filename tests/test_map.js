'use strict';
/* Map smoke test runs the actual app.js against a minimal DOM without requesting
 * OpenStreetMap tiles. It checks the outgoing policy and gesture behaviour.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
class FakeElement {
  constructor(tag='div'){
    this.tag=tag;this.children=[];this.style={};this._events={};
    this.classList={add(){},remove(){},toggle(){},contains(){return false;}};
    this.dataset={};this.attributes={};this.hidden=false;this.isConnected=true;
    this.clientWidth=tag==='map'?390:390;this.clientHeight=tag==='map'?660:660;
  }
  addEventListener(event,cb){(this._events[event]??=[]).push(cb);}
  setAttribute(name,value){this.attributes[name]=value;}
  getAttribute(name){return this.attributes[name];}
  appendChild(child){this.children.push(child);child.isConnected=true;return child;}
  replaceChildren(...children){this.children.forEach(c=>c.isConnected=false);this.children=children;}
  remove(){this.isConnected=false;}
  closest(){return null;}
  setPointerCapture(){}
  getBoundingClientRect(){return {left:0,top:0,width:this.clientWidth,height:this.clientHeight};}
  fire(event,data){for(const cb of this._events[event]||[])cb(data);}
}
const elements=new Map();
const el=id=>{if(!elements.has(id))elements.set(id,new FakeElement(id));return elements.get(id);};
const listeners={};
const doc={
  getElementById:el,
  createElement:tag=>new FakeElement(tag),
  querySelectorAll:()=>[],
  addEventListener(){},
};
const pendingTimers=[];
const env={
  document:doc,
  localStorage:{getItem:()=>null,setItem(){}},
  navigator:{onLine:true},
  requestAnimationFrame:callback=>callback(),
  setTimeout:cb=>(pendingTimers.push(cb),pendingTimers.length),
  clearTimeout(){},
  AbortController, URLSearchParams, URL, console,
  Event:class Event{constructor(type){this.type=type;}},
  addEventListener:(type,cb)=>(listeners[type]??=[]).push(cb),
  dispatchEvent:()=>{},
};
env.window=env;env.globalThis=env;
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'),env,{filename:'app.js'});
const map=el('map'), tileContainer=el('tiles');
let imgs=tileContainer.children.filter(e=>e.tag==='img'&&e.isConnected);
assert(imgs.length>0,'Map should request tiles for viewport');
assert(imgs.length<65,'Bound tile requests to viewport');
assert(imgs.every(e=>e.referrerPolicy==='strict-origin-when-cross-origin'),
  'OSM policy requires a browser Referer');
assert(imgs.every(e=>/^https:\/\/tile\.openstreetmap\.org\/12\/\d+\/\d+\.png$/.test(e.src)),
  'OSM standard HTTPS XYZ URL');
const originalCount=imgs.length;
imgs[0].onload();
assert.equal(el('online-status').textContent,'KARTE BEREIT');
imgs[1].onerror();
assert.equal(el('online-status').textContent,'KARTENFEHLER');
assert.match(el('map-banner').textContent,/Kartenkacheln/);
assert.equal(el('map-banner').hidden,false);
const api=env.__COASTFINDER_TEST__;
const state=api.getState();
const fakeTarget={closest:()=>null};
map.fire('pointerdown',{pointerId:7,target:fakeTarget,clientX:120,clientY:160});
pendingTimers.at(-1)();
assert.equal(state.pins.length,0,'Holding the map must not silently create a private pin');
map.fire('pointerup',{pointerId:7,clientX:120,clientY:160});
// Regression: the previous inverse projection was off by 180 degrees.
// Check distinct hemispheres, the antimeridian, and different tile scales.
for(const lat of [-75,-45,0,44.87,75]){
  for(const lon of [-179.9,-122.4,-13.85,0,13.85,179.9]){
    for(const zoom of [3,8,12,18]){
      const p=api.project(lat,lon,zoom), back=api.unproject(p.x,p.y,zoom);
      assert(Math.abs(back.lat-lat)<1e-7,'Latitude projection roundtrip '+lat+'/'+zoom);
      assert(Math.abs(back.lon-lon)<1e-7,'Longitude projection roundtrip '+lon+'/'+zoom);
    }
  }
}
const viewport=api.visibleBBox();
const bounds=api.overlayBounds(Math.round(map.clientWidth/2),Math.round(map.clientHeight/2));
assert(bounds.s<viewport.s&&bounds.n>viewport.n&&bounds.w<viewport.w&&bounds.e>viewport.e,
  'WMS overscan must cover all four viewport edges');
assert(viewport.w<state.lon&&viewport.e>state.lon,'Map visible longitude extent must contain center');
assert(viewport.s<state.lat&&viewport.n>state.lat,'Map visible latitude extent must contain center');
const originalZoom=state.zoom;
map.fire('wheel',{clientX:200,clientY:200,deltaY:-100,preventDefault(){}});
assert.equal(state.zoom,originalZoom+1);
imgs=tileContainer.children.filter(e=>e.tag==='img'&&e.isConnected);
assert(imgs.some(e=>e.src.includes('/13/')),'Zoom must load new tile level');
const beforeLon=state.lon;
map.fire('pointerdown',{pointerId:1,target:fakeTarget,clientX:160,clientY:200});
map.fire('pointermove',{pointerId:1,clientX:210,clientY:200});
map.fire('pointerup',{pointerId:1,clientX:210,clientY:200});
assert(state.lon<beforeLon,'Dragging right should pan map center WEST, not jump 180°');
assert(Number.isFinite(state.lon)&&Number.isFinite(state.lat));
env.navigator.onLine=true;
for(const cb of listeners.online||[])cb();
assert.match(el('online-status').textContent,/KARTE LÄDT/);
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
assert.match(html,/<meta name="referrer" content="strict-origin-when-cross-origin">/);
const css=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8');
assert.match(css,/\.map\{[^}]*touch-action:none/);
assert.match(css,/\.map-attribution\{bottom:calc\(302px/);
assert(!/referrerPolicy\s*=\s*['"]no-referrer['"]/.test(
  fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8')));
console.log('MAP_SMOKE_OK tiles='+originalCount+' zoom, pan, errors, attribution, Referer');
