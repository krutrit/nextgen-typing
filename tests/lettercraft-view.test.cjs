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
function fixedCamera(v,g){v.camera={x:g.player.x,y:g.player.y,z:g.heightAt(g.player.x,g.player.y)+1.6,angle:g.player.angle,pitch:g.player.pitch};}

test('generated meadow decoration is cached, bounded, and keeps paths and resources clear',()=>{
 const v=view(),g=game();g.entities=[{kind:'rock',x:5.5,y:5.5}];
 const flowers=v._decorations(g);assert.ok(flowers.length>30&&flowers.length<600);
 assert.equal(v._decorations(g),flowers);assert.deepEqual(view()._decorations(g),flowers);
 for(const b of flowers){const x=(b.min.x+b.max.x)/2,y=(b.min.y+b.max.y)/2;
  assert.ok(Math.abs(x-16)>1.1&&Math.abs(y-16)>1.1);
  assert.ok(Math.hypot(x-5.5,y-5.5)>.9);assert.equal(b.id,null);
  assert.ok(b.max.z-g.heightAt(x,y)<.5,'plants must remain low, non-solid ground cover');
 }
});
test('ambient and directional light shade actual rotated face normals',()=>{
 const v=view(),box={min:{x:0,y:0,z:0},max:{x:1,y:1,z:1},material:13};
 const a=[];v._boxVertices(a,box);assert.ok(a[5]>a[6*8+5],'top must receive more light than underside');
 const b=[];v._boxVertices(b,{...box,transform:{x:0,y:0,z:0,pivot:{x:0,y:0,z:0},swing:0,yaw:Math.PI}});
 assert.notEqual(a[12*8+5],b[12*8+5],'turning a side changes its sun exposure');
 assert.ok(b.filter((_,i)=>i%8===5).every(c=>c>=.55),'ambient fill keeps shaded faces readable');
});

test('third-person camera frames the full avatar behind its facing with shoulder clearance',()=>{
 const v=view(),g=game();Object.assign(g.player,{x:16,y:16,pitch:-.32,facing:0});
 const c=v.updateCamera(g,0);
 assert.ok(c.x<13&&c.z>2,'camera must trail behind and above the avatar');
 for(const z of [0,1.6]) {const p=v.project(16,16,z);assert.ok(p.visible&&p.y>50&&p.y<550,'full avatar must clear screen edges');assert.ok(p.x<380,'avatar must leave the center reticle clear');}
 g.player.x=17;v.updateCamera(g,1/60);assert.ok(v.camera.x>c.x&&v.camera.x<c.x+1,'follow movement must ease');
 g.player.angle=Math.PI/2;v.updateCamera(g,1/60);close(v.camera.angle,Math.PI/2);
});

test('camera clamps zoom and retracts before trees, foliage, terrain, and map bounds',()=>{
 const v=view(),g=game();Object.assign(g.player,{x:16,y:16,pitch:0});g.cameraDistance=100;
 let c=v.updateCamera(g,0);assert.ok(Math.hypot(c.x-16,c.y-16)<7.1);
 g.cameraDistance=.1;c=v.updateCamera(g,0);assert.ok(Math.hypot(c.x-16,c.y-16)>2.1);
 g.cameraDistance=7;v.updateCamera(g,0);g.entities=[{id:'tree',kind:'tree',x:13,y:16}];c=v.updateCamera(g,1/60);
 assert.ok(c.x>13.55,'sweep must stop in front of the trunk');
 for(const b of v._scene(g,c).boxes)assert.equal(View.rayBox(c,{x:0,y:0,z:0},b.min,b.max),null,'camera must remain outside geometry');
 const blockedX=c.x;g.entities=[];v.updateCamera(g,1/60);assert.ok(v.camera.x<blockedX&&v.camera.x>9.1,'recovery must ease');
 g.player.pitch=-.5;g.entities=[{id:'tree',kind:'tree',x:13,y:16}];c=v.updateCamera(g,0);assert.ok(c.x>13.9,'canopy must retract camera');
 g.entities=[];g.heightAt=x=>x<14?3:0;c=v.updateCamera(g,0);assert.ok(c.x>14,'raised terrain must retract camera');
 g.heightAt=()=>0;g.player.x=.4;g.player.pitch=0;c=v.updateCamera(g,0);assert.ok(c.x>=.15,'camera must stay inside the map');
});

