const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const server = http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(root,'index.html')));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({ headless:true, channel:'chrome' });
  const page = await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[], writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.dismiss());
  await page.route('**/script.google.com/**',route=>{
    if(route.request().method()==='POST') writes.push(route.request().postData());
    return route.fulfill({json:{users:['Guest'],settings:{targetLength:100},progress:{Guest:{TH:0,EN:0}}}});
  });
  const locked = () => page.waitForFunction(()=>document.pointerLockElement?.id==='lc-canvas');
  async function release() { await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.pointerLockElement); }
  async function pointAt(x,y,z) {
    // Real mouse motion, not camera-state writes.
    await page.mouse.move(720,450);
    const delta = await page.evaluate(({x,y,z})=>{
      const g=Lettercraft.game,p=g.player,yaw=Math.atan2(y-p.y,x-p.x);
      const yawDelta=Math.atan2(Math.sin(yaw-p.angle),Math.cos(yaw-p.angle));
      const pitch=Math.atan2(z-g.heightAt(p.x,p.y)-1.6,Math.hypot(x-p.x,y-p.y));
      return {x:yawDelta/.0025,y:(p.pitch-pitch)/.0025};
    },{x,y,z});
    await page.mouse.move(720+delta.x,450+delta.y);await page.waitForTimeout(80);
  }
  async function clickWorld() {await page.mouse.down();await page.mouse.up();}
  async function keyHold(key,ms) {await page.keyboard.down(key);await page.waitForTimeout(ms);await page.keyboard.up(key);}
  try {
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle'});
    await page.evaluate(()=>{state.currentUser='Guest';setLanguage('EN');document.getElementById('accuracy').innerText='100';document.getElementById('wpm').innerText='30';finishLesson();});
    await page.locator('#btn-mini-game').click();
    assert.equal(await page.locator('#lc-intro').isVisible(),true);
    assert.match(await page.locator('#lc-intro').textContent(),/WASD/);
    await page.locator('#lc-start-button').click();await locked();
    await page.evaluate(()=>{Lettercraft.game.nextSpawn=Infinity;});
    const initial=await page.evaluate(()=>{const g=Lettercraft.game,e=g.entities[0];return {...e,z:g.heightAt(e.x,e.y)+.55};});
    await pointAt(initial.x,initial.y,4);await clickWorld();await page.waitForTimeout(280);
    assert.equal(await page.evaluate(()=>Lettercraft.game.entities[0].hp),4,'Looking above rock cannot mine it');
    await pointAt(initial.x,initial.y,initial.z);
    assert.equal(await page.evaluate(()=>Lettercraft.view.pick(Lettercraft.game)),initial.id);
    for(let i=0;i<4;i++){await clickWorld();await page.waitForTimeout(650);}
    assert.equal(await page.evaluate(()=>Lettercraft.game.drops.some(d=>d.kind==='letter')),true);
    assert.equal(await page.evaluate(()=>Lettercraft.game.collected),0);
    await page.keyboard.down(initial.char);await page.waitForTimeout(1400);
    await page.mouse.move(760,460);await page.waitForTimeout(1400);
    assert.equal(await page.evaluate(()=>Lettercraft.game.collected),0);
    assert.ok(await page.evaluate(()=>Lettercraft.game.collecting?.elapsed>2.5));
    await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>Lettercraft.game.collected),1);
    await page.keyboard.up(initial.char);
    await pointAt(initial.x+3,initial.y,.9);
    const before=await page.evaluate(()=>({...Lettercraft.game.player}));await keyHold('w',150);
    const after=await page.evaluate(()=>({...Lettercraft.game.player}));
    assert.ok(after.x>before.x+.2);assert.ok(Math.abs(after.y-before.y)<.04);
    await keyHold('ArrowUp',160);assert.equal(await page.evaluate(()=>Lettercraft.game.tools.pickaxe),1);
    const strafeBefore=await page.evaluate(()=>Lettercraft.game.player.y);
    await keyHold('d',120);assert.ok(await page.evaluate(()=>Lettercraft.game.player.y)>strafeBefore+.2);
    await keyHold('ArrowLeft',120);await pointAt(24,19,1.6);
    fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
    await page.screenshot({path:path.join(root,'.artifacts/lettercraft-first-person.png')});
    await release();assert.equal(await page.locator('#lc-capture').isVisible(),true);
    const stopped=await page.evaluate(()=>({x:Lettercraft.game.player.x,y:Lettercraft.game.player.y}));
    await keyHold('w',120);assert.deepEqual(await page.evaluate(()=>({x:Lettercraft.game.player.x,y:Lettercraft.game.player.y})),stopped);
    const hp=await page.evaluate(()=>Lettercraft.game.entities.reduce((n,e)=>n+e.hp,0));
    await page.locator('#lc-help-button').click();assert.equal(await page.locator('#lc-help').isVisible(),true);
    assert.equal(await page.evaluate(()=>Lettercraft.game.entities.reduce((n,e)=>n+e.hp,0)),hp);
    await page.locator('#lc-resume-button').click();await locked();
    // Controlled occlusion fixture: camera/attacks/walking still use real input.
    await page.evaluate(()=>{const g=Lettercraft.game;g.player.x=16.5;g.player.y=16.5;g.entities=[{id:900,kind:'rock',char:'a',x:17.5,y:16.5,hp:4,maxHp:4},{id:901,kind:'rock',char:'b',x:18,y:16.5,hp:4,maxHp:4}];g.drops=[];});
    await pointAt(18,16.5,.55);await clickWorld();
    assert.equal(await page.evaluate(()=>Lettercraft.game.entities[1].hp),4,'Cannot mine behind an occluder');
    await keyHold('w',600);assert.ok(await page.evaluate(()=>Lettercraft.game.player.x)<16.84,'Rock blocks walking');
    await page.evaluate(()=>{const g=Lettercraft.game;g.entities=[];g.enemies=[{id:950,kind:'enemy',char:'a',x:g.player.x+2.5,y:g.player.y,hp:4,maxHp:4,stun:0}];});
    await page.waitForFunction(()=>Lettercraft.game.hearts===4);
    await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>Lettercraft.game.hearts),4);
    await page.waitForFunction(()=>Lettercraft.game.status==='lost',null,{timeout:16000});
    assert.equal(await page.evaluate(()=>Lettercraft.game.reason),'hearts');
    assert.equal(await page.evaluate(()=>document.pointerLockElement),null);
    await page.locator('#lc-retry-button').click();await locked();
    assert.equal(await page.evaluate(()=>Lettercraft.game.hearts),5);assert.equal(await page.evaluate(()=>Lettercraft.game.collected),0);
    assert.ok(await page.evaluate(()=>Lettercraft.game.remaining>299));
    await page.evaluate(()=>{Lettercraft.game.elapsed=299.95;});await page.waitForFunction(()=>Lettercraft.game.status==='lost');
    assert.match(await page.locator('#lc-dialog-title').textContent(),/หมดเวลา/);
    await page.locator('#lc-retry-button').click();await locked();
    await page.evaluate(()=>{const g=Lettercraft.game;g.enemies=[];g.nextSpawn=Infinity;g.entities=[];g.goals={a:1};g.inventory={a:0};g.goal=1;g.drops=[{id:999,kind:'letter',char:'a',x:g.player.x+.4,y:g.player.y}];});
    await keyHold('a',3250);assert.equal(await page.evaluate(()=>Lettercraft.game.status),'won');
    assert.equal(await page.locator('#lc-next-button').isVisible(),true);await page.locator('#lc-result-back').click();
    assert.equal(await page.evaluate(()=>state.isGameMode),false);assert.equal(await page.locator('#modal-complete').isVisible(),true);
    assert.equal(await page.evaluate(()=>Lettercraft.listeners),null);assert.equal(writes.length,0,'No remote guest writes');
    await page.setViewportSize({width:640,height:480});
    await page.evaluate(()=>{state.lang='TH';loadLesson(0);startMiniGame();});
    await page.locator('#lc-start-button').click();await locked();
    assert.equal(await page.evaluate(()=>document.querySelector('#game-ui').scrollWidth<=640),true);
    await page.evaluate(()=>{const g=Lettercraft.game;g.nextSpawn=Infinity;g.entities=[];g.goals={'้':1};g.inventory={'้':0};g.goal=1;g.drops=[{id:999,kind:'letter',char:'้',x:g.player.x+.4,y:g.player.y}];});
    await keyHold('h',3250);assert.equal(await page.evaluate(()=>Lettercraft.game.status),'won');
    // Browser-denied Pointer Lock has an explicit, usable right-drag fallback.
    await page.evaluate(()=>{document.getElementById('lc-canvas').requestPointerLock=()=>Promise.reject(new DOMException('Denied by host','SecurityError'));});
    await page.locator('#lc-retry-button').click();
    await page.waitForFunction(()=>Lettercraft.fallback);
    await page.locator('#lc-capture').click();
    const fallbackAngle=await page.evaluate(()=>Lettercraft.game.player.angle);
    await page.mouse.move(320,230);await page.mouse.down({button:'right'});await page.mouse.move(360,250);await page.mouse.up({button:'right'});
    assert.notEqual(await page.evaluate(()=>Lettercraft.game.player.angle),fallbackAngle);
    await release();assert.equal(await page.evaluate(()=>Lettercraft.hasControl()),false);
    await page.locator('#lc-exit-button').click();await page.locator('#lc-confirm-exit').click();
    // A missing GPU reports an actionable error and preserves the lesson exit.
    await page.evaluate(()=>{const canvas=document.getElementById('lc-canvas'),original=canvas.getContext.bind(canvas);canvas.getContext=(type,...args)=>type==='webgl'?null:original(type,...args);startMiniGame();});
    assert.equal(await page.locator('#lc-error').isVisible(),true);
    await page.locator('#lc-error-back').click();assert.equal(await page.evaluate(()=>state.isGameMode),false);
    assert.deepEqual(errors,[]);
    console.log('PASS: FPS pointer lock/Esc, mouse yaw/pitch, crosshair mining/occlusion, collision, WASD/arrows, tools, hold while looking, monster chase/five hits/invulnerability, timeout/retry/win, Thai marks, responsive layout, cleanup and no remote writes.');
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
