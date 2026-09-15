/* Lettercraft simulation: no browser dependencies. Time is seconds; positions are map tiles. */
class LettercraftGame {
    constructor(text, rng = Math.random) {
        this.rng = rng; this.size = 32; this.id = 1;
        // angle/pitch describe orbit orientation; facing belongs to the body.
        this.player = { x: 16.5, y: 16.5, angle: 0, pitch: -0.32, facing: 0, moving: false, running: false, swing: 0 };
        this.cameraDistance = 4.4;
        Object.assign(this.player, { z: this.heightAt(16.5,16.5), vz: 0, grounded: true, landing: 0, swingDuration: .22 });
        this.hearts = 5; this.invulnerable = 0; this.elapsed = 0;
        this.status = 'ready'; this.reason = ''; this.goal = 0; this.collected = 0;
        this.goals = Object.create(null); this.inventory = Object.create(null);
        this.entities = []; this.enemies = []; this.drops = []; this.events = [];
        this.tools = { pickaxe: 0, axe: 0, sword: 0 }; this.firstPickaxe = false;
        this.keys = new Map(); this.blocked = new Set(); this.collecting = null;
        this.cooldown = 0; this.nextSpawn = 20; this.flow = null; this.flowTime = 0;
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
        if (x < 0.5 || y < 0.5 || x > this.size - 0.5 || y > this.size - 0.5) return false;
        return !this.entities.some(e => e.id !== ignoreId && Math.abs(x - e.x) < radius + 0.4 && Math.abs(y - e.y) < radius + 0.4);
    }
    move(body, dx, dy, radius = 0.27) {
        // Small substeps prevent tunnelling during knockback and slow frames.
        const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.15));
        for (let i = 0; i < steps; i++) {
            const free=(x,y)=>body===this.player?this.playerCanMove(x,y,radius):this.isFree(x,y,radius,body.id);
            if (free(body.x + dx / steps, body.y)) body.x += dx / steps;
            if (free(body.x, body.y + dy / steps)) body.y += dy / steps;
        }
    }
    collisionBoxes() {
        const boxes=[];
        for (const e of this.entities) {
            const z=this.heightAt(e.x,e.y), box=(r,bottom,top)=>boxes.push({id:e.id,x:e.x,y:e.y,r,bottom:z+bottom,top:z+top});
            if(e.kind==='tree') {box(.4,0,1.7);box(.825,1.65,2.45);box(.64,2.45,3);}
            else box(.4,0,e.kind==='rock'?1.02:1.23);
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
        const e = [...this.entities, ...this.enemies].find(o => o.id === id);
        if (!e) { this.player.swingDuration = this.player.swing = 0.2; this.cooldown = 0.25; return false; }
        if (Math.hypot(e.x - this.player.x, e.y - this.player.y) > 1.85) { this.say('เดินเข้าไปใกล้อีกนิด'); return false; }
        if (!this.lineClear(this.player, e, e.id)) { this.say('มีสิ่งกีดขวางอยู่ข้างหน้า'); return false; }
        const tool = e.kind === 'rock' ? 'pickaxe' : e.kind === 'tree' ? 'axe' : 'sword';
        const level = this.tools[tool];
        this.cooldown = [0.6, 0.45, 0.3][level]; this.player.swingDuration = this.player.swing = 0.22; this.activeTool = tool;
        this.player.facing = Math.atan2(e.y-this.player.y, e.x-this.player.x);
        e.hp -= level + 1; e.stun = e.kind === 'enemy' ? 1.25 : 0.8;
        e.hurtTime=.24;
        this.event('hit', e, { damage: level+1 });
        if (e.hp <= 0) {
            this.entities = this.entities.filter(o => o.id !== id); this.enemies = this.enemies.filter(o => o.id !== id);
            this.drops.push({ id: this.id++, kind: 'letter', char: e.char, x: e.x, y: e.y });
            if ((e.kind === 'rock' && !this.firstPickaxe) || this.rng() < 0.25) {
                this.firstPickaxe = this.firstPickaxe || e.kind === 'rock';
                this.drops.push({ id: this.id++, kind: 'tool', tool, x: e.x + 0.18, y: e.y + 0.18 });
            }
            this.event('break', e, { char: e.char }); this.flowTime = 0;
        } else if (e.kind === 'enemy') {
            const dx = e.x - this.player.x, dy = e.y - this.player.y, len = Math.hypot(dx, dy) || 1;
            this.move(e, dx / len * 0.65, dy / len * 0.65);
        }
        return true;
    }
    buildFlow() {
        const n = this.size, distances = new Int16Array(n * n).fill(-1);
        const x = Math.floor(this.player.x), y = Math.floor(this.player.y), queue = [y * n + x];
        distances[queue[0]] = 0;
        for (let i = 0; i < queue.length; i++) {
            const cell = queue[i], cx = cell % n, cy = Math.floor(cell / n);
            for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
                const nx = cx + dx, ny = cy + dy, next = ny * n + nx;
                if (nx >= 0 && ny >= 0 && nx < n && ny < n && distances[next] < 0 && this.isFree(nx + 0.5, ny + 0.5)) {
                    distances[next] = distances[cell] + 1; queue.push(next);
                }
            }
        }
        this.flow = distances; this.flowTime = 0.5;
    }
    spawnEnemy() {
        if (this.enemies.length >= 3) return;
        if (!this.flow) this.buildFlow();
        const candidates = [];
        for (let y = 1; y < this.size - 1; y++) for (let x = 1; x < this.size - 1; x++) {
            const d = Math.hypot(x + 0.5 - this.player.x, y + 0.5 - this.player.y);
            if (d >= 6 && d <= 7.8 && this.flow[y * this.size + x] >= 0) candidates.push({ x: x + 0.5, y: y + 0.5 });
        }
        if (!candidates.length) return;
        const p = candidates[Math.floor(this.rng() * candidates.length)], chars = Object.keys(this.goals);
        this.enemies.push({ id: this.id++, kind: 'enemy', char: chars[Math.floor(this.rng() * chars.length)], ...p, hp: 4, maxHp: 4, stun: 0 });
        this.say('มอนสเตอร์มาแล้ว! คลิกสู้ หรือเดินหลบ');
    }
    finish(status, reason = '') { this.status = status; this.reason = reason; this.clearInput(); }
    update(seconds, active = true) {
        if (this.status !== 'playing' || !Number.isFinite(seconds) || seconds < 0) return;
        this.elapsed = Math.min(300, this.elapsed + seconds);
        if (this.remaining <= 0.000001) { this.elapsed = 300; this.finish('lost', 'time'); return; }
        if (!active) { this.clearInput(); return; }
        const dt = Math.min(0.05, seconds);
        this.invulnerable = Math.max(0, this.invulnerable - dt); this.cooldown = Math.max(0, this.cooldown - dt);
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
        this.flowTime -= dt;
        if (this.enemies.length && this.flowTime <= 0) this.buildFlow();
        if (this.elapsed >= this.nextSpawn) { this.buildFlow(); this.spawnEnemy(); this.nextSpawn = this.elapsed + 25; }
        for (const e of this.entities) e.hurtTime=Math.max(0,(e.hurtTime||0)-dt);
        for (const e of this.entities) if (e.kind === 'animal') {
            e.stun = Math.max(0, (e.stun || 0) - dt);
            if (!e.stun && Math.hypot(e.x - this.player.x, e.y - this.player.y) > 2) {
                e.wander = (e.wander || 0) + dt * 0.6;
                const x = e.homeX + Math.sin(e.wander) * 0.3, y = e.homeY + Math.cos(e.wander) * 0.3;
                if (Number.isFinite(x) && this.isFree(x, y, 0.25, e.id)) { e.x = x; e.y = y; }
            }
        }
        for (const e of this.enemies) {
            e.stun = Math.max(0, (e.stun || 0) - dt);
            e.hurtTime=Math.max(0,(e.hurtTime||0)-dt);
            e.attackTime=Math.max(0,(e.attackTime||0)-dt);
            e.attackCooldown=Math.max(0,(e.attackCooldown||0)-dt);
            e.moving=false;e.state=e.stun?'hurt':e.attackTime?'attack':'idle';
            const distance = Math.hypot(e.x - this.player.x, e.y - this.player.y);
            // Continue the existing flow-field pursuit; only distant idle enemies patrol.
            if(!e.stun&&distance>=8) {
                e.wanderTime=(e.wanderTime||0)-dt;
                if(e.wanderTime<=0){e.wanderTime=1.5+this.rng()*2;e.wanderAngle=this.rng()*Math.PI*2;e.rest=this.rng()<.25;}
                if(!e.rest){const x=e.x,y=e.y;e.angle=e.wanderAngle;this.move(e,Math.cos(e.angle)*.55*dt,Math.sin(e.angle)*.55*dt);e.moving=Math.hypot(e.x-x,e.y-y)>.0001;e.state='wander';}
            }
            if (!e.stun && !e.attackTime && distance < 8 && distance > 0.55) {
                e.state='chase';
                let target = this.player;
                if (!this.lineClear(e, this.player, null)) {
                    const cx = Math.floor(e.x), cy = Math.floor(e.y); let best = Infinity; target = null;
                    for (const [dx,dy] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]]) {
                        const nx = cx + dx, ny = cy + dy;
                        if (nx < 0 || ny < 0 || nx >= this.size || ny >= this.size) continue;
                        const score = this.flow ? this.flow[ny * this.size + nx] : -1;
                        if (score >= 0 && score < best && this.isFree(nx + 0.5, ny + 0.5)) { best = score; target = { x: nx + 0.5, y: ny + 0.5 }; }
                    }
                }
                if (target) { const dx = target.x - e.x, dy = target.y - e.y, len = Math.hypot(dx,dy) || 1; e.angle = Math.atan2(dy,dx);const x=e.x,y=e.y; this.move(e, dx / len * 2 * dt, dy / len * 2 * dt);e.moving=Math.hypot(e.x-x,e.y-y)>.0001; }
            }
            if (!e.stun && !e.attackCooldown && Math.hypot(e.x - this.player.x, e.y - this.player.y) < 0.7 && Math.abs(this.player.z-this.heightAt(e.x,e.y))<1.1 && this.lineClear(e,this.player,null) && this.invulnerable === 0) {
                e.attackCooldown=1.05;e.attackTime=.3;e.state='attack';e.angle=Math.atan2(this.player.y-e.y,this.player.x-e.x);
                this.hearts--; this.invulnerable = 2; this.cancelCollection(); this.event('hurt', this.player);
                const dx = this.player.x - e.x || 0.3, dy = this.player.y - e.y, len = Math.hypot(dx,dy) || 1;
                this.move(this.player, dx / len, dy / len);
                if (this.hearts <= 0) { this.finish('lost', 'hearts'); return; }
            }
        }
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
      const min={},max={};for(const axis of ['x','y','z']){min[axis]=box.min[axis]-padding;max[axis]=box.max[axis]+padding;}
      const hit=LettercraftView.rayBox(anchor,ray,min,max);
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
    const rightHandTransform={
      x:p.x,y:p.y,z:feet,yaw,
      pivot:shoulder,
      swing:rightSway+attackSwing,
      twist:attackTwist
    };
    parts.push({part:'rightArm',id:null,min:{x:-.12,y:.365-.1,z:.67+breath},max:{x:.12,y:.365+.1,z:1.14+breath},material:11,tint:[.56,.74,.7],transform:rightHandTransform});
    parts.push({part:'rightHand',id:null,min:{x:-.115,y:.365-.1,z:.56+breath},max:{x:.115,y:.365+.1,z:.73+breath},material:15,tint:null,transform:rightHandTransform});

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

    const piece=(name,y,z,d,h,material=metal.mat,tint=metal.tint,w=.12,x=.075)=>heldPart(name,x,y,z+breath,w,d,h,material,tint);
    if(tool==='sword') {
      piece('heldHandle',.43,.46,.09,.35,4,[.72,.67,.61],.09);
      piece('heldPommel',.43,.40,.14,.09,8,[1,.8,.5]);
      piece('heldGuard',.43,.79,.5,.08,8,[1,.87,.65],.15);
      piece('heldBlade',.43,.86,.19,.64);
      piece('heldRidge',.43,.88,.055,.60,7,[.9,1,1],.025,.01);
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
    const recoil=Math.max(0,((game.invulnerable||0)-1.7)/.3);
    if(recoil)for(const b of parts)if(!b.part.endsWith('Leg')&&!b.part.endsWith('Boot')) {b.min.x-=recoil*.08;b.max.x-=recoil*.08;b.tint=[1.25,.93,.85];}
    return parts;
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
        const a=Number.isFinite(e.angle)?e.angle:Math.PI,c=Math.cos(a),s=Math.sin(a);
        const walk=e.moving?Math.sin(this.time*10)*.15:0,attack=Math.sin(Math.min(1,(e.attackTime||0)/.3)*Math.PI)*.35;
        const bob=Math.sin(this.time*2+e.id)*.012,flash=e.hurtTime>0?[1.5,1.1,.82]:null;
        for(const side of [-1,1]) {
          cube(x-s*side*.22+c*walk*side,y+c*side*.22+s*walk*side,z+Math.max(0,walk*side)*.25,.28,.25,.35,5,e.id,flash||[.65,.85,.8]);
          cube(x-s*side*.44+c*(attack-walk*side),y+c*side*.44+s*(attack-walk*side),z+.61+bob+attack*.25,.22,.22,.48,5,e.id,flash||[.85,1.05,.9]);
        }
        cube(x,y,z+.3+bob,.55,.68,.76,5,e.id,flash);
        cube(x,y,z+1.06+bob,.74,.74,.53,5,e.id,flash||[1.15,1,.82]);
        const face=(side,height,h)=>{
          const dx=c*.38-s*side*.18,dy=s*.38+c*side*.18,scale=.38/Math.max(Math.abs(dx),Math.abs(dy));
          cube(x+dx*scale,y+dy*scale,z+height+bob,.09,.09,h,10,e.id);
        };
        for(const side of [-1,1])face(side,1.34,.13);
        face(0,1.17,.07);
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
      const t=b.transform,p=t.pivot,cs=Math.cos(t.swing),ss=Math.sin(t.swing),cy=Math.cos(t.yaw),sy=Math.sin(t.yaw);
      const twist=t.twist||0,ct=Math.cos(twist),st=Math.sin(twist);
      for(const corner of corners) {
        const x=corner[0]-p.x,y=corner[1]-p.y,z=corner[2]-p.z;
        let rx=x*cs+z*ss,rz=-x*ss+z*cs,ry=y;
        if(twist) {
          const ty=ry*ct-rz*st,tz=ry*st+rz*ct;
          ry=ty;rz=tz;
        }
        rx+=p.x;ry+=p.y;rz+=p.z;
        corner[0]=t.x+rx*cy-ry*sy;corner[1]=t.y+rx*sy+ry*cy;corner[2]=t.z+rz;
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
    dt=Math.max(0,Math.min(.08,Number(dt)||0));this.time+=dt;
    if(!this.camera||this.cameraGame!==game||this.cameraPlayer!==game.player)this.updateCamera(game,0);
    const scene=this._scene(game,this.camera),terrain=this._terrain(game),boxes=[...terrain,...scene.boxes];
    const vertices=this._groundVertices(game,terrain).slice();
    const hurt=new Set([...(game.entities||[]),...(game.enemies||[])].filter(e=>e.hurtTime>0).map(e=>e.id));
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
      if(Number.isFinite(p.item.hp)&&(p.item.kind==='enemy'||p.item.hp<p.item.maxHp)) {
        ctx.fillStyle='#203133';ctx.fillRect(p.x-s/2,p.y-s/2-11,s,5);
        ctx.fillStyle=p.item.kind==='enemy'?'#ffad82':'#f6cb6a';ctx.fillRect(p.x-s/2,p.y-s/2-11,s*Math.max(0,p.item.hp/p.item.maxHp),5);
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
    if(game.invulnerable>0) {ctx.strokeStyle='rgba(193,65,43,'+Math.min(.5,game.invulnerable*.35)+')';ctx.lineWidth=18;ctx.strokeRect(0,0,this.width,this.height);}
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
            if (['hit','collect','tool','hurt','warning'].includes(event.kind) && state.isSoundOn) playSound(event.kind !== 'hurt');
        }
        this.game.events.length = 0;
        if ((this.game.status === 'won' || this.game.status === 'lost') && this.panel !== 'result') this.showResult();
        this.frame = requestAnimationFrame(t => this.loop(t));
    },
    renderHUD() {
        const g = this.game, seconds = Math.ceil(g.remaining);
        this.el('lc-time').textContent = String(Math.floor(seconds / 60)).padStart(2,'0') + ':' + String(seconds % 60).padStart(2,'0');
        this.el('lc-time').classList.toggle('lc-urgent', seconds <= 60);
        this.el('lc-hearts').textContent = '♥ '.repeat(g.hearts) + '♡ '.repeat(5-g.hearts);
        this.el('lc-hearts').setAttribute('aria-label', 'หัวใจเหลือ ' + g.hearts + ' ดวง');
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
        const selected = g.selectedDrop(), entity = [...g.entities,...g.enemies].find(e=>e.id===this.hoverId);
        const hoveredDrop = g.drops.find(d => d.id === this.hoverId && d.kind === 'letter');
        let hint = 'WASD / ลูกศร เดิน • Space กระโดด • ล้อเมาส์ซูม • คลิกซ้ายขุดหรือฟัน';
        if (selected) hint = 'กด [ ' + this.displayChar(selected.char) + ' ] ค้าง 3 วินาทีเพื่อเก็บ' + (g.collecting ? ' · ' + Math.floor(g.collecting.elapsed/3*100) + '%' : ' · ใช้ลูกศรเดินออก');
        else if (entity) hint = ({rock:'หิน',tree:'ต้นไม้',animal:'แกะบล็อก',enemy:'มอนสเตอร์'})[entity.kind] + ' [ ' + this.displayChar(entity.char) + ' ] · ' + (Math.hypot(entity.x-g.player.x,entity.y-g.player.y)>1.85?'เดินเข้าไปใกล้อีกนิด':'คลิกซ้ายเพื่อ'+(entity.kind==='rock'?'ขุด':'ฟัน')) + ' · ' + entity.hp + '/' + entity.maxHp;
        if ((hoveredDrop && !g.needs(hoveredDrop.char)) || (entity && !g.needs(entity.char))) hint = 'ตัวอักษร [ ' + this.displayChar((hoveredDrop || entity).char) + ' ] ครบแล้ว · สำรวจหาตัวที่ยังขาดในกระเป๋า';
        this.el('lc-context').textContent = hint;
        this.el('lc-toast').hidden = g.messageTime <= 0; this.el('lc-toast').textContent = g.message;
        this.updateCaptureHint();
    },
    showResult() {
        const g = this.game, won = g.status === 'won';
        this.showPanel('result', won ? 'ภารกิจสำเร็จ!' : g.reason === 'time' ? 'หมดเวลาแล้ว' : 'หัวใจหมดแล้ว');
        this.el('lc-result-icon').textContent = won ? '🏆' : '🌱';
        this.el('lc-result-message').textContent = won ? 'ยอดเยี่ยม! คุณเก็บตัวอักษรครบแล้ว' : 'คุณทำได้ดีแล้ว ลองสำรวจใหม่อีกครั้งนะ';
        this.el('lc-result-count').textContent = g.collected + ' / ' + g.goal;
        this.el('lc-result-time').textContent = Math.floor(g.elapsed/60) + ':' + String(Math.floor(g.elapsed%60)).padStart(2,'0');
        this.el('lc-result-hearts').textContent = g.hearts + ' ♥';
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
function startMiniGame() {
    if (state.userSettings && state.userSettings.enableMinigame === false) {
        alert("ผู้ดูแลระบบได้ปิดใช้งานเกมท้ายบทเรียนไว้ในขณะนี้");
        return;
    }
    Lettercraft.mount();
}
function handleGameInput(e) { Lettercraft.keyDown(e); }
