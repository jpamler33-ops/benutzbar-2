'use strict';
const {chromium}=require('playwright');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lVMAAAAASUVORK5CYII=','base64');
const counts={};
function check(name,ok){assert(ok,name);counts[name]=(counts[name]||0)+1;}
const times=Array.from({length:48},(_,i)=>new Date(Date.now()+(i+1)*3600000).toISOString().slice(0,13)+':00');
function fields(pairs){return Object.fromEntries(pairs.map(([k,v])=>[k,times.map(()=>v)]));}
const w={hourly:{time:times,...fields([['wind_speed_10m',12],['wind_direction_10m',90],['wind_gusts_10m',18],['temperature_2m',19],['precipitation',0]])}};
const m={hourly:{time:times,...fields([['wave_height',.4],['wave_direction',180],['wave_period',7],['swell_wave_height',.2],['sea_surface_temperature',19],['ocean_current_velocity',.2],['ocean_current_direction',225],['sea_level_height_msl',0]])}};
const now=new Date().toISOString();
const feed={updated_at:now,sources:[{id:'naudici_shore',name:'Na Udici',kind:'editorial',enabled:true,last_check:{status:'ok',checked_at:now,fetched:10}},{id:'anglerboard',name:'Anglerboard',enabled:true,last_check:{status:'ok',checked_at:now,fetched:20}},{id:'morski_ribolov',name:'Forum',enabled:false,last_check:null}],articles:[{id:'r',source_id:'anglerboard',title:'Rovinj brancin',url:'https://www.anglerboard.de/test',excerpt:'Bericht',published_at:now,regions:['istria'],countries:['HR'],fish:['Wolfsbarsch'],themes:['Uferangeln'],relevance:80},{id:'e',source_id:'naudici_shore',title:'Adria-Artikel <script>alert(1)</script>',url:'https://naudici.com/test',excerpt:'Ohne belegten Fangort',published_at:now,regions:[],countries:[],fish:['Dentex'],themes:[],relevance:0}]};
const spots={elements:[{type:'node',id:1,lat:44.868,lon:13.848,tags:{natural:'rock',name:'Felsen'}},{type:'node',id:2,lat:44.869,lon:13.849,tags:{man_made:'breakwater',name:'Mole'}},{type:'node',id:3,lat:44.868,lon:13.851,tags:{natural:'reef',name:'Riff',access:'private'}},{type:'node',id:4,lat:44.862,lon:13.84,tags:{natural:'beach',name:'Strand'}}]};
function serve(){return http.createServer((req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1'),full=path.resolve(ROOT,'.'+url.pathname);
 if(!full.startsWith(ROOT+path.sep)||!fs.statSync(full).isFile())throw Error('invalid');
 const ext=path.extname(full),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'}[ext]||'text/plain';
 res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store'});fs.createReadStream(full).pipe(res);
 }catch{res.writeHead(404);res.end('not found');}});}
async function mockNetwork(context){
 await context.route('**/*',async route=>{
 const u=new URL(route.request().url()),host=u.hostname;
 if(host==='127.0.0.1'){if(u.pathname==='/feed/radar.json')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(feed)});return route.continue();}
 if(host==='tile.openstreetmap.org'||host.includes('emodnet')&&host!=='rest.emodnet-bathymetry.eu')return route.fulfill({status:200,contentType:'image/png',body:png});
 if(host.startsWith('overpass'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(spots)});
 if(host==='api.open-meteo.com')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(w)});
 if(host==='marine-api.open-meteo.com')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(m)});
 if(host==='rest.emodnet-bathymetry.eu')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([-10,-11,-12,-13,-14,-15,-16,-17,-18,-19])});
 return route.abort();
 });}
