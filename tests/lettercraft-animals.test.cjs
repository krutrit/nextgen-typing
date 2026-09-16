const test=require('node:test'),assert=require('node:assert/strict');
const {LettercraftGame}=require('../src/lettercraft/core.js');
const species=['pig','cow','goat','sheep','chicken'];
function game(){const g=new LettercraftGame('aก',()=>.41);g.start();return g;}
function advance(g,t){for(let n=0;n<t-1e-8;n+=.025)g.update(Math.min(.025,t-n));}
function animal(g,type='pig',x=12,y=12){const e={id:999,kind:'animal',species:type,char:'a',x,y,z:0,angle:0,hp:3,maxHp:3,stun:0};g.entities=[e];g.heightAt=()=>0;g.player.x=x-2;g.player.y=y;g.player.z=0;return e;}
test('every round starts with all five species and spare lesson letter sources',()=>{
 const g=game();assert.deepEqual([...new Set(g.entities.filter(e=>e.kind==='animal').map(e=>e.species))].sort(),[...species].sort());
 for(const [char,count] of Object.entries(g.goals))assert.ok(g.entities.filter(e=>e.char===char).length>=count*2);
 for(const e of g.entities.filter(e=>e.kind==='animal')){assert.equal(e.hp,3);assert.ok(Number.isFinite(e.z));}
});
test('five-minute round never spawns pursuers or loses by contact',()=>{
 const g=game();advance(g,299.9);assert.equal(g.status,'playing');assert.deepEqual(g.enemies,[]);
 advance(g,.11);assert.equal(g.status,'lost');assert.equal(g.reason,'time');assert.ok(!g.events.some(e=>e.kind==='hurt'));
});
test('each animal flees at its species speed below player running speed',()=>{
 for(const [type,speed] of [['pig',2.3],['cow',2],['goat',2.7],['sheep',2.2],['chicken',3]]){
  const g=game(),e=animal(g,type);advance(g,.3);assert.equal(e.state,'flee');assert.ok(e.x>12.25);
  assert.ok(e.gait>0&&e.gait<=speed*.3+.001);assert.ok(speed<5);assert.equal(g.animalProfile(e).speed,speed);
 }
});
test('animals calm down only after two continuous seconds beyond six tiles',()=>{
 const g=game(),e=animal(g);advance(g,.1);g.player.x=1;g.player.y=1;
 advance(g,1.9);assert.equal(e.state,'flee');advance(g,.15);assert.ok(['idle','wander'].includes(e.state));
 g.player.x=e.x-2;g.player.y=e.y;advance(g,.1);assert.equal(e.state,'flee');
});
test('hit startles an animal then releases letters using existing attacks and three-second collection',()=>{
 const g=game(),e=animal(g);g.player.x=e.x-1;assert.equal(g.attack(e.id),true);assert.equal(e.hp,2);assert.equal(e.state,'hurt');
 assert.ok(e.fleeing);advance(g,.81);assert.equal(e.state,'flee');
 g.tools.sword=2;g.player.x=e.x-1;g.player.y=e.y;g.cooldown=0;g.attack(e.id);
 assert.equal(g.entities.length,0);const d=g.drops.find(d=>d.kind==='letter');assert.equal(d.char,'a');
 g.player.x=d.x;g.player.y=d.y;g.keyDown('KeyA','a');advance(g,2.9);assert.equal(g.collected,0);advance(g,.11);assert.equal(g.collected,1);
});
test('flee path detours around rock walls without tunnelling or leaving the map',()=>{
 const g=game(),e=animal(g);g.entities.push(...[10.5,11.5,12.5,13.5].map((y,i)=>({id:100+i,kind:'rock',x:13.5,y,hp:4,maxHp:4})));
 for(let i=0;i<160;i++){g.update(.025);assert.ok(g.isFree(e.x,e.y,g.animalProfile(e).radius,e.id));}
 assert.ok(Math.hypot(e.x-12,e.y-12)>2,'animal must escape around the wall');
 assert.ok(e.x>=.5&&e.y>=.5&&e.x<=31.5&&e.y<=31.5);
});
test('animal feet stay pinned during stance and footsteps depend on actual displacement',()=>{
 const g=game(),e=animal(g);g.update(.025);const previous=e.feet.map(f=>({...f}));const gait=e.gait;g.update(.025);
 assert.ok(e.gait>gait);let planted=0;
 for(let i=0;i<e.feet.length;i++)if(previous[i].planted&&e.feet[i].planted){planted++;assert.equal(e.feet[i].x,previous[i].x);assert.equal(e.feet[i].y,previous[i].y);assert.equal(e.feet[i].z,0);}
 assert.ok(planted>=1);
 e.stun=1;const stop=e.gait;advance(g,.2);assert.equal(e.gait,stop);assert.equal(e.moving,false);
});
test('animals step up smoothly, fall under gravity, and land without floor penetration',()=>{
 const g=game(),e=animal(g);g.heightAt=x=>x<12.7?0:.25;let previous=e.z;
 for(let i=0;i<35;i++){g.update(.025);assert.ok(Math.abs(e.z-previous)<=.12,'step must be smoothed');previous=e.z;for(const f of e.feet)assert.ok(f.z>=g.heightAt(f.x,f.y)-1e-6);}
 assert.ok(e.z>.2);
 g.heightAt=()=>0;e.z=1;e.vz=0;e.grounded=false;e.stun=2;g.update(.025);assert.ok(e.z<1&&e.z>.8);advance(g,1);assert.equal(e.z,0);assert.equal(e.grounded,true);
});
test('continuous strides keep feet within a natural reach of their hips',()=>{
 for(const type of species){
  const g=game(),e=animal(g,type),p=g.animalProfile(e);e.grounded=true;e.gait=0;e.moving=true;
  g.animalFeet(e,0);
  for(let i=0;i<240;i++){
   e.x+=.015;e.gait+=.015;g.animalFeet(e,.025);
   const anchors=g.animalAnchors(e);
   for(let j=0;j<e.feet.length;j++)assert.ok(Math.hypot(e.feet[j].x-anchors[j].x,e.feet[j].y-anchors[j].y)<=p.legHeight*1.1,`${type}: foot stretched behind hip`);
  }
 }
});
