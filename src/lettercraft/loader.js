// Small bootstrap kept in the typing page. The game runtime is fetched only
// after the lesson UI is usable, then reused when the student starts playing.
var LettercraftLoader = {
    assetVersion: '__LETTERCRAFT_VERSION__',
    promise: null,
    startPromise: null,
    preload() {
        if (typeof Lettercraft !== 'undefined') {
            window.__lettercraftLoadState = 'ready';
            return Promise.resolve(Lettercraft);
        }
        if (this.promise) return this.promise;
        window.__lettercraftLoadState = 'loading';
        const css = new Promise((resolve, reject) => {
            const existing = document.getElementById('lettercraft-styles');
            if (existing) {
                if (existing.dataset.ready === 'true' || existing.sheet) resolve();
                else { existing.addEventListener('load', resolve, { once:true }); existing.addEventListener('error', reject, { once:true }); }
                return;
            }
            const link = document.createElement('link');
            link.id = 'lettercraft-styles'; link.rel = 'stylesheet'; link.href = 'lettercraft.css?v=' + this.assetVersion;
            link.onload = () => { link.dataset.ready = 'true'; resolve(); };
            link.onerror = () => reject(new Error('โหลดรูปแบบเกมไม่สำเร็จ'));
            document.head.appendChild(link);
        });
        const runtime = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'lettercraft.bundle.js?v=' + this.assetVersion; script.async = true;
            script.onload = () => typeof Lettercraft !== 'undefined' ? resolve(Lettercraft) : reject(new Error('ไม่พบระบบเกม'));
            script.onerror = () => reject(new Error('โหลดระบบเกมไม่สำเร็จ'));
            document.head.appendChild(script);
        });
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
    if (button) button.disabled = true;
    LettercraftLoader.startPromise = LettercraftLoader.preload().then(() => { Lettercraft.mount(); return true; }).catch(error => {
        console.error(error);
        alert('ไม่สามารถเตรียมเกมได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง');
        return false;
    }).finally(() => { LettercraftLoader.startPromise = null; if (button) button.disabled = false; });
    return LettercraftLoader.startPromise;
}
function handleGameInput(e) { if (typeof Lettercraft !== 'undefined') Lettercraft.keyDown(e); }