async function desktop(browser,url,round){
 const ctx=await browser.newContext({viewport:{width:1280,height:850},acceptDownloads:true,permissions:['geolocation'],geolocation:{latitude:44.87,longitude:13.85}});
 await mockNetwork(ctx);const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 try{
 await page.goto(url);await page.waitForFunction(()=>document.getElementById('online-status').textContent.includes('BEREIT'));
 check('Kartenkacheln',await page.locator('#tiles img').count()>2);
 const box=await page.locator('#map').boundingBox();check('Kartenlayout',box.width>400&&box.height>250);
 const old=await page.evaluate(()=>__COASTFINDER_TEST__.getState().zoom);
 await page.locator('#zoom-plus').click();check('Zoom +',await page.evaluate(()=>__COASTFINDER_TEST__.getState().zoom)===old+1);
 await page.locator('#zoom-minus').click();check('Zoom -',await page.evaluate(()=>__COASTFINDER_TEST__.getState().zoom)===old);
 const x=await page.evaluate(()=>__COASTFINDER_TEST__.getState().lon);
 await page.mouse.move(box.x+120,box.y+150);await page.mouse.down();await page.mouse.move(box.x+170,box.y+150,{steps:5});await page.mouse.up();
 check('Karte verschieben',await page.evaluate(()=>__COASTFINDER_TEST__.getState().lon)!==x);
 const regions=await page.locator('.region-tab').count();assert(regions>=7);
 for(let i=0;i<regions;i++)await page.locator('.region-tab').nth(i).click();
 check('Regionswahl alle 7',await page.evaluate(()=>__COASTFINDER_TEST__.getState().region.id)==='riviera');
 await page.locator('.region-tab').first().click();
 await page.locator('#analyze').click();await page.waitForFunction(()=>__COASTFINDER_TEST__.getState().analyzed);
 check('Küstenanalyse',await page.locator('#spot-list .spot-card').count()>=3);
 await page.locator('#filters .filter-pill').filter({hasText:'Fels'}).click();
 check('Kategorie Filter',await page.locator('#spot-list .spot-card').count()===1);
 await page.locator('#explorer-btn').click();check('Entdecker Filter',await page.locator('#explorer-btn').getAttribute('aria-pressed')==='true');
 await page.locator('#spot-list .spot-card').first().click();check('Spotdetails',await page.locator('#detail-panel').isVisible());
 await page.locator('#save-fav').click();await page.locator('.nav-tab[data-tab="favorites"]').click();
 check('Favoriten',await page.locator('#fav-cards .spot-card').count()===1);
 await page.locator('.nav-tab[data-tab="discover"]').click();await page.locator('#spot-list .spot-card').first().click();
 await page.locator('#intel-load').click();await page.waitForSelector('#intel-live .intel-days');
 check('Wetter und Wellen',await page.locator('.intel-day').count()>0);
 await page.locator('.geo-run').click();await page.waitForSelector('.geo-metrics');
 check('Tiefenprofil',await page.locator('.geo-profile-svg').count()===1);
 await page.locator('.geo-show-layer').click();check('Lebensraumkarte',await page.locator('#habitat-btn').getAttribute('aria-pressed')==='true');
 await page.locator('#habitat-btn').click();
 await page.locator('#pin-btn').click();await page.locator('#map').click({position:{x:200,y:270}});
 await page.waitForFunction(()=>__COASTFINDER_TEST__.getState().pins.length===1);
 check('Privater Pin erstellen',await page.locator('#delete-pin').isVisible());
 await page.locator('#delete-pin').click();check('Privater Pin löschen',await page.evaluate(()=>__COASTFINDER_TEST__.getState().pins.length)===0);
 await page.locator('.nav-tab[data-tab="forum"]').click();await page.waitForSelector('.radar-unlocated');
 check('Foren-Radar',await page.locator('.radar-entries article').count()>=1);
 check('Nicht verortete Quellen getrennt',await page.locator('.radar-unlocated').count()===1);
 await page.locator('.nav-tab[data-tab="catches"]').click();await page.locator('#catch-new summary').click();
 await page.locator('[name="fish"]').fill('Wolfsbarsch');await page.locator('[name="catches"]').fill('0');await page.locator('[name="effort_hours"]').fill('2');
 await page.locator('[name="local_time"]').fill(new Date(Date.now()-3*86400000).toISOString().slice(0,16));
 await page.locator('[name="lat"]').fill('44.87');await page.locator('[name="lon"]').fill('13.85');
 await page.locator('#catch-save').click();await page.waitForFunction(()=>document.querySelector('.catch-metrics strong')?.textContent==='1');
 check('Fang + Nullfang Statistik',await page.locator('.catch-stat').count()>0);
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#catch-export').click()]);
 const saved=JSON.parse(fs.readFileSync(await download.path(),'utf8'));check('Export',saved.records.length===1);
 await page.locator('[data-catch-delete]').first().click();await page.waitForFunction(()=>document.querySelector('.catch-metrics strong')?.textContent==='0');
 check('Fang löschen',true);
 await page.locator('#catch-import-file').setInputFiles({name:'test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
 await page.waitForFunction(()=>document.querySelector('.catch-metrics strong')?.textContent==='1');check('Import',true);
 await page.locator('.nav-tab[data-tab="rules"]').click();check('Angelregeln',await page.locator('#rules-panel a[href*="gov.hr"]').count()>0);
 await page.reload();await page.locator('.nav-tab[data-tab="favorites"]').click();
 check('Lokale Favoriten Persistenz',await page.locator('#fav-cards .spot-card').count()===1);
 await page.locator('.nav-tab[data-tab="catches"]').click();await page.waitForFunction(()=>document.querySelector('.catch-metrics strong')?.textContent==='1');
 check('Lokale Fangdaten Persistenz',true);
 check('Browser ohne JS Ausnahme',errors.length===0);
 }finally{await ctx.close();}
}
async function mobile(browser,url,round){
 const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 await mockNetwork(ctx);const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
 await page.goto(url);await page.waitForSelector('#tiles .tile');
 const box=await page.locator('#map').boundingBox();
 check('Mobile Karte sichtbar',box.width>=375&&box.height>250);
 const attr=await page.locator('.map-attribution').boundingBox();
 check('Mobile Quellenangabe',!!attr&&attr.y>=0&&attr.y+attr.height<844);
 const before=await page.evaluate(()=>__COASTFINDER_TEST__.getState().zoom);
 await page.locator('#zoom-plus').evaluate(el=>el.click());
 check('Mobile Zoom',await page.evaluate(()=>__COASTFINDER_TEST__.getState().zoom)===before+1);
 await page.locator('.region-tab').nth(round%7).evaluate(el=>el.click());
 check('Mobile Regionswechsel',await page.locator('.region-tab.active').count()===1);
 const lon=await page.evaluate(()=>__COASTFINDER_TEST__.getState().lon),cdp=await ctx.newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:140,y:200,id:1}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:210,y:200,id:1}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 check('Mobile Touchpan',await page.evaluate(()=>__COASTFINDER_TEST__.getState().lon)!==lon);
 const z=await page.evaluate(()=>__COASTFINDER_TEST__.getState().zoom);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:100,y:250,id:1},{x:150,y:250,id:2}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:50,y:250,id:1},{x:220,y:250,id:2}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 check('Mobile Pinch',await page.evaluate(()=>__COASTFINDER_TEST__.getState().zoom)>=z);
 check('Mobile ohne JS Ausnahme',errors.length===0);
 }finally{await ctx.close();}
}
(async()=>{
 const server=serve();await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const url='http://127.0.0.1:'+server.address().port+'/index.html';let browser;
 try{browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(let i=0;i<10;i++){await desktop(browser,url,i);await mobile(browser,url,i);console.log('TENFOLD_ROUND '+(i+1)+'/10 PASS');}
 for(const [name,n]of Object.entries(counts))assert(n>=10,name+' repeated only '+n);
 console.log('TENFOLD_ALL_PASS '+JSON.stringify(counts));
 }finally{await browser?.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error('TENFOLD_FAILED',e.stack||e);process.exitCode=1;});
