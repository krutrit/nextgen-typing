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
