/* Lettercraft simulation: no browser dependencies. Time is seconds; positions are map tiles. */
class LettercraftGame {
    static animals = {
        pig: {radius:.48,height:.95,stanceX:.28,stanceY:.21,legHeight:.28,bodyLength:.72,bodyWidth:.5,bodyHeight:.4,speed:2.3},
        cow: {radius:.56,height:1.3,stanceX:.34,stanceY:.25,legHeight:.48,bodyLength:.88,bodyWidth:.58,bodyHeight:.5,speed:2},
        goat: {radius:.48,height:1.22,stanceX:.28,stanceY:.20,legHeight:.44,bodyLength:.70,bodyWidth:.44,bodyHeight:.4,speed:2.7},
        sheep: {radius:.50,height:1.08,stanceX:.28,stanceY:.23,legHeight:.32,bodyLength:.78,bodyWidth:.6,bodyHeight:.48,speed:2.2},
        chicken: {radius:.30,height:.78,stanceX:0,stanceY:.13,legHeight:.24,bodyLength:.40,bodyWidth:.34,bodyHeight:.31,speed:3}
    };
    constructor(text, rng = Math.random) {
        this.rng = rng; this.size = 32; this.id = 1;
        // angle/pitch describe orbit orientation; facing belongs to the body.
        this.player = { x: 16.5, y: 16.5, angle: 0, pitch: -0.32, facing: 0, moving: false, running: false, swing: 0 };
        this.cameraDistance = 4.4;
        Object.assign(this.player, { z: this.heightAt(16.5,16.5), vz: 0, grounded: true, landing: 0, swingDuration: .22 });
        this.elapsed = 0;
        this.status = 'ready'; this.reason = ''; this.goal = 0; this.collected = 0;
        this.goals = Object.create(null); this.inventory = Object.create(null);
        this.entities = []; this.enemies = []; this.drops = []; this.events = [];
        this.tools = { pickaxe: 0, axe: 0, sword: 0 }; this.firstPickaxe = false;
        this.keys = new Map(); this.blocked = new Set(); this.collecting = null;
        this.cooldown = 0;
        this.message = ''; this.messageTime = 0; this.warned = false;
        const chars = [...new Set(Array.from(String(text)).filter(c => c.length === 1 && /[\p{L}\p{N}\p{M}\p{P}\p{S}]/u.test(c)))];
        for (let i = chars.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [chars[i], chars[j]] = [chars[j], chars[i]]; }
        if (!chars.length) { this.status = 'invalid'; return; }
        this.goal = 20;
        const quest = Array.from({ length: this.goal }, (_, i) => chars[i % chars.length]);
        quest.forEach(c => { this.goals[c] = (this.goals[c] || 0) + 1; this.inventory[c] = 0; });
        const sites = [];
        for (let x = 3; x < 31; x += 4) for (let y = 3; y < 31; y += 4) {
            if (Math.hypot(x + 0.5 - 16.5, y + 0.5 - 16.5) > 3) sites.push({ x: x + 0.5, y: y + 0.5 });
        }
        for (let i = sites.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [sites[i], sites[j]] = [sites[j], sites[i]]; }
        sites.unshift({ x: 17.5, y: 16.5 });
        sites.forEach((p, i) => {
            const kind = ['rock', 'tree', 'animal'][i % 3], hp = kind === 'animal' ? 3 : 4;
            this.entities.push({ id: this.id++, kind, char: quest[i % quest.length], ...p, homeX: p.x, homeY: p.y, hp, maxHp: hp, stun: 0, wander: rng() * 6.28 });
            if(kind==='animal') {
                const e=this.entities[this.entities.length-1];
                Object.assign(e,{species:Object.keys(LettercraftGame.animals)[Math.floor(i/3)%5],angle:rng()*Math.PI*2,z:this.heightAt(e.x,e.y),vz:0,grounded:true,gait:0,state:'idle',moving:false,wait:rng()*2});
                this.animalFeet(e,0);
            }
        });
    }
    get remaining() { return Math.max(0, 300 - this.elapsed); }
    start() { if (this.status === 'ready') this.status = 'playing'; }
    event(kind, source, extra = {}) {
        this.events.push({ id: this.id++, kind, x: source.x, y: source.y, ...extra });
        if (this.events.length > 80) this.events.shift();
    }
    say(message) { this.message = message; this.messageTime = 2.5; }
    needs(char) { return (this.inventory[char] || 0) < (this.goals[char] || 0); }
    selectedDrop() {
        if (!this.player.grounded) return null;
        if (this.collecting) return this.drops.find(d => d.id === this.collecting.dropId) || null;
        let best = null, distance = 1.35;
        for (const d of this.drops) {
            const dist = Math.hypot(d.x - this.player.x, d.y - this.player.y);
            if (d.kind === 'letter' && this.needs(d.char) && dist < distance && Math.abs(this.player.z-this.heightAt(d.x,d.y)) < .65) { best = d; distance = dist; }
        }
        return best;
    }
    direction() {
        const down = codes => codes.some(c => this.keys.has(c) && !this.blocked.has(c));
        const sx = Number(down(['KeyD', 'ArrowRight'])) - Number(down(['KeyA', 'ArrowLeft']));
        const sy = Number(down(['KeyS', 'ArrowDown'])) - Number(down(['KeyW', 'ArrowUp']));
        // Yaw-relative walking; looking up/down never changes ground speed.
        const c = Math.cos(this.player.angle), s = Math.sin(this.player.angle);
        let x = -sy * c - sx * s, y = -sy * s + sx * c;
        const len = Math.hypot(x, y); if (len) { x /= len; y /= len; }
        return { x, y, moving: Boolean(len) };
    }
    keyDown(code, key, rawKey = key) {
        if (this.status !== 'playing' || this.keys.has(code)) return;
        if (code === 'Space') {
            this.keys.set(code, { key, rawKey, printable: false }); this.cancelCollection();
            if (this.player.grounded) { this.player.vz=5.8;this.player.grounded=false;this.event('jump',this.player); }
            return;
        }
        const wasMoving = this.direction().moving;
        const printable = key.length === 1 || rawKey.length === 1;
        const otherChar = [...this.keys.values()].some(k => k.printable);
        if (this.collecting && (printable || code.startsWith('Arrow') || code.startsWith('Shift') || code === 'CapsLock')) this.cancelCollection();
        this.keys.set(code, { key, rawKey, printable });
        const d = this.selectedDrop();
        if (printable && !otherChar && !wasMoving && d && (key === d.char || rawKey === d.char)) {
            this.collecting = { dropId: d.id, elapsed: 0, code };
            this.blocked.add(code);
        }
    }
    keyUp(code) {
        if (this.collecting && (this.collecting.code === code || (code.startsWith('Shift') && this.keys.has(code)))) this.cancelCollection();
        this.keys.delete(code); this.blocked.delete(code);
    }
    cancelCollection() { this.collecting = null; }
    clearInput() { this.cancelCollection(); this.keys.clear(); this.blocked.clear(); this.player.moving = false; this.player.running = false; }
    zoom(delta) {
        if (Number.isFinite(delta)) this.cameraDistance = Math.max(2.2, Math.min(7, this.cameraDistance + delta * 0.004));
    }
    look(dx, dy) {
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
        this.player.angle = (this.player.angle + dx * 0.0025) % (Math.PI * 2);
        this.player.pitch = Math.max(-1.25, Math.min(1.25, this.player.pitch - dy * 0.0025));
    }
    heightAt(x, y) {
        // Quarter-block terraces auto-step underfoot, with a level spawn clearing.
        const tx = Math.floor(x), ty = Math.floor(y);
        const hill = (cx, cy) => Math.max(0, Math.min(3, Math.floor((12 - Math.abs(tx-cx) - Math.abs(ty-cy)) / 4)));
        return Math.max(hill(6, 7), hill(25, 24)) * 0.25;
    }
    aim(x, y) {
        const dx = x - this.player.x, dy = y - this.player.y;
        if (Number.isFinite(dx) && Number.isFinite(dy) && Math.hypot(dx, dy) > 0.08) this.player.angle = Math.atan2(dy, dx);
    }
    isFree(x, y, radius = 0.27, ignoreId = null) {
        const edge=Math.max(.5,radius);
        if (x < edge || y < edge || x > this.size - edge || y > this.size - edge) return false;
        return !this.entities.some(e => e.id !== ignoreId && Math.abs(x - e.x) < radius + (e.kind==='animal'?this.animalProfile(e).radius:.4) && Math.abs(y - e.y) < radius + (e.kind==='animal'?this.animalProfile(e).radius:.4));
    }
    move(body, dx, dy, radius = 0.27) {
        // Small substeps prevent tunnelling during knockback and slow frames.
        const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.15));
        for (let i = 0; i < steps; i++) {
            const free=(x,y)=>body===this.player?this.playerCanMove(x,y,radius):this.isFree(x,y,radius,body.id)&&this.heightAt(x,y)-this.heightAt(body.x,body.y)<=.26;
            if (free(body.x + dx / steps, body.y)) body.x += dx / steps;
            if (free(body.x, body.y + dy / steps)) body.y += dy / steps;
        }
    }
    collisionBoxes() {
        const boxes=[];
        for (const e of this.entities) {
            const z=e.kind==='animal'&&Number.isFinite(e.z)?e.z:this.heightAt(e.x,e.y), box=(r,bottom,top)=>boxes.push({id:e.id,x:e.x,y:e.y,r,bottom:z+bottom,top:z+top});
            if(e.kind==='tree') {box(.4,0,1.7);box(.825,1.65,2.45);box(.64,2.45,3);}
            else if(e.kind==='animal'){const p=this.animalProfile(e);box(p.radius,0,p.height);}
            else box(.4,0,1.02);
        }
        return boxes;
    }
    playerCanMove(x,y,radius=.27) {
        if(x<.5||y<.5||x>this.size-.5||y>this.size-.5)return false;
        const p=this.player,ground=this.heightAt(x,y);
        // Existing quarter steps auto-step; taller faces require an actual jump.
        const feet=p.grounded&&ground-p.z<=.26?Math.max(p.z,ground):p.z;
        if(ground>feet+.001)return false;
        for(const b of this.collisionBoxes()) if(Math.abs(x-b.x)<radius+b.r&&Math.abs(y-b.y)<radius+b.r&&feet<b.top-.001&&feet+1.6>b.bottom+.001)return false;
        if(feet>p.z)p.z=feet;
        return true;
    }
    verticalStep(dt) {
        const p=this.player,old=p.z,ground=this.heightAt(p.x,p.y),boxes=this.collisionBoxes().filter(b=>Math.abs(p.x-b.x)<.27+b.r&&Math.abs(p.y-b.y)<.27+b.r);
        let support=ground;
        for(const b of boxes)if(b.top<=old+.001)support=Math.max(support,b.top);
        p.landing=Math.max(0,p.landing-dt);
        if(p.grounded&&Math.abs(old-support)<.001){p.z=support;p.vz=0;return;}
        p.grounded=false;p.vz-=15*dt;let next=old+p.vz*dt;
        if(p.vz>0) {
            for(const b of boxes)if(old+1.6<=b.bottom+.001&&next+1.6>=b.bottom){next=Math.min(next,b.bottom-1.6);p.vz=0;}
        } else if(next<=support) {
            next=support;p.vz=0;p.grounded=true;p.landing=.18;this.event('land',p);
        }
        p.z=next;
    }
    lineClear(a, b, ignoreId) {
        const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.15);
        for (let i = 1; i < steps; i++) if (!this.isFree(a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps, 0.05, ignoreId)) return false;
        return true;
    }
    attack(id) {
        if (this.status !== 'playing') return false;
        this.cancelCollection();
        if (this.cooldown > 0.00001) return false;
        const e = this.entities.find(o => o.id === id);
        if (!e) { this.player.swingDuration = this.player.swing = 0.2; this.cooldown = 0.25; return false; }
        if (Math.hypot(e.x - this.player.x, e.y - this.player.y) > 1.85) { this.say('เดินเข้าไปใกล้อีกนิด'); return false; }
        if (!this.lineClear(this.player, e, e.id)) { this.say('มีสิ่งกีดขวางอยู่ข้างหน้า'); return false; }
        const tool = e.kind === 'rock' ? 'pickaxe' : e.kind === 'tree' ? 'axe' : 'sword';
        const level = this.tools[tool];
        this.cooldown = [0.6, 0.45, 0.3][level]; this.player.swingDuration = this.player.swing = 0.22; this.activeTool = tool;
        this.player.facing = Math.atan2(e.y-this.player.y, e.x-this.player.x);
        e.hp -= level + 1; e.stun = 0.8;
        if(e.kind==='animal'){e.fleeing=true;e.safeTime=0;e.state='hurt';e.path=[];e.repath=0;}
        e.hurtTime=.24;
        this.event('hit', e, { damage: level+1 });
        if (e.hp <= 0) {
            this.entities = this.entities.filter(o => o.id !== id);
            this.drops.push({ id: this.id++, kind: 'letter', char: e.char, x: e.x, y: e.y });
            if ((e.kind === 'rock' && !this.firstPickaxe) || this.rng() < 0.25) {
                this.firstPickaxe = this.firstPickaxe || e.kind === 'rock';
                this.drops.push({ id: this.id++, kind: 'tool', tool, x: e.x + 0.18, y: e.y + 0.18 });
            }
            this.event('break', e, { char: e.char });
        }
        return true;
    }
    animalProfile(e) { return LettercraftGame.animals[e.species] || LettercraftGame.animals.sheep; }
    animalAnchors(e) {
        const p=this.animalProfile(e),c=Math.cos(e.angle||0),s=Math.sin(e.angle||0),feet=[];
        for(const x of p.stanceX?[-p.stanceX,p.stanceX]:[0])for(const y of [-p.stanceY,p.stanceY])feet.push({x:e.x+x*c-y*s,y:e.y+x*s+y*c});
        return feet;
    }
    animalFeet(e,dt) {
        const anchors=this.animalAnchors(e),stride=this.animalProfile(e).legHeight*1.65;
        if(!e.feet)e.feet=anchors.map(p=>({...p,z:this.heightAt(p.x,p.y),planted:true,cycle:-1}));
        for(let i=0;i<anchors.length;i++) {
            const f=e.feet[i],a=anchors[i],cycle=(e.gait||0)/stride+([0,.5,.5,0][i]),phase=cycle%1;
            if(e.grounded===false){Object.assign(f,a,{z:Math.max(this.heightAt(a.x,a.y),e.z),planted:false,cycle:-1});continue;}
            if(!e.moving){
                // Settle a lifted foot where it stopped without sliding planted feet.
                f.z=Math.max(this.heightAt(f.x,f.y),f.z-dt*1.8);f.planted=f.z<=this.heightAt(f.x,f.y)+.001;f.cycle=-1;continue;
            }
            if(phase<.55){f.cycle=Math.floor(cycle);f.planted=true;f.z=this.heightAt(f.x,f.y);continue;}
            // Lead the hip by the remaining swing plus half the next stance.
            // Without this prediction feet land behind a moving body and legs stretch.
            if(f.cycle!==Math.floor(cycle)||f.planted){f.from={x:f.x,y:f.y,z:f.z};f.to={x:a.x+Math.cos(e.angle)*stride*.72,y:a.y+Math.sin(e.angle)*stride*.72};f.cycle=Math.floor(cycle);}
            const t=phase<.55?1:Math.min(1,(phase-.55)/.45),ease=t*t*(3-2*t);
            f.x=f.from.x+(f.to.x-f.from.x)*ease;f.y=f.from.y+(f.to.y-f.from.y)*ease;
            const ground=this.heightAt(f.x,f.y),end=this.heightAt(f.to.x,f.to.y);
            f.z=Math.max(ground,f.from.z+(end-f.from.z)*ease+Math.sin(t*Math.PI)*.16);f.planted=t>=.999;
        }
    }
    animalVertical(e,dt) {
        const ground=Math.max(...this.animalAnchors(e).map(f=>this.heightAt(f.x,f.y)));
        if(!Number.isFinite(e.z))e.z=ground;
        e.vz=e.vz||0;
        if(ground>=e.z-.001){e.z=Math.min(ground,e.z+3*dt);e.vz=0;e.grounded=true;}
        else {e.vz-=15*dt;e.z=Math.max(ground,e.z+e.vz*dt);e.grounded=e.z<=ground+.001;if(e.grounded)e.vz=0;}
    }
    animalSegmentFree(e,x,y) {
        const r=this.animalProfile(e).radius,n=Math.max(1,Math.ceil(Math.hypot(x-e.x,y-e.y)/.15));
        let height=this.heightAt(e.x,e.y);
        for(let i=1;i<=n;i++){
            const px=e.x+(x-e.x)*i/n,py=e.y+(y-e.y)*i/n,h=this.heightAt(px,py);
            if(!this.isFree(px,py,r,e.id)||h-height>.26||Math.hypot(px-this.player.x,py-this.player.y)<r+.27)return false;
            height=h;
        }
        return true;
    }
    buildFlow(body) {
        // Reuse the original bounded grid search, now rooted at an animal and
        // selecting a reachable escape/wander destination instead of a pursuer.
        const n=this.size,start=Math.floor(body.y)*n+Math.floor(body.x),parents=new Int16Array(n*n).fill(-1),depth=new Uint8Array(n*n),queue=[start];
        parents[start]=start;let best=start,bestScore=-Infinity;
        const radius=this.animalProfile(body).radius,angle=body.wanderAngle||0;
        for(let i=0;i<queue.length&&i<240;i++){
            const cell=queue[i],cx=cell%n,cy=Math.floor(cell/n),x=cx+.5,y=cy+.5;
            const score=body.fleeing?Math.hypot(x-this.player.x,y-this.player.y)-depth[cell]*.08:(x-body.x)*Math.cos(angle)+(y-body.y)*Math.sin(angle)-depth[cell]*.18;
            if(cell!==start&&score>bestScore){bestScore=score;best=cell;}
            if(depth[cell]>=7)continue;
            for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
                const nx=cx+dx,ny=cy+dy,next=ny*n+nx;
                if(nx<0||ny<0||nx>=n||ny>=n||parents[next]>=0||!this.isFree(nx+.5,ny+.5,radius,body.id))continue;
                const origin=cell===start?body:{...body,x,y};
                if(!this.animalSegmentFree(origin,nx+.5,ny+.5))continue;
                parents[next]=cell;depth[next]=depth[cell]+1;queue.push(next);
            }
        }
        const path=[];for(let cell=best;cell!==start;cell=parents[cell])path.unshift({x:cell%n+.5,y:Math.floor(cell/n)+.5});
        return path;
    }
    updateAnimal(e,dt) {
        const profile=this.animalProfile(e),distance=Math.hypot(e.x-this.player.x,e.y-this.player.y);
        if(distance<3&&!e.fleeing){e.fleeing=true;e.path=[];e.repath=0;}
        e.safeTime=e.fleeing&&distance>6?(e.safeTime||0)+dt:0;
        if(e.safeTime>=2){e.fleeing=false;e.path=[];e.wait=.5;e.safeTime=0;}
        e.stun=Math.max(0,(e.stun||0)-dt);e.moving=false;e.gait=e.gait||0;e.angle=e.angle||0;
        e.state=e.stun?'hurt':e.fleeing?'flee':'idle';
        if(!e.stun){
            e.wait=Math.max(0,(e.wait||0)-dt);e.repath=Math.max(0,(e.repath||0)-dt);
            if(e.fleeing||!e.wait){
                if(!e.path?.length||!e.repath){
                    if(!e.fleeing)e.wanderAngle=this.rng()*Math.PI*2;
                    e.path=this.buildFlow(e);e.repath=e.fleeing?1.2:3;
                }
                const target=e.path[0];
                if(target){
                    if(!this.animalSegmentFree(e,target.x,target.y)){e.path=[];e.repath=0;}
                    else {
                        const dx=target.x-e.x,dy=target.y-e.y,len=Math.hypot(dx,dy),speed=e.fleeing?profile.speed:.55,step=Math.min(len,speed*dt),oldX=e.x,oldY=e.y;
                        this.move(e,dx/(len||1)*step,dy/(len||1)*step,profile.radius);
                        const moved=Math.hypot(e.x-oldX,e.y-oldY);e.moving=moved>.00001;e.gait+=moved;
                        if(e.moving){const heading=Math.atan2(e.y-oldY,e.x-oldX);e.angle+=Math.atan2(Math.sin(heading-e.angle),Math.cos(heading-e.angle))*(1-Math.exp(-10*dt));e.state=e.fleeing?'flee':'wander';}
                        else {e.path=[];e.repath=0;}
                        if(len<=step+.001){e.path.shift();if(!e.path.length&&!e.fleeing)e.wait=1+this.rng()*2;}
                    }
                } else {e.wait=.3;e.repath=.3;}
            }
        }
        this.animalVertical(e,dt);this.animalFeet(e,dt);
    }
    finish(status, reason = '') { this.status = status; this.reason = reason; this.clearInput(); }
    update(seconds, active = true) {
        if (this.status !== 'playing' || !Number.isFinite(seconds) || seconds < 0) return;
        this.elapsed = Math.min(300, this.elapsed + seconds);
        if (this.remaining <= 0.000001) { this.elapsed = 300; this.finish('lost', 'time'); return; }
        if (!active) { this.clearInput(); return; }
        const dt = Math.min(0.05, seconds);
        this.cooldown = Math.max(0, this.cooldown - dt);
        this.player.swing = Math.max(0, this.player.swing - dt); this.messageTime = Math.max(0, this.messageTime - dt);
        if (this.remaining <= 60 && !this.warned) { this.warned = true; this.event('warning', this.player); this.say('เหลือเวลาอีก 1 นาที!'); }
        const dir = this.direction();
        this.player.moving = false;
        this.player.running = dir.moving && (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'));
        if (dir.moving) {
            this.cancelCollection();
            const p = this.player, target = Math.atan2(dir.y, dir.x);
            p.facing += Math.atan2(Math.sin(target-p.facing), Math.cos(target-p.facing)) * (1-Math.exp(-14*dt));
            const x=p.x,y=p.y,speed=p.running?5:3.5;
            this.move(p, dir.x * speed * dt, dir.y * speed * dt);
            p.moving = Math.hypot(p.x-x,p.y-y) > .0001;
        }
        this.verticalStep(dt);
        for (const e of this.entities) e.hurtTime=Math.max(0,(e.hurtTime||0)-dt);
        for (const e of this.entities) if (e.kind === 'animal') this.updateAnimal(e,dt);
        for (const d of [...this.drops]) if (d.kind === 'tool' && this.player.grounded && Math.abs(this.player.z-this.heightAt(d.x,d.y))<.65 && Math.hypot(d.x - this.player.x, d.y - this.player.y) < 0.85) {
            this.tools[d.tool] = Math.min(2, this.tools[d.tool] + 1); this.drops = this.drops.filter(o => o.id !== d.id);
            this.event('tool', d, { tool: d.tool }); this.say('ได้อุปกรณ์ใหม่! ฟันหรือขุดเร็วขึ้นแล้ว');
        }
        if (this.collecting) {
            const d = this.drops.find(o => o.id === this.collecting.dropId);
            if (!d || !this.player.grounded || Math.abs(this.player.z-this.heightAt(d.x,d.y))>=.65 || !this.keys.has(this.collecting.code) || Math.hypot(d.x - this.player.x, d.y - this.player.y) > 1.35) { this.cancelCollection(); return; }
            this.collecting.elapsed += dt;
            if (this.collecting.elapsed >= 3 - 0.000001) {
                this.inventory[d.char] = (this.inventory[d.char] || 0) + 1; this.collected++;
                this.drops = this.drops.filter(o => o.id !== d.id); this.event('collect', d, { char: d.char }); this.cancelCollection();
                if (this.collected >= this.goal) this.finish('won');
            }
        }
    }
}
if (typeof module !== 'undefined' && module.exports) module.exports = { LettercraftGame };

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
    this.camera = null;
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

  static transformPoint(point, t, inverse=false) {
    if(!t)return {...point};
    const p=t.pivot||{x:0,y:0,z:0},cs=Math.cos(t.swing||0),ss=Math.sin(t.swing||0),cy=Math.cos(t.yaw||0),sy=Math.sin(t.yaw||0),ct=Math.cos(t.twist||0),st=Math.sin(t.twist||0);
    let {x,y,z}=point;
    if(inverse) {
      x-=t.x||0;y-=t.y||0;z-=t.z||0;
      [x,y]=[x*cy+y*sy,-x*sy+y*cy];x-=p.x;y-=p.y;z-=p.z;
      [y,z]=[y*ct+z*st,-y*st+z*ct];[x,z]=[x*cs-z*ss,x*ss+z*cs];
      return {x:x+p.x,y:y+p.y,z:z+p.z};
    }
    x-=p.x;y-=p.y;z-=p.z;[x,z]=[x*cs+z*ss,-x*ss+z*cs];[y,z]=[y*ct-z*st,y*st+z*ct];x+=p.x;y+=p.y;z+=p.z;
    return {x:(t.x||0)+x*cy-y*sy,y:(t.y||0)+x*sy+y*cy,z:(t.z||0)+z};
  }

  static rayDescriptor(origin,direction,box,padding=0) {
    const o=LettercraftView.transformPoint(origin,box.transform,true);
    const end=LettercraftView.transformPoint({x:origin.x+direction.x,y:origin.y+direction.y,z:origin.z+direction.z},box.transform,true);
    const d={x:end.x-o.x,y:end.y-o.y,z:end.z-o.z},min={},max={};
    for(const axis of ['x','y','z']){min[axis]=box.min[axis]-padding;max[axis]=box.max[axis]+padding;}
    return LettercraftView.rayBox(o,d,min,max);
  }

  _segment(parts,name,a,b,width,material,id=null,tint=null) {
    const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,length=Math.hypot(dx,dy,dz);
    parts.push({part:name,id,material,tint,min:{x:-width/2,y:-width/2,z:0},max:{x:width/2,y:width/2,z:length},
      transform:{x:a.x,y:a.y,z:a.z,yaw:Math.atan2(dy,dx),swing:Math.atan2(Math.hypot(dx,dy),dz),pivot:{x:0,y:0,z:0}}});
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
  _camera(game) { return this.camera || this.updateCamera(game, 0); }

  updateCamera(game, dt = 0) {
    if(!game || !game.player)return this.camera;
    const p=game.player,step=Math.max(0,Math.min(.08,Number(dt)||0));
    const reset=!step||this.cameraGame!==game||this.cameraPlayer!==p||!this.cameraPivot;
    const follow=reset?1:1-Math.exp(-12*step),recover=reset?1:1-Math.exp(-5*step);
    const feet=Number.isFinite(p.z)?p.z:this._height(game,p.x,p.y);
    const anchor={x:p.x,y:p.y,z:feet+1.05},previous=this.cameraPivot||anchor;
    const pivot={};for(const axis of ['x','y','z'])pivot[axis]=previous[axis]+(anchor[axis]-previous[axis])*follow;
    const angle=p.angle||0,pitch=Number.isFinite(p.pitch)?p.pitch:-.32;
    const requested=Math.max(2.2,Math.min(7,Number(game.cameraDistance)||4.4));
    this.cameraZoom=reset?requested:this.cameraZoom+(requested-this.cameraZoom)*recover;
    const direction=LettercraftView.cameraDirection({angle,pitch}),shoulder=.65;
    const end={x:pivot.x-direction.x*this.cameraZoom-Math.sin(angle)*shoulder,
      y:pivot.y-direction.y*this.cameraZoom+Math.cos(angle)*shoulder,z:pivot.z-direction.z*this.cameraZoom};
    // Sweep the entire boom from the current player pivot. Padding also protects
    // the near plane while orbiting around corners and through tree canopies.
    const delta={x:end.x-anchor.x,y:end.y-anchor.y,z:end.z-anchor.z};
    const length=Math.hypot(delta.x,delta.y,delta.z),ray={x:delta.x/length,y:delta.y/length,z:delta.z/length};
    const padding=.18,size=game.size||32;
    let limit=length;
    for(const box of [...this._terrain(game),...this._scene(game,anchor).boxes]) {
      const hit=LettercraftView.rayDescriptor(anchor,ray,box,padding);
      if(hit!==null)limit=Math.min(limit,Math.max(.02,hit-.025));
    }
    for(const axis of ['x','y']) {
      if(ray[axis]>0)limit=Math.min(limit,(size-padding-anchor[axis])/ray[axis]);
      else if(ray[axis]<0)limit=Math.min(limit,(padding-anchor[axis])/ray[axis]);
    }
    const eased=reset?length:this.cameraBoom+(length-this.cameraBoom)*recover;
    this.cameraBoom=Math.max(.02,Math.min(limit,eased));
    this.camera={x:anchor.x+ray.x*this.cameraBoom,y:anchor.y+ray.y*this.cameraBoom,z:anchor.z+ray.z*this.cameraBoom,angle,pitch};
    this.cameraPivot=pivot;this.cameraGame=game;this.cameraPlayer=p;
    return this.camera;
  }

  _avatar(game) {
    const p=game.player,t=this.time||0,parts=[];
    const feet=Number.isFinite(p.z)?p.z:this._height(game,p.x,p.y),yaw=Number.isFinite(p.facing)?p.facing:p.angle||0;
    const airborne=p.grounded===false,falling=airborne&&(p.vz||0)<-.1;
    const crouch=airborne?0:Math.min(1,Math.max(0,(p.landing||0)/.18))*.15,hip=.58-crouch;
    const stride=airborne?(falling?.18:.5):p.moving?Math.sin(t*(p.running?13:9))*(p.running?.8:.48):0;
    const breath=Math.sin(t*2.2)*.008-crouch;
    const sway=airborne?(falling?.6:-.85):p.moving?stride*.8:Math.sin(t*2.2)*.025;
    const leftSway=airborne?sway:-sway,rightSway=airborne?sway*.8:sway;
    const part=(name,x,y,z,w,d,h,material,tint=null,pivot=null,swing=0)=>{
      parts.push({part:name,id:null,min:{x:x-w/2,y:y-d/2,z},max:{x:x+w/2,y:y+d/2,z:z+h},material,tint,
        transform:{x:p.x,y:p.y,z:feet,yaw,pivot:pivot||{x:0,y:0,z:0},swing}});
    };
    // A compact original explorer: teal jacket, ochre scarf, dark boots and pack.
    part('leftLeg',0,-.145,0,.27,.23,hip,9,[.53,.67,.77],{x:0,y:0,z:hip},stride);
    part('rightLeg',0,.145,0,.27,.23,hip,9,[.53,.67,.77],{x:0,y:0,z:hip},-stride);
    part('leftBoot',.035,-.145,0,.34,.25,.16,10,null,{x:0,y:0,z:hip},stride);
    part('rightBoot',.035,.145,0,.34,.25,.16,10,null,{x:0,y:0,z:hip},-stride);
    part('body',0,0,.55+breath,.36,.5,.62,11,[.56,.74,.7]);
    part('belt',.005,0,.57+breath,.38,.52,.09,4);
    part('head',.012,0,1.15+breath,.43,.45,.43,15,[1.15,.97,.86]);
    part('hair',-.025,0,1.49+breath,.48,.49,.13,4,[.56,.55,.57]);
    part('hairBack',-.205,0,1.25+breath,.08,.47,.32,4,[.56,.55,.57]);
    for(const y of [-.11,.11])part('eye',.233,y,1.34+breath,.018,.065,.07,10);
    part('smile',.235,0,1.24+breath,.02,.1,.025,4,[.6,.55,.5]);
    part('scarf',.018,0,1.1+breath,.41,.54,.11,8,[1.1,.73,.53]);
    part('scarfTail',.211,-.125,.9+breath,.04,.11,.27,8,[1.1,.73,.53]);
    part('backpack',-.265,0,.67+breath,.2,.39,.43,12,[.73,.74,.63]);
    part('packFlap',-.28,0,1.0+breath,.22,.42,.1,4);
    const shoulder={x:0,y:0,z:1.12+breath};
    part('leftArm',0,-.365,.67+breath,.24,.2,.47,11,[.56,.74,.7],shoulder,leftSway);
    part('leftHand',0,-.365,.56+breath,.23,.2,.17,15,null,shoulder,leftSway);

    const attackPhase=p.swing>0?1-p.swing/(p.swingDuration||.22):0;
    // Short wind-up, decisive stroke, then a gentler recovery to the grip pose.
    const ease=v=>v*v*(3-2*v);
    const swingProgress=p.swing>0?(attackPhase<.3?ease(attackPhase/.3):1-ease((attackPhase-.3)/.7)):0;
    const tool=game.activeTool||'pickaxe';
    let attackSwing=0,attackTwist=0;
    if(swingProgress>0) {
      if(tool==='sword') {
        attackSwing=swingProgress*.95;
        attackTwist=-swingProgress*1.05;
      } else if(tool==='axe') {
        attackSwing=swingProgress*1.35;
        attackTwist=swingProgress*.05;
      } else {
        attackSwing=swingProgress*1.65;
        attackTwist=0;
      }
    }
    const root={x:p.x,y:p.y,z:feet,yaw},world=point=>LettercraftView.transformPoint(point,root);
    const shoulderPoint={x:0,y:.365,z:1.08+breath};
    const elbow={x:.15+Math.sin(attackSwing)*.12,y:.37+attackTwist*.08,z:.83+breath+attackSwing*.12};
    const hand={x:.38+Math.sin(attackSwing)*.14,y:.37+attackTwist*.14,z:.82+breath+attackSwing*.27+rightSway*.025};
    this._segment(parts,'rightArm',world(shoulderPoint),world(elbow),.21,11,null,[.56,.74,.7]);
    this._segment(parts,'rightForearm',world(elbow),world(hand),.17,11,null,[.56,.74,.7]);
    part('rightElbow',elbow.x,elbow.y,elbow.z-.09,.19,.19,.18,11,[.56,.74,.7]);
    part('rightHand',hand.x,hand.y,hand.z-.095,.2,.19,.19,15);
    // The wrist has its own grip frame. Every weapon piece is authored around
    // this origin, so wrist rotation cannot separate the handle from the hand.
    const handWorld=world(hand),gripYaw=yaw+attackTwist*.35;
    const rightHandTransform={...handWorld,yaw:gripYaw,pivot:{x:0,y:0,z:0},swing:(tool==='sword'?.82:.72)-attackSwing*.65,twist:attackTwist*.35};

    const toolLvl=(game.tools&&game.tools[tool])||0;
    const toolMats=[
      {mat:12,tint:[1.18,1.04,.82]},
      {mat:3,tint:[1.18,1.21,1.25]},
      {mat:11,tint:[1.0,1.22,1.28]}
    ];
    const metal=toolMats[Math.min(2,toolLvl)];
    const heldPart=(name,x,y,z,w,d,h,material,tint=null)=>{
      parts.push({part:name,id:null,min:{x:x-w/2,y:y-d/2,z},max:{x:x+w/2,y:y+d/2,z:z+h},material,tint,transform:rightHandTransform});
    };

    const piece=(name,y,z,d,h,material=metal.mat,tint=metal.tint,w=.12,x=0)=>heldPart(name,x,y-.43,z-.64,w,d,h,material,tint);
    if(tool==='sword') {
      piece('heldHandle',.43,.46,.09,.35,4,[.72,.67,.61],.09);
      piece('heldPommel',.43,.40,.14,.09,8,[1,.8,.5]);
      piece('heldGuard',.43,.79,.5,.08,8,[1,.87,.65],.15);
      piece('heldBlade',.43,.86,.19,.64);
      piece('heldRidge',.43,.88,.055,.60,7,[.9,1,1],.025,-.065);
      piece('heldTip',.43,1.50,.12,.14);
      piece('heldTipCap',.43,1.64,.055,.06);
    } else {
      piece('heldHandle',.43,.36,.09,.80,4,[1.13,.95,.8],.09);
      piece('heldGrip',.43,.53,.11,.22,12,[.63,.64,.62],.11);
      piece('heldSocket',.43,1.06,.17,.18,8,[.84,.77,.58],.16);
      if(tool==='axe') {
        piece('heldBlade',.65,1.06,.38,.22);
        piece('heldBeard',.70,.92,.28,.14);
        piece('heldEdge',.85,.98,.075,.26,7,[.87,.97,1],.095);
        piece('heldBack',.29,1.09,.18,.10);
      } else {
        piece('heldHead',.43,1.13,.73,.13);
        piece('heldPickLeft',.075,1.04,.16,.12);
        piece('heldPickRight',.785,1.04,.16,.12);
        piece('heldLeftTip',.01,.94,.09,.11,7,[.88,.96,1],.09);
        piece('heldRightTip',.85,.94,.09,.11,7,[.88,.96,1],.09);
      }
    }
    // Keep the lowest planted boot corner supported throughout the gait.
    let bottom=Infinity;
    for(const b of parts)if(b.part.endsWith('Leg')||b.part.endsWith('Boot'))for(const x of [b.min.x,b.max.x])for(const z of [b.min.z,b.max.z]) {
      const tr=b.transform;bottom=Math.min(bottom,feet+tr.pivot.z-(x-tr.pivot.x)*Math.sin(tr.swing)+(z-tr.pivot.z)*Math.cos(tr.swing));
    }
    for(const transform of new Set(parts.map(b=>b.transform)))transform.z+=feet-bottom;
    return parts;
  }

  _animal(game,e) {
    const defaults={pig:[.28,.21,.28,.72,.5,.4],cow:[.34,.25,.48,.88,.58,.5],goat:[.28,.2,.44,.7,.44,.4],sheep:[.28,.23,.32,.78,.6,.48],chicken:[0,.13,.24,.4,.34,.31]};
    const species=defaults[e.species]?e.species:'sheep',v=defaults[species];
    const profile=typeof game.animalProfile==='function'?game.animalProfile(e):{stanceX:v[0],stanceY:v[1],legHeight:v[2],bodyLength:v[3],bodyWidth:v[4],bodyHeight:v[5]};
    const {stanceX,stanceY,legHeight,bodyLength,bodyWidth,bodyHeight}=profile;
    const z=Number.isFinite(e.z)?e.z:this._height(game,e.x,e.y),root={x:e.x,y:e.y,z,yaw:e.angle||0},parts=[];
    const pink=[1,.64,.68],cream=[.96,.93,.82],brown=[.7,.5,.32],white=[1,1,.96];
    const coat=species==='pig'?pink:species==='goat'?brown:white;
    const bob=e.moving?Math.sin((e.gait||0)*11)*.012:0;
    const add=(name,x,y,h,w,d,height,material=13,tint=coat)=>parts.push({part:name,id:e.id,min:{x:x-w/2,y:y-d/2,z:h},max:{x:x+w/2,y:y+d/2,z:h+height},material,tint,transform:root});
    add('animalBody',0,0,legHeight+bob,bodyLength,bodyWidth,bodyHeight);
    let index=0;
    for(const x of species==='chicken'?[0]:[-stanceX,stanceX])for(const y of [-stanceY,stanceY]) {
      const nominal=LettercraftView.transformPoint({x,y,z:0},root);
      const foot=e.feet&&e.feet[index]||{...nominal,z:e.grounded===false?z:this._height(game,nominal.x,nominal.y)};
      const hip=LettercraftView.transformPoint({x,y,z:legHeight+.06+bob},root);
      const ankle={x:foot.x,y:foot.y,z:foot.z+.055},width=species==='chicken'?.045:.085;
      // Two-bone IK bends in the animal's forward plane while preserving the
      // terrain contact. Very distant endpoints extend rather than detach.
      const delta={x:ankle.x-hip.x,y:ankle.y-hip.y,z:ankle.z-hip.z},distance=Math.hypot(delta.x,delta.y,delta.z)||1e-6;
      const unit={x:delta.x/distance,y:delta.y/distance,z:delta.z/distance};
      const forward={x:-Math.cos(root.yaw),y:-Math.sin(root.yaw),z:0},dot=forward.x*unit.x+forward.y*unit.y;
      const bend={x:forward.x-dot*unit.x,y:forward.y-dot*unit.y,z:-dot*unit.z},bendLength=Math.hypot(bend.x,bend.y,bend.z)||1;
      const bone=Math.max(legHeight*.59,distance*.5),offset=Math.sqrt(Math.max(0,bone*bone-distance*distance*.25));
      const knee={};for(const axis of ['x','y','z'])knee[axis]=(hip[axis]+ankle[axis])*.5+bend[axis]/bendLength*offset;
      this._segment(parts,'animalUpperLeg'+index,hip,knee,width,13,e.id,species==='chicken'?[1,.69,.2]:coat);
      this._segment(parts,'animalLowerLeg'+index,knee,ankle,width,13,e.id,species==='chicken'?[1,.69,.2]:coat);
      parts.push({part:'animalFoot'+index,id:e.id,min:{x:-.07,y:-.06,z:0},max:{x:species==='chicken'?.13:.07,y:.06,z:.075},material:species==='chicken'?8:10,transform:{x:foot.x,y:foot.y,z:foot.z,yaw:root.yaw}});
      index++;
    }
    const front=bodyLength*.43,headZ=legHeight+bodyHeight*.62+bob;
    if(species==='chicken') {
      add('chickenNeck',front,0,headZ,.19,.23,.24);add('chickenHead',front+.05,0,headZ+.13,.25,.27,.22);
      add('beak',front+.23,0,headZ+.16,.15,.15,.08,8,[1,.8,.3]);
      add('comb',front+.04,0,headZ+.35,.15,.075,.11,13,[.9,.2,.13]);
      add('wattle',front+.17,0,headZ+.07,.065,.085,.13,13,[.85,.2,.16]);
      for(const side of [-1,1])add('wing',-.03,side*.18,legHeight+.07,.26,.08,.19,13,cream);
      add('tail',-.25,0,legHeight+.2,.18,.17,.24,13,cream);
    } else {
      const long=species==='goat'?.31:species==='cow'?.35:.28;
      add('animalHead',front+.09,0,headZ,long,bodyWidth*.69,.29);
      add('muzzle',front+long*.68,0,headZ+.02,.17,bodyWidth*.58,.15,13,species==='pig'?pink:cream);
      for(const side of [-1,1]) {
        add('ear',front+.02,side*bodyWidth*.44,headZ+.22,.17,.13,species==='pig'?.13:.075,13,species==='pig'?pink:coat);
        if(species==='cow'||species==='goat')add('horn',front-.025,side*.13,headZ+.29,.07,.065,species==='goat'?.23:.14,13,cream);
      }
      if(species==='pig')for(const side of [-1,1])add('nostril',front+long*.68+.09,side*.07,headZ+.07,.012,.037,.035,10);
      if(species==='cow')for(const side of [-1,1])add('cowPatch',-.12,side*(bodyWidth/2+.005),legHeight+.12,.28,.015,.24,10);
      if(species==='goat')add('beard',front+.19,0,headZ-.09,.12,.12,.14,13,cream);
      if(species==='sheep')for(const x of [-.24,0,.24])for(const side of [-1,1])add('fleece',x,side*.25,legHeight+.08,.29,.18,.35,6,white);
      add('tail',-bodyLength/2-.05,0,legHeight+bodyHeight*.6,.17,.08,species==='pig'?.09:.18,13,coat);
    }
    for(const side of [-1,1])add('animalEye',front+.13,side*(species==='chicken'?.141:bodyWidth*.35+.007),headZ+(species==='chicken'?.25:.19),.065,.018,.065,10);
    return parts;
  }

  // These descriptors are the shared source of truth for visible cubes and ray occlusion.
  _scene(game, camera) {
    const boxes = [], labels = [];
    const cube = (x, y, z, w, d, h, material, id = null, tint = null) => {
      boxes.push({ min: { x: x-w/2, y: y-d/2, z }, max: { x: x+w/2, y: y+d/2, z: z+h }, material, id, tint });
    };
    for (const e of game.entities || []) {
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
        const animal=this._animal(game,e);boxes.push(...animal);
        labelZ=(Number.isFinite(e.z)?e.z:z)+(typeof game.animalProfile==='function'?game.animalProfile(e).height:1.3)+.24;
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

  _decorations(game) {
    if(this.decorGame===game&&this.decorHeight===game.heightAt)return this.decorations;
    const boxes=[],size=game.size||32;
    const add=(x,y,z,w,d,h,material,tint)=>boxes.push({min:{x:x-w/2,y:y-d/2,z},max:{x:x+w/2,y:y+d/2,z:z+h},material,tint,id:null});
    for(let x=1.5;x<size-1;x+=2)for(let y=1.5;y<size-1;y+=2) {
      if(Math.abs(x-size/2)<1.3||Math.abs(y-size/2)<1.3||(game.entities||[]).some(e=>Math.hypot(e.x-x,e.y-y)<1.3))continue;
      const seed=(Math.floor(x)*37+Math.floor(y)*53)%13,z=this._height(game,x,y);
      if(seed%3===0) {
        add(x,y,z,.045,.045,.23,5,[.8,1.15,.8]);
        add(x,y,z+.2,.19,.19,.07,13,seed%2?[1,.64,.64]:[1,.84,.31]);
        add(x,y,z+.27,.075,.075,.025,8,[1.1,1,.8]);
      } else {
        add(x,y,z,.04,.16,.12+seed*.012,14,[.87,1.05,.78]);
        add(x+.12,y+.05,z,.035,.12,.14,5,[1.1,1.15,.8]);
      }
    }
    this.decorGame=game;this.decorHeight=game.heightAt;this.decorations=boxes;return boxes;
  }

  _nearest(origin, direction, boxes, limit = 44) {
    let distance=limit, box=null;
    for(const b of boxes) {
      const hit=LettercraftView.rayDescriptor(origin,direction,b);
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
    const camera=this.camera||this.updateCamera(game,0), scene=this._scene(game,camera), boxes=[...this._terrain(game),...scene.boxes];
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
    const skyVertex=compile(gl.VERTEX_SHADER,`attribute vec2 aSky; varying float vHeight;
      void main(){vHeight=aSky.y;gl_Position=vec4(aSky,1.0,1.0);}`);
    let skyFragment;
    try {skyFragment=compile(gl.FRAGMENT_SHADER,`precision mediump float; varying float vHeight; uniform float uPitch;
      void main(){float h=sin(uPitch)+vHeight*.7*cos(uPitch);
        vec3 color=mix(vec3(.66,.83,.87),vec3(.29,.60,.83),smoothstep(0.0,1.0,h));
        gl_FragColor=vec4(color,1.0);}`);
    } catch(error){gl.deleteShader(skyVertex);throw error;}
    this.skyProgram=gl.createProgram();gl.attachShader(this.skyProgram,skyVertex);gl.attachShader(this.skyProgram,skyFragment);gl.linkProgram(this.skyProgram);
    gl.deleteShader(skyVertex);gl.deleteShader(skyFragment);
    if(!gl.getProgramParameter(this.skyProgram,gl.LINK_STATUS))throw new Error('Sky program: '+gl.getProgramInfoLog(this.skyProgram));
    this.skyAttribute=gl.getAttribLocation(this.skyProgram,'aSky');this.skyPitch=gl.getUniformLocation(this.skyProgram,'uPitch');
    this.skyBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.skyBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
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
    if(b.transform) {
      for(const corner of corners) {
        const point=LettercraftView.transformPoint({x:corner[0],y:corner[1],z:corner[2]},b.transform);
        corner[0]=point.x;corner[1]=point.y;corner[2]=point.z;
      }
    }
    const quads=[[4,5,6,7],[0,3,2,1],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];
    for(let face=0;face<6;face++) {
      if(faces && !faces.includes(face))continue;
      const material=b.ground&&face!==0?1:b.material;
      const u0=(material*16+.5)/256,u1=(material*16+15.5)/256;
      const uv=[[u0,.03125],[u1,.03125],[u1,.96875],[u0,.96875]];
      const q=quads[face],v=corners[q[0]],u=corners[q[1]],w=corners[q[2]];
      const ax=u[0]-v[0],ay=u[1]-v[1],az=u[2]-v[2],bx=w[0]-v[0],by=w[1]-v[1],bz=w[2]-v[2];
      const nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx,length=Math.hypot(nx,ny,nz)||1;
      const shade=.6+.48*Math.max(0,(nx*.42-ny*.55+nz*.72)/length),tint=b.tint||[1,1,1];
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
    for(const b of this._decorations(game))this._boxVertices(out,b);
    // Flat compass mosaic: a landmark with no extra collision or hidden pickups.
    const center=size/2;
    for(let i=-2;i<=2;i++)this._boxVertices(out,{min:{x:center+i*.2,y:center-.08,z:.003},max:{x:center+i*.2+.16,y:center+.08,z:.008},material:i===2?11:8});
    this.terrainVertices=out;
    return out;
  }

  _surfaceDetails(game,boxes,hoverId) {
    const primary=new Map(),details=[];
    const volume=b=>(b.max.x-b.min.x)*(b.max.y-b.min.y)*(b.max.z-b.min.z);
    for(const box of boxes) if(box.id!=null&&(!primary.has(box.id)||volume(box)>volume(primary.get(box.id))))primary.set(box.id,box);
    const items=new Map((game.entities||[]).map(e=>[e.id,e]));
    // Thin cuboids share the depth-tested batch; a small outward offset avoids
    // z-fighting. Decorative details never become ray or collision bodies.
    const segment=(from,to,width,material,detail)=>{
      const min={},max={};
      for(const axis of ['x','y','z']) {min[axis]=Math.min(from[axis],to[axis])-width;max[axis]=Math.max(from[axis],to[axis])+width;}
      details.push({min,max,material,detail,id:null});
    };
    for(const [id,box] of primary) {
      const detailStart=details.length;
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
      for(let i=detailStart;i<details.length;i++)details[i].transform=box.transform;
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
      for(let i=detailStart;i<details.length;i++)details[i].transform=box.transform;
    }
    return details;
  }

  render(game,dt,hoverId=null) {
    if(this.disposed||!game||!game.player)return;
    const gl=this.gl; if(gl.isContextLost())return;
    dt=Math.max(0,Math.min(.08,Number(dt)||0));this.time+=dt;
    if(!this.camera||this.cameraGame!==game||this.cameraPlayer!==game.player)this.updateCamera(game,0);
    const scene=this._scene(game,this.camera),terrain=this._terrain(game),boxes=[...terrain,...scene.boxes];
    const vertices=this._groundVertices(game,terrain).slice();
    const hurt=new Set((game.entities||[]).filter(e=>e.hurtTime>0).map(e=>e.id));
    for(const box of scene.boxes)this._boxVertices(vertices,hurt.has(box.id)?{...box,tint:[1.4,1.24,1.06]}:box,hoverId!=null&&box.id===hoverId);
    for(const detail of this._surfaceDetails(game,scene.boxes,hoverId))this._boxVertices(vertices,detail);
    for(const part of this._avatar(game))this._boxVertices(vertices,part);
    // Distant block clouds are geometry, so looking up remains a true perspective view.
    for(let i=0;i<10;i++) {
      const x=3+(i*17)%36,y=2+(i*11)%35;
      this._boxVertices(vertices,{min:{x,y,z:8+(i%3)},max:{x:x+3.8,y:y+2.2,z:8.55+(i%3)},material:13});
      this._boxVertices(vertices,{min:{x:x+.8,y:y-.6,z:8.1+(i%3)},max:{x:x+2.8,y:y+2.8,z:8.7+(i%3)},material:13});
    }
    gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(.66,.83,.87,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);gl.useProgram(this.skyProgram);gl.bindBuffer(gl.ARRAY_BUFFER,this.skyBuffer);
    for(const location of Object.values(this.attributes))gl.disableVertexAttribArray(location);
    gl.enableVertexAttribArray(this.skyAttribute);gl.vertexAttribPointer(this.skyAttribute,2,gl.FLOAT,false,0,0);
    gl.uniform1f(this.skyPitch,this.camera.pitch);gl.drawArrays(gl.TRIANGLES,0,3);gl.disableVertexAttribArray(this.skyAttribute);
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
    if(gl){if(this.skyBuffer)gl.deleteBuffer(this.skyBuffer);if(this.skyProgram)gl.deleteProgram(this.skyProgram);}
    this.skyBuffer=this.skyProgram=null;this.decorGame=this.decorations=null;
    this.buffer=this.texture=this.program=null;this.terrainVertices=null;this.terrainGame=null;
    this.labels=[];this.particles=[];this.disposed=true;
  }
}
if(typeof window!=='undefined')window.LettercraftView=LettercraftView;
if(typeof module!=='undefined'&&module.exports)module.exports=LettercraftView;

/* Connect the standalone game to the existing lesson UI. */
var Lettercraft = {
    game: null, view: null, frame: null, listeners: null, panel: null,
    hoverId: null, last: 0, questSignature: '', background: false,
    fallback: false, fallbackActive: false, dragging: false, capturePending: false,
    el(id) { return document.getElementById(id); },
    displayChar(c) { return /^\p{M}/u.test(c) ? '◌' + c : c; },
    mount() {
        this.dispose();
        const lesson = curriculum[state.lang][state.lessonIndex];
        this.lessonText = generateContent(lesson);
        closeModal(); state.isGameMode = true;
        this.el('game-ui').style.display = 'block';
        this.el('lc-lesson').textContent = (state.lang === 'TH' ? 'ภาษาไทย' : 'English') + ' · ' + (lesson.name || 'บทที่ ' + (state.lessonIndex + 1));
        this.listeners = new AbortController(); const signal = this.listeners.signal;
        const listen = (node, event, fn) => node.addEventListener(event, fn, { signal });
        const canvas = this.el('lc-canvas');
        listen(document, 'mousemove', e => {
            if (!this.panel && document.pointerLockElement === canvas) this.game.look(e.movementX, e.movementY);
        });
        // Preventing pointerdown suppresses compatibility mousemove during a drag.
        listen(document, 'pointermove', e => {
            if (!this.panel && this.fallbackActive && this.dragging) this.game.look(e.movementX, e.movementY);
        });
        listen(document, 'pointerlockchange', () => {
            this.capturePending = false; this.game.clearInput(); this.dragging = false;
            if (document.pointerLockElement === canvas) {
                this.fallbackActive = false;
                if (this.panel || this.game.status !== 'playing') document.exitPointerLock();
            }
            this.updateCaptureHint();
        });
        listen(document, 'pointerlockerror', () => this.captureFailed());
        listen(canvas, 'contextmenu', e => e.preventDefault());
        canvas.addEventListener('wheel', e => {
            if (!this.panel && this.hasControl()) { e.preventDefault(); this.game.zoom(e.deltaY); }
        }, { signal, passive: false });
        listen(canvas, 'pointerdown', e => {
            if (this.panel || this.game.status !== 'playing') return;
            if (e.button === 2 && this.fallbackActive) { e.preventDefault(); this.dragging = true; return; }
            if (e.button !== 0) return;
            e.preventDefault(); canvas.focus({ preventScroll: true });
            if (!this.hasControl()) { this.requestCapture(); return; }
            this.aim(); this.game.attack(this.hoverId);
        });
        listen(document, 'pointerup', () => { this.dragging = false; });
        listen(document, 'keyup', e => { this.game.keyUp(e.code || e.key); });
        listen(window, 'resize', () => { if (this.view) this.view.resize(); });
        listen(window, 'blur', () => { this.background = true; this.releaseCapture(); });
        listen(window, 'focus', () => { this.advanceClock(performance.now(), false); this.background = false; });
        listen(document, 'visibilitychange', () => {
            this.advanceClock(performance.now(), false); this.background = document.hidden;
            this.releaseCapture();
        });
        listen(canvas, 'webglcontextlost', e => { e.preventDefault(); this.renderFailure('การแสดงผล 3D หยุดทำงาน กรุณากลับบทเรียนแล้วโหลดหน้าเว็บใหม่'); });
        const click = (id, fn) => listen(this.el(id), 'click', fn);
        click('lc-start-button', () => this.begin());
        click('lc-back-button', () => this.exit());
        click('lc-help-button', () => { if (this.panel === 'intro') return; this.showPanel('help', 'วิธีเล่น'); });
        click('lc-resume-button', () => this.resume());
        click('lc-exit-button', () => this.requestExit());
        click('lc-stay-button', () => this.resume());
        click('lc-confirm-exit', () => this.exit());
        click('lc-retry-button', () => { this.reset(); this.begin(); });
        click('lc-result-back', () => this.exit());
        click('lc-next-button', () => { this.exit(false); nextLesson(); });
        click('lc-capture', () => this.requestCapture());
        click('lc-error-back', () => this.exit());
        if (!this.reset()) return;
        this.showPanel('intro', 'นักสำรวจโลกอักษร');
        if (this.game.status === 'invalid') {
            this.el('lc-start-button').disabled = true;
            this.el('lc-start-button').textContent = 'บทเรียนนี้ไม่มีตัวอักษรที่เล่นได้';
        } else {
            this.el('lc-start-button').disabled = false; this.el('lc-start-button').textContent = 'เริ่มสำรวจ →';
        }
        this.last = performance.now(); this.frame = requestAnimationFrame(t => this.loop(t));
    },
    reset() {
        this.releaseCapture();
        if (this.view) this.view.dispose();
        this.view = null;
        this.game = new LettercraftGame(this.lessonText);
        try { this.view = new LettercraftView(this.el('lc-canvas'), this.el('lc-labels')); }
        catch (error) { this.renderFailure('เปิดโลก 3D ไม่ได้ กรุณาใช้เบราว์เซอร์ที่รองรับ WebGL และเปิดการเร่งกราฟิก'); return false; }
        this.hoverId = null; this.questSignature = ''; this.last = performance.now();
        this.background = document.hidden; this.renderHUD(); this.view.render(this.game, 0);
        return true;
    },
    begin() {
        if (!this.view || this.game.status === 'invalid') return;
        this.game.start(); this.last = performance.now(); this.hidePanel();
        this.requestCapture();
        if (typeof audioCtx !== 'undefined' && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    },
    showPanel(panel, title) {
        this.game.clearInput(); this.panel = panel; this.releaseCapture();
        for (const name of ['intro', 'help', 'result', 'leave', 'error']) this.el('lc-' + name).hidden = name !== panel;
        this.el('lc-dialog-title').textContent = title; this.el('lc-overlay').hidden = false;
        this.el('lc-overlay').querySelector('.lc-dialog').focus({ preventScroll: true });
    },
    hidePanel() { this.panel = null; this.el('lc-overlay').hidden = true; this.el('lc-canvas').focus({ preventScroll: true }); },
    resume() {
        if (this.game.status === 'won' || this.game.status === 'lost') this.showResult();
        else if (this.game.status === 'ready') this.showPanel('intro', 'นักสำรวจโลกอักษร');
        else { this.hidePanel(); this.requestCapture(); }
    },
    hasControl() { return document.pointerLockElement === this.el('lc-canvas') || this.fallbackActive; },
    updateCaptureHint() {
        const button = this.el('lc-capture');
        button.hidden = !!this.panel || !this.game || this.game.status !== 'playing' || this.hasControl();
        button.textContent = this.fallback ? 'คลิกเพื่อเล่น • ลากเมาส์ขวาเพื่อมอง (ล็อกเมาส์ไม่ได้)' : 'คลิกเพื่อสำรวจ • ล็อกเมาส์';
    },
    requestCapture() {
        if (this.panel || this.game.status !== 'playing' || this.hasControl() || this.capturePending) return;
        const canvas = this.el('lc-canvas'); canvas.focus({ preventScroll: true });
        if (this.fallback) { this.fallbackActive = true; this.updateCaptureHint(); return; }
        if (!canvas.requestPointerLock) { this.captureFailed(); return; }
        this.capturePending = true;
        try {
            const request = canvas.requestPointerLock();
            if (request && typeof request.catch === 'function') request.catch(() => this.captureFailed());
        } catch (error) { this.captureFailed(); }
    },
    captureFailed() {
        this.capturePending = false;
        if (!state.isGameMode || this.hasControl()) return;
        this.fallback = true; this.updateCaptureHint();
        this.game.say('เบราว์เซอร์ไม่อนุญาตล็อกเมาส์ ใช้คลิกเล่น แล้วลากเมาส์ขวาเพื่อมอง');
    },
    releaseCapture() {
        if (this.game) this.game.clearInput();
        this.fallbackActive = false; this.dragging = false;
        if (document.pointerLockElement === this.el('lc-canvas')) document.exitPointerLock();
        this.updateCaptureHint();
    },
    renderFailure(message) {
        if (this.frame !== null) cancelAnimationFrame(this.frame);
        this.frame = null; this.showPanel('error', 'เปิดโลก 3D ไม่ได้');
        this.el('lc-error-message').textContent = message;
    },
    requestExit() {
        if (this.game.status === 'playing') this.showPanel('leave', 'กลับบทเรียน?'); else this.exit();
    },
    keyDown(e) {
        if (e.key === 'Tab') {
            if (!this.panel) this.releaseCapture();
            if (this.panel) {
                const buttons = [...this.el('lc-overlay').querySelectorAll('button')].filter(b => !b.disabled && b.getClientRects().length);
                const current = buttons.indexOf(document.activeElement);
                if (buttons.length) { e.preventDefault(); buttons[(current + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus(); }
            }
            return;
        }
        if (e.key === 'Escape') {
            this.releaseCapture();
            if (this.panel === 'help' || this.panel === 'leave') this.hidePanel();
            this.updateCaptureHint(); return;
        }
        if (this.panel || !this.hasControl()) return;
        if (e.ctrlKey || e.metaKey || e.altKey) { this.game.clearInput(); return; }
        if (e.key.length === 1 || e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
        if (e.repeat && !this.game.keys.has(e.code || e.key)) return;
        if (e.isComposing || e.key === 'Process') { this.game.clearInput(); this.game.say('ใช้แป้นพิมพ์ไทยหรืออังกฤษแบบปกติเพื่อเก็บตัวอักษร'); return; }
        this.game.keyDown(e.code || e.key, getVirtualChar(e.key), e.key);
    },
    aim() {
        this.hoverId = this.panel || !this.view ? null : this.view.pick(this.game);
    },
    advanceClock(now, active) {
        const seconds = Math.max(0, (now - this.last) / 1000); this.last = now;
        if (!active || seconds > 0.5) this.game.update(seconds, false);
        else {
            // Fixed-sized simulation steps keep three-second holds independent of frame rate.
            let left = seconds;
            while (left > 0.000001) { const step = Math.min(0.05, left); this.game.update(step, true); left -= step; }
        }
    },
    loop(now) {
        if (!state.isGameMode || !this.view || this.panel === 'error') return;
        const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
        this.advanceClock(now, !this.panel && !this.background && !document.hidden && this.hasControl());
        this.view.updateCamera(this.game, dt);
        this.aim(); this.view.render(this.game, dt, this.hoverId);
        // Ray and camera follow the player even while the mouse stays still.
        this.aim(); this.renderHUD();
        for (const event of this.game.events) {
            if (['hit','collect','tool','warning'].includes(event.kind) && state.isSoundOn) playSound(true);
        }
        this.game.events.length = 0;
        if ((this.game.status === 'won' || this.game.status === 'lost') && this.panel !== 'result') this.showResult();
        this.frame = requestAnimationFrame(t => this.loop(t));
    },
    renderHUD() {
        const g = this.game, seconds = Math.ceil(g.remaining);
        this.el('lc-time').textContent = String(Math.floor(seconds / 60)).padStart(2,'0') + ':' + String(seconds % 60).padStart(2,'0');
        this.el('lc-time').classList.toggle('lc-urgent', seconds <= 60);
        this.el('lc-count').textContent = g.collected + ' / ' + g.goal;
        this.el('lc-mission-fill').style.width = (g.goal ? g.collected / g.goal * 100 : 0) + '%';
        const levels = ['ไม้', 'หิน ×2', 'คริสตัล ×3'];
        for (const tool of ['pickaxe','axe','sword']) {
            this.el('lc-'+tool).textContent = levels[g.tools[tool]];
            this.el('lc-'+tool).parentElement.classList.toggle('lc-equipped', (g.activeTool || 'pickaxe') === tool);
        }
        const signature = JSON.stringify(g.inventory);
        if (signature !== this.questSignature) {
            this.questSignature = signature; const bag = this.el('lc-quest'); bag.replaceChildren();
            for (const [c, required] of Object.entries(g.goals)) {
                const item = document.createElement('span'); item.textContent = this.displayChar(c);
                const count = document.createElement('small'); count.textContent = (g.inventory[c] || 0) + '/' + required; item.append(count);
                item.classList.toggle('lc-collected', !g.needs(c)); item.title = 'ตัวอักษร ' + c; bag.append(item);
            }
        }
        const selected = g.selectedDrop(), entity = g.entities.find(e=>e.id===this.hoverId);
        const hoveredDrop = g.drops.find(d => d.id === this.hoverId && d.kind === 'letter');
        let hint = 'WASD / ลูกศร เดิน • Space กระโดด • ล้อเมาส์ซูม • คลิกซ้ายขุดหรือฟัน';
        if (selected) hint = 'กด [ ' + this.displayChar(selected.char) + ' ] ค้าง 3 วินาทีเพื่อเก็บ' + (g.collecting ? ' · ' + Math.floor(g.collecting.elapsed/3*100) + '%' : ' · ใช้ลูกศรเดินออก');
        else if (entity) hint = (entity.kind==='animal'?({pig:'หมู',cow:'วัว',goat:'แพะ',sheep:'แกะ',chicken:'ไก่'})[entity.species]:({rock:'หิน',tree:'ต้นไม้'})[entity.kind]) + ' [ ' + this.displayChar(entity.char) + ' ] · ' + (Math.hypot(entity.x-g.player.x,entity.y-g.player.y)>1.85?'เดินเข้าไปใกล้อีกนิด':'คลิกซ้ายเพื่อ'+(entity.kind==='rock'?'ขุด':'ฟัน')) + ' · ' + entity.hp + '/' + entity.maxHp;
        if ((hoveredDrop && !g.needs(hoveredDrop.char)) || (entity && !g.needs(entity.char))) hint = 'ตัวอักษร [ ' + this.displayChar((hoveredDrop || entity).char) + ' ] ครบแล้ว · สำรวจหาตัวที่ยังขาดในกระเป๋า';
        this.el('lc-context').textContent = hint;
        this.el('lc-toast').hidden = g.messageTime <= 0; this.el('lc-toast').textContent = g.message;
        this.updateCaptureHint();
    },
    showResult() {
        const g = this.game, won = g.status === 'won';
        this.showPanel('result', won ? 'ภารกิจสำเร็จ!' : 'หมดเวลาแล้ว');
        this.el('lc-result-icon').textContent = won ? '🏆' : '🌱';
        this.el('lc-result-message').textContent = won ? 'ยอดเยี่ยม! คุณเก็บตัวอักษรครบแล้ว' : 'คุณทำได้ดีแล้ว ลองสำรวจใหม่อีกครั้งนะ';
        this.el('lc-result-count').textContent = g.collected + ' / ' + g.goal;
        this.el('lc-result-time').textContent = Math.floor(g.elapsed/60) + ':' + String(Math.floor(g.elapsed%60)).padStart(2,'0');
        this.el('lc-next-button').hidden = !won;
        this.el('lc-next-button').textContent = state.lessonIndex >= curriculum[state.lang].length-1 ? 'จบหลักสูตร 🎉' : 'บทเรียนถัดไป →';
    },
    dispose() {
        if (this.frame !== null) cancelAnimationFrame(this.frame);
        this.frame = null; if (this.listeners) this.listeners.abort(); this.listeners = null;
        this.releaseCapture();
        if (this.view) this.view.dispose(); this.view = null;
        this.fallback = false; this.capturePending = false;
    },
    exit(showComplete = true) {
        this.dispose(); state.isGameMode = false; this.el('game-ui').style.display = 'none'; this.panel = null;
        if (showComplete) {
            const modal = this.el('modal-complete'); modal.classList.remove('hidden'); modal.style.display = 'flex';
            const btnMini = this.el('btn-mini-game');
            if (state.userSettings && state.userSettings.enableMinigame === false) {
                if (btnMini) btnMini.classList.add('hidden');
                const btnNext = this.el('btn-next-lesson');
                if (btnNext) btnNext.focus();
            } else {
                if (btnMini) btnMini.focus();
            }
        }
    }
};
