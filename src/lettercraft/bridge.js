/* Connect the standalone game to the existing lesson UI. */
const Lettercraft = {
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
            this.el('lc-'+tool).parentElement.classList.toggle('lc-equipped', g.activeTool === tool);
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
        let hint = 'WASD / ลูกศร เดินสำรวจ • เลื่อนเมาส์หัน • คลิกซ้ายขุดหรือฟัน';
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
            this.el('btn-mini-game').focus();
        }
    }
};
function startMiniGame() { Lettercraft.mount(); }
function handleGameInput(e) { Lettercraft.keyDown(e); }
