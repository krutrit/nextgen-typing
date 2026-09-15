const test=require('node:test'),assert=require('node:assert/strict');const {LettercraftGame}=require('../src/lettercraft/core.js');
function game(){const g=new LettercraftGame('a',()=>.4);g.start();g.entities=[];g.nextSpawn=Infinity;return g;}
function enemy(g,x=g.player.x+.5,y=g.player.y){const e={id:900,kind:'enemy',char:'a',x,y,hp:4,maxHp:4,stun:0};g.enemies=[e];return e;}
function advance(g,t){for(let n=0;n<t-1e-8;n+=.02)g.update(Math.min(.02,t-n));}
test('enemies patrol when distant, detect, pursue, and expose animation state',()=>{
 const g=game(),e=enemy(g,3,3);advance(g,2);assert.ok(Math.hypot(e.x-3,e.y-3)>.1);assert.ok(['wander','idle'].includes(e.state));
 e.x=g.player.x+3;e.y=g.player.y;advance(g,.2);assert.equal(e.state,'chase');assert.ok(e.moving);
});
test('enemy attack cooldown remains even when player invulnerability is cleared',()=>{
 const g=game(),e=enemy(g);g.update(.02);assert.equal(g.hearts,4);assert.ok(e.attackCooldown>0);assert.ok(e.attackTime>0);
 g.invulnerable=0;e.x=g.player.x+.4;e.y=g.player.y;g.update(.02);assert.equal(g.hearts,4);
});
test('enemy attacks require unobstructed line of sight and vertical proximity',()=>{
 const g=game(),e=enemy(g);g.entities=[{id:901,kind:'rock',x:g.player.x+.25,y:g.player.y,hp:4,maxHp:4}];g.update(.02);assert.equal(g.hearts,5);
 g.entities=[];g.player.z=3;g.player.grounded=false;g.player.vz=0;g.update(.02);assert.equal(g.hearts,5);
});
test('hitting an enemy exposes hurt feedback and the original damage event',()=>{
 const g=game(),e=enemy(g,17.5,16.5);g.attack(e.id);assert.equal(e.hp,3);assert.ok(e.hurtTime>0);assert.ok(e.x>17.5);
 assert.equal(g.events.find(e=>e.kind==='hit').damage,1);
});
