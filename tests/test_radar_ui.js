'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const panel = {innerHTML:'', querySelector(sel){ return sel==='#radar-live'?radar:null; }};
const radar = {innerHTML:'',isConnected:true,querySelector(){return null;}};
const mock = {
  articles:[
    {id:'a',source_id:'naudici_shore',url:'https://naudici.com/example/',
     title:'Bericht <script>alert(1)</script>',excerpt:'Morski ribolov',regions:[],countries:[],
     fish:['Dentex'],themes:['Uferangeln'],relevance:0,published_at:'2026-11-02T10:00:00Z'},
    {id:'b',source_id:'anglerboard',url:'https://www.anglerboard.de/example/',
     title:'Rovinj brancin s obale',excerpt:'Uferbericht',regions:['istria'],countries:['HR'],
     fish:['Wolfsbarsch'],themes:['Uferangeln'],relevance:78,published_at:'2026-11-02T11:00:00Z'}
  ],
  sources:[
    {id:'naudici_shore',name:'Na Udici',kind:'editorial',enabled:true,
     last_check:{status:'ok',fetched:10,stored:1,checked_at:'2026-11-02T10:30:00Z'}},
    {id:'anglerboard',name:'Anglerboard',kind:'forum',enabled:true,
     last_check:{status:'ok',fetched:50,stored:1,checked_at:'2026-11-02T10:31:00Z'}},
    {id:'morski_ribolov',name:'Morski',enabled:false,
     last_check:{status:'error',fetched:0,checked_at:'2026-11-01T08:00:00Z'}}
  ]
};
const ctx = {
  document: {getElementById(id){return id==='forum-panel'?panel:null;}},
  fetch: async()=>({ok:true,json:async()=>mock}),
  CoastIntel: {SOURCES:[],searchLinks:()=>[]},
  AbortController,Date,setTimeout,clearTimeout,console
};
ctx.window=ctx;ctx.globalThis=ctx;
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../intel-ui.js'),'utf8'),ctx);
async function flush(){await new Promise(resolve=>setTimeout(resolve,30));}
(async()=>{
  ctx.CoastIntelUI.renderForum({id:'istria',name:'Istrien',country:'HR'});
  await flush();
  const html=radar.innerHTML;
  assert.match(html,/Weitere Adria-Uferangel-Berichte ohne belegten Ort \(1\)/);
  assert.match(html,/Redaktionelle Beiträge/);
  assert.match(html,/Rovinj brancin s obale/);
  assert.match(html,/Morski: pausiert/);
  assert.match(html,/Abruf OK \(10 Einträge\)/);
  assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html,/<script>alert/);
  assert.match(html,/Regionale Treffer/);
  // A Croatian editorial note must never appear on the French regional radar.
  ctx.CoastIntelUI.renderForum({id:'brittany',name:'Bretagne',country:'FR'});
  await flush();
  assert.doesNotMatch(radar.innerHTML,/Weitere Adria-Uferangel-Berichte/);
  console.log('RADAR_UI_REGRESSION_OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
