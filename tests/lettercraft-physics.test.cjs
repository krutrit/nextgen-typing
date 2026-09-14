const test=require('node:test'),assert=require('node:assert/strict');
const {LettercraftGame}=require('../src/lettercraft/core.js');
function game(){const g=new LettercraftGame('a',()=>.4);g.start();g.entities=[];g.enemies=[];g.nextSpawn=Infinity;return g;}
function advance(g,t){for(let n=0;n<t-1e-8;n+=.01)g.update(Math.min(.01,t-n));}
test('jump rises then lands on terrain, and holding Space cannot auto-jump',()=>{
 const g=game();g.keyDown('Space',' ');advance(g,.2);assert.ok(g.player.z>.3);assert.equal(g.player.grounded,false);
 advance(g,2);assert.equal(g.player.z,g.heightAt(g.player.x,g.player.y));assert.equal(g.player.grounded,true);assert.equal(g.player.vz,0);
 advance(g,.5);assert.equal(g.player.z,0);
});
test('re-pressing jump in midair cannot double jump',()=>{
 const g=game();g.keyDown('Space',' ');advance(g,.15);g.keyUp('Space');const velocity=g.player.vz;
 g.keyDown('Space',' ');assert.equal(g.player.vz,velocity);advance(g,2);g.keyUp('Space');g.keyDown('Space',' ');assert.ok(g.player.vz>0);
});
test('jump cancels collection and airborne keys cannot collect ground letters',()=>{
 const g=game();g.drops=[{id:900,kind:'letter',char:'a',x:g.player.x+.4,y:g.player.y}];g.keyDown('KeyA','a');advance(g,1);
 g.keyDown('Space',' ');assert.equal(g.collecting,null);g.keyUp('Space');g.keyUp('KeyA');g.keyDown('KeyA','a');assert.equal(g.collecting,null);
});
test('fall sweeps onto a rock top and walking off falls back to terrain',()=>{
 const g=game();g.entities=[{id:900,kind:'rock',x:16.5,y:16.5,hp:4,maxHp:4}];g.player.z=3;g.player.vz=-20;g.player.grounded=false;
 advance(g,.3);assert.equal(g.player.z,1.02);assert.equal(g.player.grounded,true);
 g.keyDown('KeyW','w');advance(g,.8);assert.equal(g.player.z,g.heightAt(g.player.x,g.player.y));assert.equal(g.player.grounded,true);
});
test('rising into tree leaves stops at the underside instead of passing through',()=>{
 const g=game();g.entities=[{id:900,kind:'tree',x:17.4,y:16.5,hp:4,maxHp:4}];
 g.keyDown('Space',' ');advance(g,.2);assert.ok(g.player.z<=.05+1e-6);assert.ok(g.player.vz<=0);
});
test('quarter-height terrain steps remain traversable and unsupported feet fall',()=>{
 const g=game();g.heightAt=x=>x>=17?.25:0;g.keyDown('KeyW','w');advance(g,.3);
 assert.equal(g.player.z,.25);assert.equal(g.player.grounded,true);
 g.keyUp('KeyW');g.keyDown('KeyS','s');advance(g,.8);assert.equal(g.player.z,0);
});
