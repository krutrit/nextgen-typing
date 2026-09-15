// The typing lesson must be usable before the optional game runtime finishes loading.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=path.join(root,pathname==='/'?'index.html':pathname.slice(1));
  if(!file.startsWith(root)||!fs.existsSync(file)){res.statusCode=404;return res.end('missing');}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');
  res.end(fs.readFileSync(file));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage();
 let runtimeRequests=0,runtimeUrl='',releaseRuntime,releaseData;
 await page.route('**/lettercraft.bundle.js*',async route=>{
  runtimeRequests++;runtimeUrl=route.request().url();
  await new Promise(resolve=>releaseRuntime=resolve);
  await route.continue();
 });
 await page.route('**/script.google.com/**',async route=>{
  await new Promise(resolve=>releaseData=resolve);
  await route.fulfill({json:{users:['Guest'],settings:{targetLength:100,enableMinigame:true},progress:{Guest:{TH:0,EN:0}}}});
 });
 try{
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.getElementById('loading-overlay').classList.contains('hidden'));
  assert.equal(await page.evaluate(()=>state.isDataLoaded),true,'local defaults must unblock the lesson before remote classroom data');
  assert.equal(await page.evaluate(()=>typeof Lettercraft),'undefined','game code must not execute during initial page boot');
  const first=await page.evaluate(()=>{state.currentUser='Guest';setLanguage('EN');loadLesson(0);focusInput();return state.text[0];});await page.keyboard.press(first);
  assert.equal(await page.evaluate(()=>state.userInput),first,'typing must work while game runtime is pending');
  await page.waitForFunction(()=>window.__lettercraftLoadState==='loading');
  assert.equal(runtimeRequests,1,'idle preload should request one game bundle');
  assert.match(runtimeUrl,/lettercraft\.bundle\.js\?v=[a-f0-9]{12}$/,'runtime URL must change when generated assets change');
  await page.evaluate(()=>{
   const canvas=document.getElementById('lc-canvas'),original=canvas.getContext.bind(canvas);window.__webglCreates=0;
   canvas.getContext=(type,...args)=>{if(type==='webgl')window.__webglCreates++;return original(type,...args);};
   window.__startOne=startMiniGame();window.__startTwo=startMiniGame();
  });
  releaseRuntime();
  if(releaseData)releaseData();
  await page.waitForFunction(()=>window.__lettercraftLoadState==='ready');
  assert.equal(await page.evaluate(()=>typeof Lettercraft),'object');
  await page.waitForFunction(()=>Lettercraft.game&&Lettercraft.view);
  assert.equal(await page.evaluate(()=>window.__webglCreates),1,'repeated play clicks while loading must mount only one WebGL session');
  assert.equal(runtimeRequests,1,'starting a preloaded game must reuse the same bundle');
  console.log('PASS: typing renders first, idle game preload is single-flight, and WebGL starts only on play.');
 }finally{if(releaseRuntime)releaseRuntime();if(releaseData)releaseData();await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
