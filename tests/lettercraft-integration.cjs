// Run after every phase: real lesson/minigame boundary, no live service writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
(async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(__dirname,'../index.html')));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage();const errors=[],writes=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
 await page.route('**/script.google.com/**',r=>{if(r.request().method()==='POST')writes.push(r.request().postData());return r.fulfill({json:{users:['Guest'],settings:{targetLength:100,enableMinigame:true},progress:{Guest:{TH:0,EN:0}}}});});
 try{
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle'});
  await page.evaluate(()=>{state.currentUser='Guest';setLanguage('EN');state.isSoundOn=false;document.getElementById('accuracy').innerText='100';finishLesson();});
  const progress=await page.evaluate(()=>JSON.stringify(mockData.progress));
  await page.locator('#btn-mini-game').click();assert.equal(await page.locator('#lc-intro').isVisible(),true);
  await page.locator('#lc-start-button').click();await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>Lettercraft.game.goal),20);assert.ok(await page.evaluate(()=>Lettercraft.game.remaining)>298);
  await page.keyboard.down('Space');await page.waitForTimeout(150);assert.ok(await page.evaluate(()=>Lettercraft.game.player.z)>.3);
  await page.keyboard.up('Space');await page.waitForFunction(()=>Lettercraft.game.player.grounded);
  await page.keyboard.press('Escape');await page.locator('#lc-exit-button').click();await page.locator('#lc-confirm-exit').click();
  assert.equal(await page.evaluate(()=>state.isGameMode),false);assert.equal(await page.evaluate(()=>Lettercraft.listeners),null);
  assert.equal(await page.evaluate(()=>JSON.stringify(mockData.progress)),progress);assert.equal(await page.evaluate(()=>state.isSoundOn),false);
  assert.equal(await page.locator('#modal-complete').isVisible(),true);
  await page.evaluate(()=>{state.userSettings.enableMinigame=false;startMiniGame();});assert.equal(await page.evaluate(()=>state.isGameMode),false);
  await page.evaluate(()=>{state.userSettings.enableMinigame=true;closeModal();setLanguage('TH');startMiniGame();});
  assert.match(await page.locator('#lc-lesson').textContent(),/ภาษาไทย/);await page.locator('#lc-back-button').click();
  assert.equal(await page.evaluate(()=>state.lang),'TH');assert.equal(writes.length,0);assert.deepEqual(errors,[]);
  console.log('PASS: lesson completion/entry/exit, 20-letter/five-minute rules, language/sound/progress preservation, admin game toggle and no remote writes.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
