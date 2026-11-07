'use strict';
/* WebKit iPhone-size smoke test: Safari engine approximation, NOT a real iOS device.
 * External networks are mocked; no OSM tile bulk downloads or user-data upload.
 */
const {webkit,devices}=require('playwright');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lVMAAAAASUVORK5CYII=','base64');
const tallies={};
function check(name,passed){assert(passed,'WebKit '+name);tallies[name]=(tallies[name]||0)+1;}
const hours=Array.from({length:24},(_,i)=>new Date(Date.now()+(i+1)*3600000).toISOString().slice(0,13)+':00');
const hourly=(keys)=>Object.fromEntries(keys.map(([key,value])=>[key,hours.map(()=>value)]));
const weather={hourly:{time:hours,...hourly([['wind_speed_10m',15],['wind_direction_10m',120],['wind_gusts_10m',25],['temperature_2m',18],['precipitation',0]])}};
const marine={hourly:{time:hours,...hourly([['wave_height',.5],['wave_direction',180],['wave_period',7],['swell_wave_height',.2],['sea_surface_temperature',20],['ocean_current_velocity',.2],['ocean_current_direction',210],['sea_level_height_msl',0]])}};
const feed={updated_at:new Date().toISOString(),sources:[],articles:[]};
const osm={elements:[{type:'node',id:43122,lat:44.869,lon:13.850,tags:{natural:'rock',name:'Felsstruktur'}}]};
function serve(){
 return http.createServer((req,res)=>{
  try{
   const pathname=new URL(req.url,'http://127.0.0.1').pathname;
   const full=path.resolve(ROOT,'.'+pathname);
   if(!full.startsWith(ROOT+path.sep)||!fs.statSync(full).isFile())throw Error('not found');
   const ext=path.extname(full);
   const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'}[ext]||'text/plain';
   res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});
   fs.createReadStream(full).pipe(res);
  }catch{res.writeHead(404);res.end('not found');}
 });
}
async function installMocks(context){
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url()),host=u.hostname;
  if(host==='127.0.0.1'){
   if(u.pathname==='/feed/radar.json')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(feed)});
   return route.continue();
  }
  if(host==='tile.openstreetmap.org'||host.includes('emodnet')&&host!=='rest.emodnet-bathymetry.eu')
   return route.fulfill({status:200,contentType:'image/png',body:png});
  if(host.startsWith('overpass'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(osm)});
  if(host==='api.open-meteo.com')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(weather)});
  if(host==='marine-api.open-meteo.com')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(marine)});
  if(host==='rest.emodnet-bathymetry.eu')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([-10,-12,-14,-16,-18,-20,-22])});
  return route.abort();
 });
}
async function one(browser,url,round){
 const screen=round%2?{width:375,height:667}:{width:390,height:844};
 const ctx=await browser.newContext({...devices['iPhone 13'],viewport:screen,screen,locale:'de-DE',timezoneId:'Europe/Berlin',acceptDownloads:true});
 await installMocks(ctx);
 const page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 try{
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#online-status')?.textContent.includes('BEREIT'),{timeout:13000});
  check('OSM tile loading in WebKit',await page.locator('#tiles img').count()>=4);
  const dimensions=await page.locator('#map').boundingBox();
  check('iPhone-sized map layout',dimensions&&dimensions.width>=370&&dimensions.height>=250);
  const attribution=await page.locator('.map-attribution').boundingBox();
  check('OpenStreetMap attribution visible',attribution&&attribution.y>=0&&attribution.y+attribution.height<screen.height);
  const source=await page.locator('#tiles img').first().evaluate(el=>el.referrerPolicy);
  check('OSM compliant referrer in WebKit',source==='strict-origin-when-cross-origin');
  const z=await page.evaluate(()=>__COASTFINDER_TEST__.getState().zoom);
  await page.locator('#zoom-plus').tap();
  check('Touch zoom button',await page.evaluate(()=>__COASTFINDER_TEST__.getState().zoom)===z+1);
  await page.locator('#zoom-minus').tap();
  check('Touch zoom out',await page.evaluate(()=>__COASTFINDER_TEST__.getState().zoom)===z);
  const x=await page.evaluate(()=>__COASTFINDER_TEST__.getState().lon);
  await page.mouse.move(dimensions.x+140,dimensions.y+140);
  await page.mouse.down();
  await page.mouse.move(dimensions.x+210,dimensions.y+140,{steps:5});
  await page.mouse.up();
  check('Map pan in WebKit',await page.evaluate(()=>__COASTFINDER_TEST__.getState().lon)!==x);
  await page.locator('#region-tabs .region-tab').nth(round%7).evaluate(el=>el.click());
  check('Mobile region selection',await page.locator('.region-tab.active').count()===1);
  await page.locator('.region-tab').first().evaluate(el=>el.click());
  await page.locator('#analyze').tap();
  await page.waitForFunction(()=>__COASTFINDER_TEST__.getState().analyzed);
  check('Overpass structure discovery',await page.locator('#spot-list .spot-card').count()===1);
  const grid=await page.locator('#bathy-btn').count();
  check('Bathymetry control available',grid===1);
  await page.locator('#bathy-btn').tap();
  check('Bathymetry toggle available',await page.locator('#bathy-btn').getAttribute('aria-pressed')==='true');
  await page.waitForFunction(()=>document.querySelector('#bathy')?.hidden===false);
  check('Bathymetry image only visible after load',await page.locator('#bathy').evaluate(img=>img.complete&&img.naturalWidth>0&&!img.hidden));
  check('Depth WMS buffered beyond viewport',await page.locator('#bathy').evaluate(img=>{
    const m=document.querySelector('#map');return img.clientWidth>=m.clientWidth*1.9&&img.clientHeight>=m.clientHeight*1.9&&parseFloat(img.style.left)<0&&parseFloat(img.style.top)<0;
  }));
  const originalDepthUrl=await page.locator('#bathy').getAttribute('src');
  // Regression from the user's actual iPhone: the overlay must follow the map while dragging.
  await page.mouse.move(dimensions.x+100,dimensions.y+150);
  await page.mouse.down();
  await page.mouse.move(dimensions.x+145,dimensions.y+150,{steps:4});
  check('Depth overlay follows map during drag',await page.locator('#bathy').evaluate(img=>!img.hidden&&img.style.transform.includes('translate3d(')));
  await page.mouse.up();
  check('Small depth pan does not reload WMS',await page.locator('#bathy').getAttribute('src')===originalDepthUrl);
  await page.locator('#bathy-btn').tap();
  const habitat=page.locator('#habitat-btn');
  await habitat.tap();
  check('EUSeaMap layer available',await habitat.getAttribute('aria-pressed')==='true');
  await page.waitForFunction(()=>document.querySelector('.habitat-wms')?.hidden===false);
  check('Habitat image only visible after load',await page.locator('.habitat-wms').evaluate(img=>img.complete&&img.naturalWidth>0&&!img.hidden));
  check('Habitat WMS buffered beyond viewport',await page.locator('.habitat-wms').evaluate(img=>{
    const m=document.querySelector('#map');return img.clientWidth>=m.clientWidth*1.9&&img.clientHeight>=m.clientHeight*1.9&&parseFloat(img.style.left)<0&&parseFloat(img.style.top)<0;
  }));
  const originalHabitatUrl=await page.locator('.habitat-wms').getAttribute('src');
  await page.mouse.move(dimensions.x+110,dimensions.y+165);
  await page.mouse.down();
  await page.mouse.move(dimensions.x+155,dimensions.y+165,{steps:4});
  check('Habitat overlay follows map during drag',await page.locator('.habitat-wms').evaluate(img=>!img.hidden&&img.style.transform.includes('translate3d(')));
  await page.mouse.up();
  check('Small habitat pan does not reload WMS',await page.locator('.habitat-wms').getAttribute('src')===originalHabitatUrl);
  await habitat.tap();
  // The real iPhone screen recording showed ~115m raster cells as huge,
  // misleading brown blocks on detailed coastal map zooms.
  await page.locator('#zoom-plus').tap();
  await page.locator('#zoom-plus').tap();
  check('Zoom 14 reached',await page.evaluate(()=>__COASTFINDER_TEST__.getState().zoom)===14);
  await page.locator('#bathy-btn').tap();
  check('Overzoom bathymetry is rejected',await page.locator('#bathy-btn').getAttribute('aria-pressed')==='false'&&await page.locator('#bathy').evaluate(img=>img.hidden));
  await habitat.tap();
  check('Overzoom habitat is rejected',await habitat.getAttribute('aria-pressed')==='false'&&
    (await page.locator('.geo-layer-status').innerText()).includes('Ab Zoom 14'));
  await page.locator('#zoom-minus').tap();
  await page.locator('#zoom-minus').tap();
  check('Map still navigable after raster limit',await page.evaluate(()=>__COASTFINDER_TEST__.getState().zoom)===12);

  // End-to-end angling flow: after using map layers, return to the spot list
  // through the actual navigation (the bottom sheet may have collapsed).
  await page.locator('.nav-tab[data-tab="discover"]').tap();
  check('Spot list accessible after layer controls',await page.locator('#spot-list .spot-card').first().isVisible());
  await page.locator('#spot-list .spot-card').first().tap();
  await page.locator('#spot-plan').tap();
  check('Plan opens from selected spot',await page.locator('#angeln-panel').isVisible());
  check('Planned spot coordinates retained',await page.locator('.angler-spot').innerText().then(x=>x.includes('44.8690')));
  check('Official Croatian fishing rules reachable from trip plan',await page.locator('.angler-legal a').getAttribute('href')==='https://www.gov.hr/en/marine-recreational-and-sport-fisheries/1542');
  await page.locator('#angler-fish').selectOption('Dorade');
  await page.locator('#angler-method').selectOption('Grundangeln');
  await page.locator('[data-angler-check="license"]').check();
  check('Angler target, method and checklist saved',await page.evaluate(()=>CoastAngling.readPlan().fish==='Dorade'&&CoastAngling.readPlan().method==='Grundangeln'&&CoastAngling.readPlan().checks.license===true));
  await page.locator('#angler-weather').tap();
  await page.waitForFunction(()=>!document.querySelector('#angler-weather-result')?.textContent.includes('werden geladen'),{timeout:10000});
  check('Forecast provides explicit model or data-gap status',await page.locator('#angler-weather-result').innerText().then(x=>x.includes('Modell')||x.includes('Keine passende')||x.includes('fehlgeschlagen')));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('.nav-tab[data-tab="angeln"]').tap();
  check('Angler plan survives WebKit reload',await page.evaluate(()=>CoastAngling.readPlan().fish==='Dorade'&&CoastAngling.readPlan().spot?.name==='Felsstruktur'&&CoastAngling.readPlan().checks.license===true));

  await page.locator('.nav-tab[data-tab="forum"]').tap();
  await page.waitForSelector('.radar-stat-row');
  check('Public RSS radar rendered',await page.locator('.radar-stat-row').count()===1);
  await page.locator('.nav-tab[data-tab="catches"]').tap();
  await page.waitForSelector('#catch-new');
  const id=await page.evaluate(async()=>{
   const body={source_kind:'own',region:'istria',fish:'Dentex',catches:0,effort_hours:2,
     method:'Spinnfischen',caught_at_utc:'2026-10-15T12:00:00Z',lat:44.87,lon:13.85,note:'WebKit privater Probeeintrag'};
   return (await CoastFreeStore.api('records',{method:'POST',body:JSON.stringify(body)})).record.id;
  });
  check('Private catch data saved',!!id);
  await page.reload({waitUntil:'domcontentloaded'});
  const restored=await page.evaluate(()=>CoastFreeStore.asArray());
  check('Private catch survived Safari-engine reload',restored.length===1&&restored[0].id===id&&restored[0].catches===0);
  check('No page JS exceptions',errors.length===0);
 }finally{await ctx.close();}
}
(async()=>{
 const server=serve();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await webkit.launch({headless:true});
  const url='http://127.0.0.1:'+server.address().port+'/index.html';
  for(let round=0;round<10;round++){
   await one(browser,url,round);
   console.log('WEBKIT_MOBILE_ROUND '+(round+1)+'/10 PASS');
  }
  for(const [name,n] of Object.entries(tallies))assert.equal(n,10,name+' must pass in all ten rounds');
  console.log('WEBKIT_MOBILE_ALL_PASS '+JSON.stringify(tallies));
 }finally{
  await browser?.close();
  await new Promise(done=>server.close(done));
 }
})().catch(err=>{console.error('WEBKIT_MOBILE_FAILED',err.stack||err);process.exitCode=1;});
