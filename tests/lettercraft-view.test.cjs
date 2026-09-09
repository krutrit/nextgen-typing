const test = require('node:test');
const assert = require('node:assert/strict');
const LettercraftView = require('../src/lettercraft/view.js');
const View=LettercraftView;
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const camera={x:0,y:0,z:1.6,angle:0,pitch:0};
test('perspective uses forward +X, screen right +Y and vertical height',()=>{
 const p=View.projectPoint({x:5,y:0,z:1.6},camera,800,600);
 close(p.x,400);close(p.y,300);close(p.depth,5);assert.equal(p.visible,true);
 assert.ok(View.projectPoint({x:5,y:1,z:1.6},camera,800,600).x>400);
 assert.ok(View.projectPoint({x:5,y:0,z:2.6},camera,800,600).y<300);
 assert.equal(View.projectPoint({x:-1,y:0,z:1.6},camera,800,600).visible,false);
 assert.equal(View.projectPoint({x:100,y:0,z:1.6},camera,800,600).visible,false);
});
test('yaw and positive upward pitch align the matching world ray to center',()=>{
 const fixtures=[{angle:Math.PI/2,pitch:0,point:{x:0,y:5,z:1.6}},
 {angle:0,pitch:Math.PI/4,point:{x:5,y:0,z:6.6}},
 {angle:0,pitch:-Math.PI/4,point:{x:5,y:0,z:-3.4}}];
 for(const {angle,pitch,point} of fixtures){const p=View.projectPoint(point,{...camera,angle,pitch},800,600);close(p.x,400);close(p.y,300);assert.equal(p.visible,true);}
});
test('ray slabs handle nearest face, parallel misses, inside origins and behind boxes',()=>{
 const min={x:2,y:-1,z:-1},max={x:3,y:1,z:1};
 close(View.rayBox({x:0,y:0,z:0},{x:1,y:0,z:0},min,max),2);
 assert.equal(View.rayBox({x:0,y:2,z:0},{x:1,y:0,z:0},min,max),null);
 close(View.rayBox({x:2.5,y:0,z:0},{x:1,y:0,z:0},min,max),0);
 assert.equal(View.rayBox({x:0,y:0,z:0},{x:-1,y:0,z:0},min,max),null);
});
function view(){return Object.assign(Object.create(View.prototype),{width:800,height:600,time:0,camera:{...camera},labels:[]});}
function game(){return {size:32,player:{x:2,y:5,angle:0,pitch:-.4},heightAt:()=>0,entities:[],enemies:[],drops:[]};}
test('center pick resolves nearest actual cube and foliage occludes targets',()=>{
 const v=view(),g=game();g.entities=[{id:'far',kind:'rock',x:5,y:5},{id:'near',kind:'rock',x:4,y:5}];
 assert.equal(v.pick(g),'near');g.player.pitch=.28;g.entities=[{id:'tree',kind:'tree',x:4,y:5}];assert.equal(v.pick(g),null);
});
test('pick reads current player yaw and terrain eye height before render',()=>{
 const v=view(),g=game();g.heightAt=()=>.75;g.player.angle=Math.PI/2;
 g.entities=[{id:'rock',kind:'rock',x:2,y:7}];assert.equal(v.pick(g),'rock');
 g.player.angle=-Math.PI/2;assert.equal(v.pick(g),null);
});
test('terrain blocks a ray aimed through a raised step',()=>{
 const v=view(),g=game();g.player.pitch=-.5;
 g.drops=[{id:'hidden',kind:'letter',char:'A',x:4.5,y:5}];
 assert.equal(v.pick(g),'hidden');
 g.heightAt=x=>x>=3&&x<4?.75:0;
 assert.equal(v.pick(g),null);
});
test('a visible letter plaque is pickable but an intervening trunk hides it',()=>{
 const v=view(),g=game();g.player.pitch=Math.atan2(1.45-1.6,4.54);
 g.entities=[{id:'rock',kind:'rock',char:'A',x:7,y:5}];
 assert.equal(v.pick(g),'rock');
 g.entities.push({id:'tree',kind:'tree',x:4,y:5});
 assert.equal(v.pick(g),'tree');
 const camera=v._camera(g),scene=v._scene(g,camera);
 assert.equal(v._visibleLabels(g,camera,scene,[...v._terrain(g),...scene.boxes]).some(p=>p.item.id==='rock'),false);
});
test('the first rock plaque stays above the footer with the starting camera',()=>{
 const v=view(),g=game();v.width=1440;v.height=900;g.player.pitch=-.22;
 g.entities=[{id:'first',kind:'rock',char:'A',x:3,y:5}];
 const c=v._camera(g),scene=v._scene(g,c);
 const label=v._visibleLabels(g,c,scene,[...v._terrain(g),...scene.boxes]).find(p=>p.item.id==='first');
 assert.ok(label,'starting rock letter must be visible');
 assert.ok(label.y>90&&label.y<720,`plaque y=${label.y} overlaps HUD`);
});
test('a nearby drop plaque and its progress ring stay above the footer',()=>{
 const v=view(),g=game();v.width=1440;v.height=900;g.player.pitch=-.22;
 g.drops=[{id:'drop',kind:'letter',char:'A',x:3.5,y:5}];
 g.collecting={dropId:'drop',elapsed:1};
 const c=v._camera(g),scene=v._scene(g,c);
 const label=v._visibleLabels(g,c,scene,[...v._terrain(g),...scene.boxes]).find(p=>p.item.id==='drop');
 assert.ok(label,'nearby drop letter must remain visible above HUD');
 assert.ok(label.y+label.size*.72<720,'the full collection ring must clear the HUD');
});
test('damage produces surface cracks and target frame follows the main cube rather than ore',()=>{
 const v=view(),g=game();
 g.entities=[{id:'rock',kind:'rock',char:'A',x:4,y:5,hp:2,maxHp:3}];
 const c=v._camera(g),scene=v._scene(g,c);
 const details=v._surfaceDetails(g,scene.boxes,'rock');
 const cracks=details.filter(b=>b.detail==='crack'),frame=details.filter(b=>b.detail==='frame');
 assert.ok(cracks.length>0,'a damaged resource must have visible crack geometry');
 assert.ok(frame.length>0,'a targeted resource must have an actual cube frame');
 assert.ok(frame.some(b=>b.min.x<3.6)&&frame.some(b=>b.max.x>4.4),'frame must surround the .8-wide body');
 assert.ok(frame.some(b=>b.max.z>.82),'frame must reach the top of the main cube');
 assert.equal(v._surfaceDetails({...g,entities:[{...g.entities[0],hp:3}]},scene.boxes,null).length,0,'healthy untargeted geometry needs no damage or frame');
});