test('avatar has six articulated body parts and walk/run geometry changes while feet stay supported',()=>{
 const v=view(),g=game();g.player.z=.75;g.player.facing=Math.PI/2;
 const idle=v._avatar(g);for(const name of ['head','body','leftArm','rightArm','leftLeg','rightLeg'])assert.ok(idle.some(b=>b.part===name));
 const limbVertices=parts=>{const out=[];v._boxVertices(out,parts.find(b=>b.part==='leftLeg'));return out;};
 const resting=limbVertices(idle);g.player.moving=true;v.time=.15;const walking=limbVertices(v._avatar(g));
 assert.notDeepEqual(walking,resting);g.player.running=true;assert.notDeepEqual(limbVertices(v._avatar(g)),walking);
 const all=[];for(const b of v._avatar(g))v._boxVertices(all,b);const zs=all.filter((_,i)=>i%8===2);assert.ok(Math.min(...zs)>=.7499&&Math.min(...zs)<.78,'feet must use player elevation');
 for(const time of [.05,.1,.3,.5]) {v.time=time;const frame=[];for(const b of v._avatar(g))v._boxVertices(frame,b);close(Math.min(...frame.filter((_,i)=>i%8===2)),.75);}
});

test('avatar rotation follows body facing independently of orbit and idle arms breathe',()=>{
 const v=view(),g=game();g.player.facing=0;
 const points=(name)=>{const out=[];v._boxVertices(out,v._avatar(g).find(b=>b.part===name));return out;};
 const face=points('eye'),arm=points('leftArm');g.player.angle=Math.PI/2;assert.deepEqual(points('eye'),face);
 g.player.facing=Math.PI/2;const turned=points('eye');assert.ok(turned.filter((_,i)=>i%8===1).every(y=>y>5.2));
 v.time=.4;assert.notDeepEqual(points('leftArm'),arm);
});

test('jump, falling, and landing poses react to physics state without changing feet elevation',()=>{
 const v=view(),g=game();Object.assign(g.player,{z:2,grounded:true,vz:0,landing:0,facing:0});
 const geometry=()=>{const out=[];for(const b of v._avatar(g))v._boxVertices(out,b);return out;};
 const standing=geometry();g.player.grounded=false;g.player.vz=4;const rising=geometry();assert.notDeepEqual(rising,standing,'takeoff must pose the arms and legs');
 g.player.vz=-3;const falling=geometry();assert.notDeepEqual(falling,rising,'falling must use a different pose');
 g.player.grounded=true;g.player.landing=.18;const landing=geometry();assert.notDeepEqual(landing,standing,'landing must absorb impact');
 const maxZ=points=>Math.max(...points.filter((_,i)=>i%8===2));assert.ok(maxZ(landing)<maxZ(standing)-.08,'landing must lower the body');
 for(const points of [standing,rising,falling,landing])close(Math.min(...points.filter((_,i)=>i%8===2)),2);
 g.player.landing=0;assert.deepEqual(geometry(),standing,'landing must recover to the standing pose');
});

test('held pickaxe, axe and sword have distinct visible geometry and upgraded materials',()=>{
 const v=view(),g=game();g.tools={pickaxe:0,axe:0,sword:0};
 const weapons=[];
 for(const tool of ['pickaxe','axe','sword']) {g.activeTool=tool;const parts=v._avatar(g).filter(b=>b.part.startsWith('held'));
  assert.ok(parts.length>=4,'tools need readable handles, metal and shaped edges');
  const world=parts.flatMap(b=>[View.transformPoint(b.min,b.transform),View.transformPoint(b.max,b.transform)]);
  assert.ok(world.some(p=>p.x>g.player.x+.63),'weapon head must extend ahead of the body');
  const out=[];for(const b of parts)v._boxVertices(out,b);weapons.push(out);
 }
 assert.notDeepEqual(weapons[0],weapons[1]);assert.notDeepEqual(weapons[1],weapons[2]);
 g.tools.sword=2;const upgraded=[];for(const b of v._avatar(g).filter(b=>b.part.startsWith('held')))v._boxVertices(upgraded,b);
 assert.notDeepEqual(upgraded.filter((_,i)=>i%8>=3),weapons[2].filter((_,i)=>i%8>=3),'tool level must change the rendered material');
});

