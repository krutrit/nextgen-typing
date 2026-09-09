/* Original pixel-textured voxel renderer. World axes: map X, map Y, height Z. */
class LettercraftView {
  static NEAR = 0.055;
  static FAR = 44;
  static FOV = Math.PI * 70 / 180;

  constructor(canvas, overlayCanvas) {
    if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('LettercraftView requires a canvas');
    this.canvas = canvas;
    this.overlay = overlayCanvas || null;
    this.ctx = this.overlay ? this.overlay.getContext('2d') : null;
    this.gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: true });
    if (!this.gl) throw new Error('Lettercraft needs WebGL. Please enable hardware acceleration or try another browser.');
    this.width = this.height = this.dpr = 1;
    this.camera = { x: 16, y: 16, z: 1.6, angle: 0, pitch: -.22 };
    this.time = 0;
    this.labels = [];
    this.particles = [];
    this.eventIds = new Set();
    this.disposed = false;
    try { this._initGL(); this.resize(); } catch (error) { this.dispose(); throw error; }
  }

  static cameraDirection(camera) {
    const cp = Math.cos(camera.pitch || 0);
    return { x: Math.cos(camera.angle || 0) * cp, y: Math.sin(camera.angle || 0) * cp, z: Math.sin(camera.pitch || 0) };
  }

  static projectPoint(point, camera, width, height) {
    const a = camera.angle || 0, p = camera.pitch || 0;
    const dx = point.x - camera.x, dy = point.y - camera.y, dz = point.z - camera.z;
    const horizontal = dx * Math.cos(a) + dy * Math.sin(a);
    const right = -dx * Math.sin(a) + dy * Math.cos(a);
    const up = dz * Math.cos(p) - horizontal * Math.sin(p);
    const depth = horizontal * Math.cos(p) + dz * Math.sin(p);
    const focal = height / (2 * Math.tan(LettercraftView.FOV / 2));
    const x = width / 2 + right * focal / (depth || 1e-9);
    const y = height / 2 - up * focal / (depth || 1e-9);
    return { x, y, depth, visible: depth >= LettercraftView.NEAR && depth <= LettercraftView.FAR && x >= 0 && x <= width && y >= 0 && y <= height };
  }

  static rayBox(origin, direction, min, max) {
    let near = 0, far = Infinity;
    for (const axis of ['x', 'y', 'z']) {
      if (Math.abs(direction[axis]) < 1e-10) {
        if (origin[axis] < min[axis] || origin[axis] > max[axis]) return null;
      } else {
        const a = (min[axis] - origin[axis]) / direction[axis], b = (max[axis] - origin[axis]) / direction[axis];
        near = Math.max(near, Math.min(a, b));
        far = Math.min(far, Math.max(a, b));
        if (near > far) return null;
      }
    }
    return far < 0 ? null : near;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, r.width || this.canvas.clientWidth || 1);
    this.height = Math.max(1, r.height || this.canvas.clientHeight || 1);
    this.dpr = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
    for (const canvas of [this.canvas, this.overlay]) if (canvas) {
      const w = Math.round(this.width * this.dpr), h = Math.round(this.height * this.dpr);
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
    }
    return { width: this.width, height: this.height };
  }

  project(x, y, z = 0) { return LettercraftView.projectPoint({ x, y, z }, this.camera, this.width, this.height); }
  _height(game, x, y) { return typeof game.heightAt === 'function' ? game.heightAt(x, y) : 0; }
  _camera(game) {
    const p = game.player;
    return { x: p.x, y: p.y, z: this._height(game, p.x, p.y) + 1.6, angle: p.angle || 0, pitch: p.pitch || 0 };
  }

  // These descriptors are the shared source of truth for visible cubes and ray occlusion.
  _scene(game, camera) {
    const boxes = [], labels = [];
    const cube = (x, y, z, w, d, h, material, id = null, tint = null) => {
      boxes.push({ min: { x: x-w/2, y: y-d/2, z }, max: { x: x+w/2, y: y+d/2, z: z+h }, material, id, tint });
    };
    for (const e of [...(game.entities || []), ...(game.enemies || []).map(e => ({ ...e, kind: 'enemy' }))]) {
      if (Math.hypot(e.x-camera.x, e.y-camera.y) > 28) continue;
      const z = this._height(game, e.x, e.y), x = e.x, y = e.y;
      let labelZ = z + 1.1;
      if (e.kind === 'tree') {
        cube(x,y,z,.8,.8,1.7,4,e.id);
        cube(x,y,z+1.65,1.65,1.65,.8,5);
        cube(x-.12,y+.08,z+2.45,1.24,1.25,.55,5,null,[1.08,1.09,.95]);
        labelZ=z+1.18;
      } else if (e.kind === 'rock') {
        cube(x,y,z,.8,.8,.82,3,e.id);
        cube(x-.06,y+.03,z+.82,.63,.65,.2,3,e.id);
        cube(x-.405,y-.14,z+.36,.025,.16,.13,8,e.id);
        cube(x+.1,y-.405,z+.58,.18,.025,.15,8,e.id);
        labelZ=z+1.45;
      } else if (e.kind === 'animal') {
        for (const dx of [-.24,.24]) for (const dy of [-.24,.24]) cube(x+dx,y+dy,z,.16,.16,.4,4,e.id,[.6,.57,.6]);
        cube(x,y,z+.35,.8,.8,.57,6,e.id);
        cube(x+.22,y,z+.83,.44,.48,.4,9,e.id);
        cube(x+.451,y-.13,z+1.07,.024,.12,.1,7,e.id);
        cube(x+.465,y-.13,z+1.08,.026,.045,.065,10,e.id);
        cube(x+.451,y+.13,z+1.07,.024,.12,.1,7,e.id);
        cube(x+.465,y+.13,z+1.08,.026,.045,.065,10,e.id);
        labelZ=z+1.43;
      } else {
        for (const dy of [-.23,.23]) cube(x,y+dy,z,.38,.24,.35,5,e.id,[.65,.85,.8]);
        cube(x,y,z+.3,.55,.68,.76,5,e.id);
        cube(x,y,z+1.06,.74,.74,.53,5,e.id,[1.15,1,.82]);
        for (const dy of [-.2,.2]) cube(x-.378,y+dy,z+1.34,.02,.15,.13,10,e.id);
        cube(x-.38,y,z+1.13,.024,.28,.08,10,e.id);
        labelZ=z+1.83;
      }
      if (e.char) labels.push({ item:e, x, y, z:labelZ, drop:false });
    }
    for (const e of game.drops || []) {
      if (Math.hypot(e.x-camera.x,e.y-camera.y)>20) continue;
      const z=this._height(game,e.x,e.y)+.28+Math.sin(this.time*2.8+e.x)*.045;
      cube(e.x,e.y,z,.27,.27,.27,e.kind==='tool'?11:8,e.id);
      labels.push({item:e,x:e.x,y:e.y,z:z+.4,drop:true});
    }
    return {boxes,labels};
  }

  _terrain(game) {
    // Height function identity changes on retry; terrain is static during a game.
    if (this.terrainGame === game && this.terrainHeight === game.heightAt && this.terrainSize === game.size) return this.terrain;
    const size=game.size||32, boxes=[];
    for(let x=0;x<size;x++)for(let y=0;y<size;y++) {
      const h=this._height(game,x+.5,y+.5);
      boxes.push({min:{x,y,z:-1},max:{x:x+1,y:y+1,z:h},material:(Math.abs(x+.5-size/2)<1.05||Math.abs(y+.5-size/2)<1.05)?2:0,id:null,ground:true});
    }
    // The curb lies outside the walkable map; the existing map bound supplies its collision.
    for(let i=0;i<size;i++) {
      const rim=(x,y,w,d,h)=>boxes.push({min:{x,y,z:-1},max:{x:x+w,y:y+d,z:h+.14},material:3,id:null});
      rim(i,-.12,1,.12,this._height(game,i+.5,.5));
      rim(i,size,1,.12,this._height(game,i+.5,size-.5));
      rim(-.12,i,.12,1,this._height(game,.5,i+.5));
      rim(size,i,.12,1,this._height(game,size-.5,i+.5));
    }
    this.terrainGame=game;this.terrainHeight=game.heightAt;this.terrainSize=game.size;this.terrain=boxes;
    this.terrainVertices=null;
    return boxes;
  }

  _nearest(origin, direction, boxes, limit = 44) {
    let distance=limit, box=null;
    for(const b of boxes) {
      const hit=LettercraftView.rayBox(origin,direction,b.min,b.max);
      if(hit!==null && hit<distance) {distance=hit;box=b;}
    }
    return {distance,box};
  }

  _visibleLabels(game, camera, scene, boxes) {
    const output=[];
    for(const label of scene.labels) {
      const distance=Math.hypot(label.x-camera.x,label.y-camera.y);
      if(distance>13.5||distance<.2) continue;
      // Plaques sit in front of their owners, never ignore unrelated occluders.
      const radius=label.drop?.22:.46;
      const point={x:label.x+(camera.x-label.x)/distance*radius,y:label.y+(camera.y-label.y)/distance*radius,z:label.z};
      const p=LettercraftView.projectPoint(point,camera,this.width,this.height);
      const size=Math.max(22,Math.min(53,140/p.depth));
      // Close drops sit below eye level. Pin their plaque above the controls while
      // retaining the world anchor for the occlusion ray and target distance.
      if(label.drop&&distance<2.2&&p.depth>=LettercraftView.NEAR&&p.x>=0&&p.x<=this.width) {
        const footerSafeY=Math.max(this.height*.5,this.height-190-size*.75);
        p.y=Math.min(p.y,footerSafeY);
        p.visible=p.y>=0&&p.y<=this.height;
      }
      if(!p.visible) continue;
      const dx=point.x-camera.x,dy=point.y-camera.y,dz=point.z-camera.z,length=Math.hypot(dx,dy,dz);
      const hit=this._nearest(camera,{x:dx/length,y:dy/length,z:dz/length},boxes,length-.025);
      if(hit.box) continue;
      output.push({...label,...p,point,distance:length,size,alpha:Math.min(1,(13.5-distance)/3.5)});
    }
    return output.sort((a,b)=>b.depth-a.depth);
  }

  pick(game) {
    if(!game || !game.player) return null;
    const camera=this._camera(game), scene=this._scene(game,camera), boxes=[...this._terrain(game),...scene.boxes];
    const hit=this._nearest(camera,LettercraftView.cameraDirection(camera),boxes,20);
    let id=hit.box?hit.box.id:null,nearest=hit.distance;
    for(const label of this._visibleLabels(game,camera,scene,boxes)) {
      if(Math.abs(label.x-this.width/2)<=label.size*.5 && Math.abs(label.y-this.height/2)<=label.size*.5 && label.distance<nearest) {
        id=label.item.id;nearest=label.distance;
      }
    }
    return id;
  }

  _initGL() {
    const gl=this.gl;
    const compile=(type,source)=>{
      const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw new Error('Voxel shader: '+message);}
      return shader;
    };
    const vertex=compile(gl.VERTEX_SHADER,`
      attribute vec3 aPosition; attribute vec2 aUV; attribute vec3 aColor;
      uniform vec3 uEye; uniform vec3 uRight; uniform vec3 uUp; uniform vec3 uForward;
      uniform vec2 uScale; varying vec2 vUV; varying vec3 vColor; varying float vDepth;
      void main(){vec3 d=aPosition-uEye; float z=dot(d,uForward);
        gl_Position=vec4(dot(d,uRight)*uScale.x,dot(d,uUp)*uScale.y,1.002503*z-.110138,z);
        vUV=aUV;vColor=aColor;vDepth=z;}`);
    let fragment;
    try { fragment=compile(gl.FRAGMENT_SHADER,`
      precision mediump float; uniform sampler2D uAtlas;
      varying vec2 vUV; varying vec3 vColor; varying float vDepth;
      void main(){vec3 c=texture2D(uAtlas,vUV).rgb*vColor;
        float fog=smoothstep(12.0,38.0,vDepth);
        gl_FragColor=vec4(mix(c,vec3(.66,.83,.87),fog),1.0);}`);
    } catch(error) {gl.deleteShader(vertex);throw error;}
    this.program=gl.createProgram();gl.attachShader(this.program,vertex);gl.attachShader(this.program,fragment);gl.linkProgram(this.program);
    gl.deleteShader(vertex);gl.deleteShader(fragment);
    if(!gl.getProgramParameter(this.program,gl.LINK_STATUS)) throw new Error('Voxel program: '+gl.getProgramInfoLog(this.program));
    this.buffer=gl.createBuffer();
    this.attributes={};
    for(const name of ['aPosition','aUV','aColor'])this.attributes[name]=gl.getAttribLocation(this.program,name);
    this.uniforms={};
    for(const name of ['uEye','uRight','uUp','uForward','uScale','uAtlas'])this.uniforms[name]=gl.getUniformLocation(this.program,name);
    this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);
    const pixels=this._atlas();
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,256,16,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  }

  _atlas() {
    const colors=[[93,153,63],[133,91,55],[193,166,105],[128,139,140],[117,78,44],[66,128,53],[230,226,201],[246,245,221],[233,185,65],[114,104,92],[31,39,32],[68,184,188],[171,127,79],[255,255,255],[110,168,77],[210,177,127]];
    const data=new Uint8Array(256*16*4);
    for(let tile=0;tile<16;tile++)for(let y=0;y<16;y++)for(let x=0;x<16;x++) {
      let c=colors[tile], n=((x*37+y*53+tile*91+(x*y*13))%29)-14;
      if(tile===1 && y>11+((x*7)%3)) c=colors[0];
      if(tile===4)n=(x%5===0?-30:x%5===1?17:n*.45);
      if(tile===5)n=((x*3+y*5)%7<2?-24:n);
      if(tile===3 && ((x+2*y)%13===0))n=-28;
      if(tile===6)n=((x%4===0||y%4===0)?-13:n*.35);
      if(tile===8)n=((x+y)%7<2?25:n);
      if(tile===7||tile===10||tile===13)n=0;
      const i=(y*256+tile*16+x)*4;
      data[i]=Math.max(0,Math.min(255,c[0]+n));data[i+1]=Math.max(0,Math.min(255,c[1]+n));data[i+2]=Math.max(0,Math.min(255,c[2]+n));data[i+3]=255;
    }
    return data;
  }

  _boxVertices(out,b,highlight=false,faces=null) {
    const {min:a,max:c}=b;
    const corners=[[a.x,a.y,a.z],[c.x,a.y,a.z],[c.x,c.y,a.z],[a.x,c.y,a.z],[a.x,a.y,c.z],[c.x,a.y,c.z],[c.x,c.y,c.z],[a.x,c.y,c.z]];
    const quads=[[4,5,6,7],[0,3,2,1],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];
    const shades=[1,.5,.77,.9,.83,.65];
    for(let face=0;face<6;face++) {
      if(faces && !faces.includes(face))continue;
      const material=b.ground&&face!==0?1:b.material;
      const u0=(material*16+.5)/256,u1=(material*16+15.5)/256;
      const uv=[[u0,.03125],[u1,.03125],[u1,.96875],[u0,.96875]];
      const shade=shades[face],tint=b.tint||[1,1,1];
      for(const k of [0,1,2,0,2,3])out.push(...corners[quads[face][k]],...uv[k],
        shade*tint[0]*(highlight?1.2:1),shade*tint[1]*(highlight?1.12:1),shade*tint[2]*(highlight?.72:1));
    }
  }

  _groundVertices(game,terrain) {
    if(this.terrainVertices)return this.terrainVertices;
    const out=[],size=game.size||32;
    for(const b of terrain) {
      if(!b.ground) {this._boxVertices(out,b);continue;}
      const x=b.min.x,y=b.min.y,h=b.max.z,faces=[0];
      if(y===0||this._height(game,x+.5,y-.5)<h)faces.push(2);
      if(x===size-1||this._height(game,x+1.5,y+.5)<h)faces.push(3);
      if(y===size-1||this._height(game,x+.5,y+1.5)<h)faces.push(4);
      if(x===0||this._height(game,x-.5,y+.5)<h)faces.push(5);
      this._boxVertices(out,b,false,faces);
    }
    this.terrainVertices=out;
    return out;
  }

  _surfaceDetails(game,boxes,hoverId) {
    const primary=new Map(),details=[];
    const volume=b=>(b.max.x-b.min.x)*(b.max.y-b.min.y)*(b.max.z-b.min.z);
    for(const box of boxes) if(box.id!=null&&(!primary.has(box.id)||volume(box)>volume(primary.get(box.id))))primary.set(box.id,box);
    const items=new Map([...(game.entities||[]),...(game.enemies||[])].map(e=>[e.id,e]));
    // Thin cuboids share the depth-tested batch; a small outward offset avoids
    // z-fighting. Decorative details never become ray or collision bodies.
    const segment=(from,to,width,material,detail)=>{
      const min={},max={};
      for(const axis of ['x','y','z']) {min[axis]=Math.min(from[axis],to[axis])-width;max[axis]=Math.max(from[axis],to[axis])+width;}
      details.push({min,max,material,detail,id:null});
    };
    for(const [id,box] of primary) {
      const a=box.min,b=box.max,item=items.get(id);
      if(id===hoverId) {
        const lo={x:a.x-.01,y:a.y-.01,z:a.z-.01},hi={x:b.x+.01,y:b.y+.01,z:b.z+.01};
        for(const axis of ['x','y','z']) {
          const others=['x','y','z'].filter(key=>key!==axis);
          for(const first of [lo[others[0]],hi[others[0]]])for(const second of [lo[others[1]],hi[others[1]]]) {
            const p={...lo,[others[0]]:first,[others[1]]:second},q={...p,[axis]:hi[axis]};
            segment(p,q,.009,8,'frame');
          }
        }
      }
      if(!item||!Number.isFinite(item.hp)||!Number.isFinite(item.maxHp)||item.maxHp<=0||item.hp>=item.maxHp)continue;
      const severity=1-Math.max(0,item.hp/item.maxHp);
      const paths=[[[.26,.12],[.44,.12],[.44,.36],[.62,.36],[.62,.6],[.78,.6],[.78,.84]],
        [[.44,.36],[.22,.36],[.22,.58],[.1,.58]],
        [[.62,.6],[.4,.6],[.4,.81],[.23,.81]]];
      if(severity>.5)paths.push([[.62,.36],[.8,.36],[.8,.19],[.9,.19]],[[.4,.81],[.4,.95]]);
      for(const [normal,u,v,side] of [['x','y','z',-1],['x','y','z',1],['y','x','z',-1],['y','x','z',1],['z','x','y',1]]) {
        const point=([pu,pv])=>({[normal]:(side<0?a[normal]:b[normal])+side*.006,[u]:a[u]+pu*(b[u]-a[u]),[v]:a[v]+pv*(b[v]-a[v])});
        for(const path of paths)for(let i=1;i<path.length;i++)segment(point(path[i-1]),point(path[i]),.005+severity*.006,10,'crack');
      }
    }
    return details;
  }

  render(game,dt,hoverId=null) {
    if(this.disposed||!game||!game.player)return;
    const gl=this.gl; if(gl.isContextLost())return;
    dt=Math.max(0,Math.min(.08,Number(dt)||0));this.time+=dt;this.camera=this._camera(game);
    const scene=this._scene(game,this.camera),terrain=this._terrain(game),boxes=[...terrain,...scene.boxes];
    const vertices=this._groundVertices(game,terrain).slice();
    for(const box of scene.boxes)this._boxVertices(vertices,box,hoverId!=null&&box.id===hoverId);
    for(const detail of this._surfaceDetails(game,scene.boxes,hoverId))this._boxVertices(vertices,detail);
    // Distant block clouds are geometry, so looking up remains a true perspective view.
    for(let i=0;i<10;i++) {
      const x=3+(i*17)%36,y=2+(i*11)%35;
      this._boxVertices(vertices,{min:{x,y,z:8+(i%3)},max:{x:x+3.8,y:y+2.2,z:8.55+(i%3)},material:13});
      this._boxVertices(vertices,{min:{x:x+.8,y:y-.6,z:8.1+(i%3)},max:{x:x+2.8,y:y+2.8,z:8.7+(i%3)},material:13});
    }
    gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(.66,.83,.87,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);
    const stride=8*4;
    for(const [name,count,offset] of [['aPosition',3,0],['aUV',2,12],['aColor',3,20]]) {
      const location=this.attributes[name];gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,count,gl.FLOAT,false,stride,offset);
    }
    const c=this.camera,a=c.angle,p=c.pitch,u=this.uniforms,forward=LettercraftView.cameraDirection(c);
    gl.uniform3f(u.uEye,c.x,c.y,c.z);gl.uniform3f(u.uRight,-Math.sin(a),Math.cos(a),0);
    gl.uniform3f(u.uUp,-Math.cos(a)*Math.sin(p),-Math.sin(a)*Math.sin(p),Math.cos(p));
    gl.uniform3f(u.uForward,forward.x,forward.y,forward.z);
    const f=1/Math.tan(LettercraftView.FOV/2);gl.uniform2f(u.uScale,f*this.height/this.width,f);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.uniform1i(u.uAtlas,0);
    gl.drawArrays(gl.TRIANGLES,0,vertices.length/8);
    this.labels=this._visibleLabels(game,c,scene,boxes);
    this._overlay(game,dt,hoverId,boxes);
  }

  _displayChar(char) {const text=String(char==null?'?':char);return /^\p{Mark}/u.test(text)?'◌'+text:text;}

  _overlay(game,dt,hoverId,boxes) {
    const ctx=this.ctx;if(!ctx)return;
    ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.clearRect(0,0,this.width,this.height);
    ctx.imageSmoothingEnabled=false;ctx.textAlign='center';ctx.textBaseline='middle';
    for(const p of this.labels) {
      const selected=p.item.id===hoverId, s=p.size, complete=p.item.char&&typeof game.needs==='function'&&!game.needs(p.item.char);
      ctx.globalAlpha=p.alpha*(complete?.7:1);
      ctx.fillStyle='rgba(17,38,39,.90)';ctx.fillRect(p.x-s/2-3,p.y-s/2-3,s+6,s+6);
      ctx.strokeStyle=selected?'#ffe282':p.drop?'#ffe282':'#e8e4bd';ctx.lineWidth=selected?3:1.5;
      ctx.strokeRect(p.x-s/2,p.y-s/2,s,s);
      ctx.fillStyle=complete?'#c3d4b0':'#fff9df';
      ctx.font='700 '+Math.round(s*.65)+'px "Noto Sans Thai",Tahoma,sans-serif';
      ctx.fillText(p.item.kind==='tool'?({axe:'🪓',pickaxe:'⛏',sword:'⚔'}[p.item.tool]||'⚒'):this._displayChar(p.item.char),p.x,p.y+1);
      if(complete) {ctx.font='700 11px Tahoma,sans-serif';ctx.fillStyle='#163b2b';ctx.fillRect(p.x-26,p.y+s/2+5,52,17);ctx.fillStyle='#dcecc1';ctx.fillText('ครบแล้ว',p.x,p.y+s/2+14);}
      if(Number.isFinite(p.item.hp)&&p.item.hp<p.item.maxHp) {
        ctx.fillStyle='#203133';ctx.fillRect(p.x-s/2,p.y-s/2-11,s,5);
        ctx.fillStyle='#f6cb6a';ctx.fillRect(p.x-s/2,p.y-s/2-11,s*Math.max(0,p.item.hp/p.item.maxHp),5);
      }
    }
    ctx.globalAlpha=1;
    this._particles(game,dt,boxes);
    this._hand(ctx,game);
    const x=this.width/2,y=this.height/2;
    ctx.strokeStyle='rgba(18,36,35,.7)';ctx.lineWidth=4;
    for(const color of ['rgba(18,36,35,.7)',hoverId!=null?'#ffe481':'#fffced']) {
      ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(x-9,y);ctx.lineTo(x-3,y);ctx.moveTo(x+3,y);ctx.lineTo(x+9,y);
      ctx.moveTo(x,y-9);ctx.lineTo(x,y-3);ctx.moveTo(x,y+3);ctx.lineTo(x,y+9);ctx.stroke();ctx.lineWidth=2;
    }
    ctx.fillStyle='#fffced';ctx.fillRect(x-1,y-1,2,2);
    // Collection keeps progressing when a drop passes beneath the player's feet.
    // Its HUD ring stays around the crosshair even if the world plaque leaves view.
    if(game.collecting) {
      ctx.lineWidth=4;ctx.strokeStyle='rgba(18,36,35,.7)';
      ctx.beginPath();ctx.arc(x,y,24,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle='#ffe481';ctx.beginPath();
      ctx.arc(x,y,24,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.min(1,game.collecting.elapsed/3));ctx.stroke();
    }
    if(game.invulnerable>0) {ctx.strokeStyle='rgba(193,65,43,'+Math.min(.5,game.invulnerable*.35)+')';ctx.lineWidth=18;ctx.strokeRect(0,0,this.width,this.height);}
  }

  _hand(ctx,game) {
    const scale=Math.max(.6,Math.min(1.2,this.height/650)),swing=Math.sin(Math.min(1,(game.player.swing||0)/.24)*Math.PI);
    const x=this.width*.76-swing*37*scale,y=this.height-Math.min(136,this.height*.22)+swing*24*scale;
    ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.rotate(-.33-swing*.5);
    ctx.fillStyle='#534831';ctx.fillRect(-31,14,73,126);ctx.fillStyle='#718565';ctx.fillRect(-26,18,62,116);
    ctx.fillStyle='#b87d51';ctx.fillRect(-27,-19,61,58);ctx.fillStyle='#e2ae77';ctx.fillRect(-23,-23,51,46);
    ctx.fillStyle='#f0bd88';ctx.fillRect(-23,-23,12,40);
    const tool=game.activeTool||'pickaxe',level=Number((game.tools||{})[tool])||0;
    const metal=level>=2?'#87e1d6':level===1?'#d5e0d6':'#b7aaa0',edge=level>=2?'#3f8f87':'#64716d';
    ctx.fillStyle='#4f3528';ctx.fillRect(-4,-151,17,151);ctx.fillStyle='#ac7544';ctx.fillRect(0,-145,8,141);
    ctx.fillStyle=edge;
    if(tool==='sword') {
      ctx.fillRect(-9,-207,28,139);ctx.fillRect(-23,-83,56,12);ctx.fillStyle=metal;ctx.fillRect(-4,-198,18,112);ctx.fillStyle='#f1f1cc';ctx.fillRect(-3,-191,5,100);
    } else if(tool==='axe') {
      ctx.fillRect(-48,-164,65,62);ctx.fillRect(-58,-154,15,42);ctx.fillStyle=metal;ctx.fillRect(-45,-158,52,48);ctx.fillStyle='#e5e7c9';ctx.fillRect(-52,-150,9,33);
    } else {
      ctx.fillRect(-54,-161,111,22);ctx.fillRect(-67,-151,24,32);ctx.fillRect(48,-151,21,39);ctx.fillStyle=metal;ctx.fillRect(-51,-157,103,13);ctx.fillRect(-62,-149,16,20);ctx.fillRect(52,-147,12,27);
    }
    ctx.restore();
  }

  _particles(game,dt,boxes) {
    const ctx=this.ctx;
    for(const event of game.events||[]) {
      if(event.id!=null&&this.eventIds.has(event.id))continue;
      if(event.id!=null)this.eventIds.add(event.id);
      const x=Number.isFinite(event.x)?event.x:game.player.x,y=Number.isFinite(event.y)?event.y:game.player.y;
      for(let i=0;i<8;i++)this.particles.push({x,y,z:this._height(game,x,y)+.7,vx:Math.sin(i*8)*1.2,vy:Math.cos(i*8)*1.2,vz:.8+(i%3)*.25,age:0,color:event.kind==='hurt'?'#e36e51':event.kind==='break'?'#9cd669':'#ffdb79'});
    }
    if(this.eventIds.size>400)this.eventIds=new Set([...this.eventIds].slice(-200));
    this.particles=this.particles.filter(p=>p.age<.65).slice(-96);
    for(const p of this.particles) {
      p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vz-=2.4*dt;
      const q=this.project(p.x,p.y,p.z);if(!q.visible)continue;
      const c=this.camera,d={x:p.x-c.x,y:p.y-c.y,z:p.z-c.z},l=Math.hypot(d.x,d.y,d.z);
      if(this._nearest(c,{x:d.x/l,y:d.y/l,z:d.z/l},boxes,l-.05).box)continue;
      const size=Math.min(8,18/q.depth);ctx.globalAlpha=Math.max(0,1-p.age/.65);ctx.fillStyle=p.color;ctx.fillRect(q.x-size/2,q.y-size/2,size,size);
    }
    ctx.globalAlpha=1;
  }

  dispose() {
    if(this.disposed)return;
    const gl=this.gl;
    if(gl) {if(this.buffer)gl.deleteBuffer(this.buffer);if(this.texture)gl.deleteTexture(this.texture);if(this.program)gl.deleteProgram(this.program);}
    this.buffer=this.texture=this.program=null;this.terrainVertices=null;this.terrainGame=null;
    this.labels=[];this.particles=[];this.disposed=true;
  }
}
if(typeof window!=='undefined')window.LettercraftView=LettercraftView;
if(typeof module!=='undefined'&&module.exports)module.exports=LettercraftView;
