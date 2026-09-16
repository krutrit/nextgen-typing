// The typing lesson must be usable before the optional game runtime finishes loading.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const relative=pathname.replace(/^\/classroom\//,'/');
  const file=path.join(root,relative==='/'?'index.html':relative.slice(1));
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
  const fallback=await browser.newPage();
  await fallback.addInitScript(()=>{
   const native=HTMLCanvasElement.prototype.getContext;
   window.__webglAttempts=0;
   HTMLCanvasElement.prototype.getContext=function(type,...args){
    if(type==='webgl'||type==='webgl2'||type==='experimental-webgl'){window.__webglAttempts++;return null;}
    return native.call(this,type,...args);
   };
  });
  await fallback.route('**/script.google.com/**',route=>route.fulfill({json:{users:['Guest'],settings:{targetLength:100,enableMinigame:true},progress:{Guest:{TH:0,EN:0}}}}));
  await fallback.goto('http://127.0.0.1:'+server.address().port+'/classroom/',{waitUntil:'domcontentloaded'});
  await fallback.waitForFunction(()=>document.getElementById('loading-overlay').classList.contains('hidden'));
  const letter=await fallback.evaluate(()=>{state.currentUser='Guest';setLanguage('EN');loadLesson(0);focusInput();return state.text[0];});
  const focusBefore=await fallback.evaluate(()=>document.activeElement.id);
  await fallback.waitForFunction(()=>window.__lettercraftLoadState==='ready');
  assert.deepEqual(await fallback.evaluate(()=>({attempts:window.__webglAttempts,game:Lettercraft.game,view:Lettercraft.view,focus:document.activeElement.id})),{attempts:0,game:null,view:null,focus:focusBefore},'background preload must not create a renderer/session or steal lesson focus');
  await fallback.keyboard.press(letter);
  assert.equal(await fallback.evaluate(()=>state.userInput),letter);
  await fallback.evaluate(()=>startMiniGame());
  assert.equal(await fallback.locator('#lc-error').isVisible(),true,'unsupported WebGL must show a recoverable game error only after play');
  await fallback.locator('#lc-error-back').click();
  assert.equal(await fallback.evaluate(()=>state.isGameMode),false);
  await fallback.close();
  console.log('PASS: typing first, single-flight play, inactive background preload, subpath assets, and recoverable no-WebGL fallback.');
 }finally{if(releaseRuntime)releaseRuntime();if(releaseData)releaseData();await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