test('every weapon component is physically connected to its grip without floating gaps',()=>{
 const v=view(),g=game();
 for(const tool of ['pickaxe','axe','sword']) {
  g.activeTool=tool;const rig=v._avatar(g),hand=rig.find(b=>b.part==='rightHand');
  const parts=rig.filter(b=>b.part.startsWith('held'));
  const grip=parts[0].transform,handCenter=View.transformPoint({x:(hand.min.x+hand.max.x)/2,y:(hand.min.y+hand.max.y)/2,z:(hand.min.z+hand.max.z)/2},hand.transform);
  close(grip.x,handCenter.x);close(grip.y,handCenter.y);close(grip.z,handCenter.z);
  const seen=new Set([0]);for(let pass=0;pass<parts.length;pass++)for(let i=0;i<parts.length;i++)for(const j of [...seen]) {
   if(['x','y','z'].every(a=>parts[i].min[a]<=parts[j].max[a]+.001&&parts[i].max[a]>=parts[j].min[a]-.001))seen.add(i);
  }
  assert.equal(seen.size,parts.length,tool+' has floating/disconnected components');
 }
});
test('walking support offset is applied only once to the shared hand and weapon transform',()=>{
 const v=view(),g=game();g.player.moving=true;v.time=.16;
 const parts=v._avatar(g),left=parts.find(b=>b.part==='leftHand'),right=parts.find(b=>b.part==='rightHand');
 assert.ok(Math.abs(left.transform.z-right.transform.z)<1e-8,'weapon arm must not accumulate the foot correction for each component');
});
test('shoulder, elbow, forearm and wrist stay connected through turns and attack phases',()=>{
 const v=view(),g=game();Object.assign(g.player,{z:.75,moving:true,swingDuration:.22});v.time=.16;
 for(const tool of ['pickaxe','axe','sword'])for(const facing of [0,.7,Math.PI])for(const swing of [0,.05,.11,.2]) {
  g.activeTool=tool;Object.assign(g.player,{facing,swing});
  const rig=v._avatar(g),upper=rig.find(b=>b.part==='rightArm'),lower=rig.find(b=>b.part==='rightForearm'),hand=rig.find(b=>b.part==='rightHand'),grip=rig.find(b=>b.part==='heldHandle').transform;
  const end=b=>View.transformPoint({x:0,y:0,z:b.max.z},b.transform),start=b=>View.transformPoint({x:0,y:0,z:0},b.transform);
  const center=View.transformPoint({x:(hand.min.x+hand.max.x)/2,y:(hand.min.y+hand.max.y)/2,z:(hand.min.z+hand.max.z)/2},hand.transform);
  for(const axis of ['x','y','z']) {close(end(upper)[axis],start(lower)[axis]);close(end(lower)[axis],center[axis]);close(grip[axis],center[axis]);}
 }
});
test('tool-specific attacks animate the hand and attached weapon and settle back to rest',()=>{
 const v=view(),g=game();g.player.swingDuration=.22;
 const snapshots=[];
 for(const tool of ['pickaxe','axe','sword']) {g.activeTool=tool;g.player.swing=0;
  const render=()=>{const out=[];for(const b of v._avatar(g).filter(b=>b.part.startsWith('held')||b.part==='rightHand'))v._boxVertices(out,b);return out;};
  const rest=render();g.player.swing=.11;const attack=render();assert.notDeepEqual(attack,rest);
  const rig=v._avatar(g),hand=rig.find(b=>b.part==='rightHand');
  const grip=rig.find(b=>b.part==='heldHandle').transform;
  for(const b of rig.filter(b=>b.part.startsWith('held')))assert.equal(b.transform,grip,'tool pieces must share the wrist grip transform');
  const center=View.transformPoint({x:(hand.min.x+hand.max.x)/2,y:(hand.min.y+hand.max.y)/2,z:(hand.min.z+hand.max.z)/2},hand.transform);
  close(center.x,grip.x);close(center.y,grip.y);close(center.z,grip.z);
  snapshots.push(grip);g.player.swing=0;assert.deepEqual(render(),rest);
 }
 assert.notDeepEqual(snapshots[0],snapshots[1]);assert.notDeepEqual(snapshots[1],snapshots[2]);
 assert.ok(Math.abs(snapshots[2].twist)>.1,'sword must sweep across the body');
});

