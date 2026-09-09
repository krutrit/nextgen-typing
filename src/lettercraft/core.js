/* Lettercraft simulation: no browser dependencies. Time is seconds; positions are map tiles. */
class LettercraftGame {
    constructor(text, rng = Math.random) {
        this.rng = rng; this.size = 32; this.id = 1;
        this.player = { x: 16.5, y: 16.5, angle: 0, pitch: -0.22, swing: 0 };
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
        if (this.collecting) return this.drops.find(d => d.id === this.collecting.dropId) || null;
        let best = null, distance = 1.35;
        for (const d of this.drops) {
            const dist = Math.hypot(d.x - this.player.x, d.y - this.player.y);
            if (d.kind === 'letter' && this.needs(d.char) && dist < distance) { best = d; distance = dist; }
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
    clearInput() { this.cancelCollection(); this.keys.clear(); this.blocked.clear(); }
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
            if (this.isFree(body.x + dx / steps, body.y, radius, body.id)) body.x += dx / steps;
            if (this.isFree(body.x, body.y + dy / steps, radius, body.id)) body.y += dy / steps;
        }
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
        if (!e) { this.player.swing = 0.2; this.cooldown = 0.25; return false; }
        if (Math.hypot(e.x - this.player.x, e.y - this.player.y) > 1.85) { this.say('เดินเข้าไปใกล้อีกนิด'); return false; }
        if (!this.lineClear(this.player, e, e.id)) { this.say('มีสิ่งกีดขวางอยู่ข้างหน้า'); return false; }
        const tool = e.kind === 'rock' ? 'pickaxe' : e.kind === 'tree' ? 'axe' : 'sword';
        const level = this.tools[tool];
        this.cooldown = [0.6, 0.45, 0.3][level]; this.player.swing = 0.22; this.activeTool = tool;
        e.hp -= level + 1; e.stun = e.kind === 'enemy' ? 1.25 : 0.8;
        this.event('hit', e);
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
        if (dir.moving) { this.cancelCollection(); this.move(this.player, dir.x * 3.5 * dt, dir.y * 3.5 * dt); }
        this.flowTime -= dt;
        if (this.enemies.length && this.flowTime <= 0) this.buildFlow();
        if (this.elapsed >= this.nextSpawn) { this.buildFlow(); this.spawnEnemy(); this.nextSpawn = this.elapsed + 25; }
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
            const distance = Math.hypot(e.x - this.player.x, e.y - this.player.y);
            if (!e.stun && distance < 8 && distance > 0.55) {
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
                if (target) { const dx = target.x - e.x, dy = target.y - e.y, len = Math.hypot(dx,dy) || 1; e.angle = Math.atan2(dy,dx); this.move(e, dx / len * 2 * dt, dy / len * 2 * dt); }
            }
            if (!e.stun && Math.hypot(e.x - this.player.x, e.y - this.player.y) < 0.7 && this.invulnerable === 0) {
                this.hearts--; this.invulnerable = 2; this.cancelCollection(); this.event('hurt', this.player);
                const dx = this.player.x - e.x || 0.3, dy = this.player.y - e.y, len = Math.hypot(dx,dy) || 1;
                this.move(this.player, dx / len, dy / len);
                if (this.hearts <= 0) { this.finish('lost', 'hearts'); return; }
            }
        }
        for (const d of [...this.drops]) if (d.kind === 'tool' && Math.hypot(d.x - this.player.x, d.y - this.player.y) < 0.85) {
            this.tools[d.tool] = Math.min(2, this.tools[d.tool] + 1); this.drops = this.drops.filter(o => o.id !== d.id);
            this.event('tool', d, { tool: d.tool }); this.say('ได้อุปกรณ์ใหม่! ฟันหรือขุดเร็วขึ้นแล้ว');
        }
        if (this.collecting) {
            const d = this.drops.find(o => o.id === this.collecting.dropId);
            if (!d || !this.keys.has(this.collecting.code) || Math.hypot(d.x - this.player.x, d.y - this.player.y) > 1.35) { this.cancelCollection(); return; }
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
