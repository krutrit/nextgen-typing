// Small bootstrap kept in the typing page. The game runtime is fetched only
// after the lesson UI is usable, then reused when the student starts playing.
var LettercraftLoader = {
    assetVersion: '__LETTERCRAFT_VERSION__',
    promise: null,
    startPromise: null,
    resources: {},
    loadResource(kind) {
        if (this.resources[kind]) return this.resources[kind];
        if (kind === 'runtime' && typeof Lettercraft !== 'undefined') return Promise.resolve(Lettercraft);
        const isStyle = kind === 'styles';
        const id = isStyle ? 'lettercraft-styles' : 'lettercraft-runtime';
        const pending = new Promise((resolve, reject) => {
            let node = document.getElementById(id);
            if (node && (node.dataset.ready === 'true' || (isStyle && node.sheet))) { resolve(); return; }
            const fresh = !node;
            if (!node) {
                node = document.createElement(isStyle ? 'link' : 'script'); node.id = id;
                if (isStyle) { node.rel = 'stylesheet'; node.href = 'lettercraft.css?v=' + this.assetVersion; }
                else { node.src = 'lettercraft.bundle.js?v=' + this.assetVersion; node.async = true; }
            }
            const finish = error => {
                clearTimeout(timer); node.removeEventListener('load', loaded); node.removeEventListener('error', failed);
                if (error) { node.remove(); reject(error); }
                else { node.dataset.ready = 'true'; resolve(isStyle ? undefined : Lettercraft); }
            };
            const loaded = () => finish(!isStyle && typeof Lettercraft === 'undefined' ? new Error('ไม่พบระบบเกม') : null);
            const failed = () => finish(new Error('โหลดไฟล์เกมไม่สำเร็จ'));
            const timer = setTimeout(() => finish(new Error('หมดเวลาโหลดเกม')), 15000);
            node.addEventListener('load', loaded, { once: true }); node.addEventListener('error', failed, { once: true });
            if (fresh) document.head.appendChild(node);
        });
        this.resources[kind] = pending.catch(error => { delete this.resources[kind]; throw error; });
        return this.resources[kind];
    },
    preload() {
        if (this.promise) return this.promise;
        window.__lettercraftLoadState = 'loading';
        const css = this.loadResource('styles');
        const runtime = this.loadResource('runtime');
        this.promise = Promise.all([css, runtime]).then(([, game]) => {
            window.__lettercraftLoadState = 'ready';
            return game;
        }).catch(error => {
            window.__lettercraftLoadState = 'error'; this.promise = null; throw error;
        });
        return this.promise;
    }
};

function scheduleLettercraftPreload() {
    if (window.__lettercraftPreloadScheduled) return;
    window.__lettercraftPreloadScheduled = true;
    const run = () => LettercraftLoader.preload().catch(error => console.warn('เตรียมเกมเบื้องหลังไม่สำเร็จ:', error));
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 5000 });
    else setTimeout(run, 1500);
}

function startMiniGame() {
    if (state.userSettings && state.userSettings.enableMinigame === false) {
        alert('ผู้ดูแลระบบได้ปิดใช้งานเกมท้ายบทเรียนไว้ในขณะนี้');
        return Promise.resolve(false);
    }
    if (LettercraftLoader.startPromise) return LettercraftLoader.startPromise;
    const button = document.getElementById('btn-mini-game');
    const wasDisabled = button && button.disabled;
    if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
    LettercraftLoader.startPromise = LettercraftLoader.preload().then(() => {
        if (state.userSettings && state.userSettings.enableMinigame === false) return false;
        Lettercraft.mount(); return true;
    }).catch(error => {
        console.error(error);
        alert('ไม่สามารถเตรียมเกมได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง');
        return false;
    }).finally(() => { LettercraftLoader.startPromise = null; if (button) { button.disabled = wasDisabled; button.removeAttribute('aria-busy'); } });
    return LettercraftLoader.startPromise;
}
function handleGameInput(e) { if (typeof Lettercraft !== 'undefined') Lettercraft.keyDown(e); }