test('pick uses the resolved rendered camera and avatar never intercepts its ray',()=>{
 const v=view(),g=game();Object.assign(g.player,{x:16,y:16,pitch:0});v.updateCamera(g,0);
 v.camera={x:12,y:16,z:.8,angle:0,pitch:0};g.player.angle=Math.PI;
 g.entities=[{id:'rock',kind:'rock',x:19,y:16}];assert.equal(v.pick(g),'rock');
 g.entities=[];assert.equal(v.pick(g),null);
});
test('center pick resolves nearest actual cube and foliage occludes targets',()=>{
 const v=view(),g=game();g.entities=[{id:'far',kind:'rock',x:5,y:5},{id:'near',kind:'rock',x:4,y:5}];
 fixedCamera(v,g);assert.equal(v.pick(g),'near');g.player.pitch=.28;fixedCamera(v,g);g.entities=[{id:'tree',kind:'tree',x:4,y:5}];assert.equal(v.pick(g),null);
});
test('fixed primitive camera can target independently of player orbit',()=>{
 const v=view(),g=game();g.heightAt=()=>.75;g.player.angle=Math.PI/2;
 fixedCamera(v,g);g.entities=[{id:'rock',kind:'rock',x:2,y:7}];assert.equal(v.pick(g),'rock');
 v.camera.angle=-Math.PI/2;assert.equal(v.pick(g),null);
});
test('terrain blocks a ray aimed through a raised step',()=>{
 const v=view(),g=game();g.player.pitch=-.5;
 fixedCamera(v,g);
 g.drops=[{id:'hidden',kind:'letter',char:'A',x:4.5,y:5}];
 assert.equal(v.pick(g),'hidden');
 g.heightAt=x=>x>=3&&x<4?.75:0;
 assert.equal(v.pick(g),null);
});
test('a visible letter plaque is pickable but an intervening trunk hides it',()=>{
 const v=view(),g=game();g.player.pitch=Math.atan2(1.45-1.6,4.54);
 fixedCamera(v,g);
 g.entities=[{id:'rock',kind:'rock',char:'A',x:7,y:5}];
 assert.equal(v.pick(g),'rock');
 g.entities.push({id:'tree',kind:'tree',x:4,y:5});
 assert.equal(v.pick(g),'tree');
 const camera=v._camera(g),scene=v._scene(g,camera);
 assert.equal(v._visibleLabels(g,camera,scene,[...v._terrain(g),...scene.boxes]).some(p=>p.item.id==='rock'),false);
});
test('the first rock plaque stays above the footer with the starting camera',()=>{
 const v=view(),g=game();v.width=1440;v.height=900;g.player.pitch=-.32;
 g.entities=[{id:'first',kind:'rock',char:'A',x:3,y:5}];
 const c=v.updateCamera(g,0),scene=v._scene(g,c);
 const label=v._visibleLabels(g,c,scene,[...v._terrain(g),...scene.boxes]).find(p=>p.item.id==='first');
 assert.ok(label,'starting rock letter must be visible');
 assert.ok(label.y>90&&label.y<720,`plaque y=${label.y} overlaps HUD`);
});
test('a nearby drop plaque and its progress ring stay above the footer',()=>{
 const v=view(),g=game();v.width=1440;v.height=900;g.player.pitch=-.32;
 g.drops=[{id:'drop',kind:'letter',char:'A',x:3.5,y:5}];
 g.collecting={dropId:'drop',elapsed:1};
 const c=v.updateCamera(g,0),scene=v._scene(g,c);
 const label=v._visibleLabels(g,c,scene,[...v._terrain(g),...scene.boxes]).find(p=>p.item.id==='drop');
 assert.ok(label,'nearby drop letter must remain visible above HUD');
 assert.ok(label.y+label.size*.72<720,'the full collection ring must clear the HUD');
});
test('five species have distinct anatomy and feet follow explicit world terrain contacts',()=>{
 const v=view(),g=game();
 for(const [species,unique] of [['pig','nostril'],['cow','cowPatch'],['goat','beard'],['sheep','fleece'],['chicken','comb']]) {
  const count=species==='chicken'?2:4,e={id:44,kind:'animal',species,x:6,y:5,z:.3,angle:.7,feet:Array.from({length:count},(_,i)=>({x:6+(i%2)*.25,y:5+Math.floor(i/2)*.3,z:i*.1,planted:true}))};g.entities=[e];
  const boxes=v._scene(g,camera).boxes;assert.ok(boxes.some(b=>b.part===unique));assert.ok(boxes.every(b=>b.id===44));
  assert.equal(boxes.filter(b=>b.part.startsWith('animalFoot')).length,count);
  for(let i=0;i<count;i++) {
   const b=boxes.find(b=>b.part==='animalFoot'+i),bottom=View.transformPoint({x:0,y:0,z:0},b.transform);
   close(bottom.x,e.feet[i].x);close(bottom.y,e.feet[i].y);close(bottom.z,e.feet[i].z);
   const lower=boxes.find(b=>b.part==='animalLowerLeg'+i),end=View.transformPoint({x:0,y:0,z:lower.max.z},lower.transform);
   close(end.x,bottom.x);close(end.y,bottom.y);close(end.z,bottom.z+.055);
  }
  const rest=v._animal(g,e);v.time+=1;assert.deepEqual(v._animal(g,e),rest,'clock alone must not move animal geometry');
  e.moving=true;e.gait=.2;assert.notDeepEqual(v._animal(g,e),rest);
 }
});
test('rotated animal geometry uses exact local-space rays for targeting and occlusion',()=>{
 const v=view(),g=game(),e={id:44,kind:'animal',species:'cow',x:6,y:5,z:0,angle:Math.PI/4};g.entities=[e];
 const boxes=v._scene(g,camera).boxes,body=boxes.find(b=>b.part==='animalBody');
 const origin=View.transformPoint({x:-3,y:0,z:.7},body.transform),direction={x:Math.cos(e.angle),y:Math.sin(e.angle),z:0};
 const hit=v._nearest(origin,direction,boxes);assert.equal(hit.box.id,44);
 close(View.rayDescriptor(origin,direction,body),3-body.max.x);
 const miss=View.transformPoint({x:-3,y:body.max.y+.02,z:.7},body.transform);
 assert.equal(View.rayDescriptor(miss,direction,body),null);
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
