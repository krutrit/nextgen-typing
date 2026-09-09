const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
function game(text = 'wasdก้abcdef') {
  const file = path.join(__dirname, '../src/lettercraft/core.js');
  assert.ok(fs.existsSync(file), 'Approved mouse-attack / hold-to-collect engine is not implemented');
  const { LettercraftGame } = require(file);
  const g = new LettercraftGame(text, () => 0.4);
  g.start(); g.enemies = []; g.nextSpawn = Infinity; return g;
}
function fixture() {
  const g=game('a');g.player.x=10.5;g.player.y=10.5;
  g.entities=[{id:999,kind:'rock',char:'a',x:11.5,y:10.5,hp:4,maxHp:4,stun:0}];return g;
}
function advance(g,t,active=true){for(let left=t;left>0.000001;left-=0.05)g.update(Math.min(left,0.05),active);}
function drop(g,char='a',id=500){g.drops.push({id,kind:'letter',char,x:g.player.x+0.4,y:g.player.y});}
test('first-person movement follows yaw and strafes without pitching into the ground',()=>{
 for(const [yaw,code,wantX,wantY] of [[0,'KeyW',1,0],[0,'KeyD',0,1],[0,'ArrowLeft',0,-1],[Math.PI/2,'ArrowUp',0,1],[Math.PI/2,'KeyS',0,-1],[Math.PI/2,'KeyD',-1,0]]){
  const g=fixture();g.entities=[];g.player.angle=yaw;g.player.pitch=1;g.keyDown(code,code);
  const d=g.direction();assert.ok(Math.abs(d.x-wantX)<1e-10);assert.ok(Math.abs(d.y-wantY)<1e-10);
 }
});
test('mouse look clamps pitch and does not cancel a letter hold',()=>{
 const g=fixture();drop(g);g.keyDown('KeyA','a');advance(g,1);
 assert.equal(typeof g.look,'function');g.look(100,-100);assert.ok(g.player.angle>0);assert.ok(g.player.pitch>0);
 g.look(0,-100000);assert.ok(g.player.pitch<=1.25);g.look(0,100000);assert.ok(g.player.pitch>=-1.25);
 const before={...g.player};g.look(NaN,Infinity);assert.deepEqual(g.player,before);
 advance(g,2.01);assert.equal(g.collected,1);
});
test('terrain is stepped, remains walkable and keeps the spawn area level',()=>{
 const g=fixture();assert.equal(typeof g.heightAt,'function');assert.equal(g.heightAt(16.5,16.5),0);
 const heights=new Set();for(let x=1;x<31;x++)for(let y=1;y<31;y++){
  const h=g.heightAt(x+.5,y+.5);heights.add(h);assert.ok(h>=0&&h<=.75);
  assert.ok(Math.abs(h-g.heightAt(x+1.5,y+.5))<=.5);
  assert.ok(Math.abs(h-g.heightAt(x+.5,y+1.5))<=.5);
 }
 assert.ok(heights.size>=3);
});
test('animal bodies block walking while animals may still wander around their own footprint',()=>{
 const g=fixture();g.entities=[{id:999,kind:'animal',char:'a',x:11.5,y:10.5,homeX:11.5,homeY:10.5,hp:3,maxHp:3,wander:0,stun:0}];
 g.move(g.player,3,0);assert.ok(g.player.x<10.84);
 g.player.x=5;g.player.y=5;const y=g.entities[0].y;advance(g,.2);assert.notEqual(g.entities[0].y,y);
});
test('a successful attack does not snap camera yaw or pitch to object center',()=>{
 const g=fixture();g.player.angle=.2;g.player.pitch=-.4;g.attack(999);
 assert.equal(g.entities[0].hp,3);assert.equal(g.player.angle,.2);assert.equal(g.player.pitch,-.4);
});
test('mouse attacks respect cooldown and range, break rock and drop without collecting',()=>{
 const g=fixture();g.attack(999);assert.equal(g.entities[0].hp,3);g.attack(999);assert.equal(g.entities[0].hp,3);
 for(let i=0;i<3;i++){advance(g,0.61);g.attack(999);}
 assert.equal(g.entities.length,0);assert.equal(g.collected,0);
 assert.ok(g.drops.some(d=>d.kind==='letter'&&d.char==='a'));
 assert.ok(g.drops.some(d=>d.kind==='tool'&&d.tool==='pickaxe'));
 const h=fixture();h.player.x=1;h.attack(999);assert.equal(h.entities[0].hp,4);
});
test('letter presses cannot mine; walking over letters cannot collect',()=>{
 const g=fixture();g.keyDown('KeyA','a');advance(g,3.1);assert.equal(g.entities[0].hp,4);
 g.clearInput();g.player.x=10.5;drop(g);advance(g,4);assert.equal(g.collected,0);
});
test('correct WASD hold requires three seconds and does not move after completion',()=>{
 const g=fixture();drop(g);g.keyDown('KeyA','a');const x=g.player.x;
 advance(g,2.9);assert.equal(g.collected,0);assert.equal(g.player.x,x);
 advance(g,0.11);assert.equal(g.collected,1);advance(g,0.5);assert.equal(g.player.x,x);
 g.keyUp('KeyA');const y=g.player.y;g.keyDown('KeyA','a');advance(g,0.2);assert.notEqual(g.player.y,y);
});
test('release, wrong/multiple keys, movement and lost focus cancel collection',()=>{
 for(const cancel of [g=>g.keyUp('KeyA'),g=>g.keyDown('KeyB','b'),g=>g.keyDown('ArrowUp','ArrowUp'),g=>g.clearInput()]){
  const g=fixture();drop(g);g.keyDown('KeyA','a');advance(g,2);cancel(g);advance(g,1.1);
  assert.equal(g.collected,0);assert.equal(g.collecting,null);
 }
});
test('walking past a drop with WASD already held never starts collection',()=>{
 const g=fixture();g.entities=[];g.keyDown('KeyD','d');advance(g,0.1);drop(g,'d');advance(g,0.1);assert.equal(g.collecting,null);
});
test('Thai letters on WASD physical keys collect without moving',()=>{
 const g=game('ฟ');g.entities=[];drop(g,'ฟ');const {x,y}=g.player;
 g.keyDown('KeyA','ฟ');advance(g,3.01);assert.equal(g.collected,1);assert.equal(g.player.x,x);assert.equal(g.player.y,y);
});
test('one matching drop per press even when more are in range',()=>{
 const g=fixture();drop(g,'a',500);drop(g,'a',501);g.keyDown('KeyA','a');advance(g,7);
 assert.equal(g.collected,1);g.keyUp('KeyA');g.keyDown('KeyA','a');advance(g,3.01);assert.equal(g.collected,2);
});
test('tools accelerate attacks but collection stays three seconds',()=>{
 const g=fixture();g.tools.pickaxe=1;g.attack(999);assert.equal(g.entities[0].hp,2);
 advance(g,0.46);g.attack(999);assert.equal(g.entities.length,0);
 g.player.x=11.5;g.keyDown('KeyA','a');advance(g,1.6);assert.equal(g.collected,0);advance(g,1.41);assert.equal(g.collected,1);
});
test('five separate hits lose; invulnerability prevents repeat contact',()=>{
 const g=fixture();g.enemies=[{id:7,kind:'enemy',char:'a',x:10.5,y:10.5,hp:4,maxHp:4,stun:0}];
 g.update(0.01);assert.equal(g.hearts,4);g.update(0.05);assert.equal(g.hearts,4);
 for(let i=0;i<4;i++){g.invulnerable=0;g.enemies[0].x=g.player.x;g.enemies[0].y=g.player.y;g.update(0.01);}
 assert.equal(g.hearts,0);assert.equal(g.status,'lost');
});
test('lethal damage takes priority over collecting the last letter',()=>{
 const g=fixture();drop(g);g.keyDown('KeyA','a');advance(g,2.99);g.hearts=1;
 g.enemies=[{id:7,kind:'enemy',char:'a',x:g.player.x,y:g.player.y,hp:4,maxHp:4,stun:0}];
 g.update(0.05);assert.equal(g.status,'lost');assert.equal(g.collected,0);
});
test('inactive time counts toward five minutes but cannot collect or damage',()=>{
 const g=fixture();drop(g);g.keyDown('KeyA','a');g.update(200,false);assert.equal(g.collected,0);assert.equal(g.hearts,5);
 g.update(100,false);assert.equal(g.status,'lost');assert.equal(g.remaining,0);g.attack(999);assert.equal(g.entities[0].hp,4);
});
test('timeout takes priority over last collectible',()=>{
 const g=fixture();g.goals={a:1};g.goal=1;drop(g);g.keyDown('KeyA','a');advance(g,2.99);
 g.elapsed=299.99;g.update(0.05);assert.equal(g.status,'lost');assert.equal(g.collected,0);
});
test('quest quantities gate victory and redundant letters do not inflate score',()=>{
 const g=fixture();g.goals={a:1,b:1};g.goal=2;drop(g);g.keyDown('KeyA','a');advance(g,3.01);g.keyUp('KeyA');assert.equal(g.status,'playing');
 drop(g,'a',501);g.keyDown('KeyA','a');advance(g,0.1);assert.equal(g.collecting,null);g.clearInput();
 drop(g,'b',502);g.keyDown('KeyB','b');advance(g,3.01);assert.equal(g.status,'won');
});
test('WASD, arrows, diagonal and duplicate direction keys have same speed',()=>{
 const run=codes=>{const g=fixture();g.entities=[];for(const c of codes)g.keyDown(c,c);advance(g,1);return Math.hypot(g.player.x-10.5,g.player.y-10.5);};
 for(const codes of [['KeyW'],['ArrowUp'],['KeyW','ArrowUp'],['KeyW','KeyD']])assert.ok(Math.abs(run(codes)-3.5)<0.001);
});
test('aim is independent of movement and does not cancel collecting',()=>{
 const g=fixture();g.aim(g.player.x+1,g.player.y);assert.equal(g.player.angle,0);
 g.aim(g.player.x,g.player.y+1);assert.ok(Math.abs(g.player.angle-Math.PI/2)<0.001);
 g.aim(g.player.x,g.player.y);assert.ok(Math.abs(g.player.angle-Math.PI/2)<0.001);
 drop(g);g.keyDown('KeyA','a');advance(g,1);g.aim(g.player.x-1,g.player.y);advance(g,2.01);assert.equal(g.collected,1);
});
test('solid obstacles block movement and attacks through another object',()=>{
 const g=fixture();g.entities.push({id:998,kind:'tree',char:'a',x:10.95,y:10.5,hp:4,maxHp:4});
 g.attack(999);assert.equal(g.entities[0].hp,4);assert.equal(g.isFree(11.5,10.5),false);
});
test('every quest letter has reachable spare sources across seeds',()=>{
 for(let seed=1;seed<=12;seed++){
  let n=seed;const rng=()=>((n=(n*1664525+1013904223)>>>0)/4294967296);
  const {LettercraftGame}=require('../src/lettercraft/core.js');const g=new LettercraftGame('ก้าสdfW!?',rng);
  for(const [c,count]of Object.entries(g.goals))assert.ok(g.entities.filter(e=>e.char===c).length>=count*2);
  const seen=new Set(['16,16']),q=[[16,16]];
  for(let i=0;i<q.length;i++){const[x,y]=q[i];for(const[dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const a=x+dx,b=y+dy,k=a+','+b;if(!seen.has(k)&&g.isFree(a+0.5,b+0.5)){seen.add(k);q.push([a,b]);}}}
  for(const e of g.entities)assert.ok([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>seen.has((Math.floor(e.x)+dx)+','+(Math.floor(e.y)+dy))));
 }
});
test('empty lessons cannot start an unwinnable round',()=>{const g=game(' \n\t');assert.equal(g.status,'invalid');assert.equal(g.goal,0);});
test('monsters spawn after twenty seconds away from player and never exceed three',()=>{
 const g=game();g.nextSpawn=20;advance(g,19.9);assert.equal(g.enemies.length,0);
 advance(g,0.15);assert.equal(g.enemies.length,1);
 assert.ok(Math.hypot(g.enemies[0].x-g.player.x,g.enemies[0].y-g.player.y)>5.8);
 g.invulnerable=999;advance(g,100);assert.equal(g.enemies.length,3);
});
test('monsters route around a solid wall and reach the player',()=>{
 const g=fixture();g.entities=[9.5,10.5,11.5].map((y,i)=>({id:90+i,kind:'rock',char:'a',x:12.5,y,hp:4,maxHp:4}));
 g.enemies=[{id:7,kind:'enemy',char:'a',x:14.5,y:10.5,hp:4,maxHp:4,stun:0}];
 advance(g,7);assert.ok(g.hearts<5,'enemy should find a path around wall');
});
test('tool pickups equip automatically, upgrade once per drop and cap at crystal',()=>{
 const g=fixture();g.entities=[];
 for(let i=0;i<4;i++){g.drops.push({id:600+i,kind:'tool',tool:'sword',x:g.player.x,y:g.player.y});advance(g,0.05);}
 assert.equal(g.tools.sword,2);assert.equal(g.drops.length,0);
});
test('attacking cancels collection without collecting again until release',()=>{
 const g=fixture();drop(g);g.keyDown('KeyA','a');advance(g,2);g.attack(999);advance(g,4);
 assert.equal(g.collected,0);assert.equal(g.collecting,null);assert.equal(g.player.x,10.5);
});
test('releasing or adding Shift invalidates the character during a continuous hold',()=>{
 const upper=game('A');upper.entities=[];drop(upper,'A');upper.keyDown('ShiftLeft','Shift');upper.keyDown('KeyA','A');advance(upper,1);
 upper.keyUp('ShiftLeft');advance(upper,2.05);assert.equal(upper.collected,0);assert.equal(upper.collecting,null);
 const lower=fixture();drop(lower);lower.keyDown('KeyA','a');advance(lower,1);lower.keyDown('ShiftLeft','Shift');advance(lower,2.05);
 assert.equal(lower.collected,0);assert.equal(lower.collecting,null);
});
