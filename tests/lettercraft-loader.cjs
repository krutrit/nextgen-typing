// Exercise the source bootstrap in a real browser, with network failures only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
(async () => {
 const browser = await chromium.launch({ headless: true, channel: 'chrome' });
 try {
  const page = await browser.newPage();
  let releaseCss, cssRequests = 0, runtimeRequests = 0;
  await page.route('http://loader.test/**', async route => {
   const name = new URL(route.request().url()).pathname.split('/').pop();
   if (name === 'lettercraft.css') {
    cssRequests++;
    if (cssRequests === 1) { await new Promise(resolve => releaseCss = resolve); return route.abort(); }
    return route.fulfill({ contentType: 'text/css', body: fs.readFileSync(path.join(root, name), 'utf8') });
   }
   if (name === 'lettercraft.bundle.js') {
    runtimeRequests++;
    return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(root, name), 'utf8') });
   }
   return route.fulfill({ contentType: 'text/html', body: '<input id="typing"><button id="btn-mini-game">Play</button>' });
  });
  await page.goto('http://loader.test/project/');
  await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'src/lettercraft/loader.js'), 'utf8') });
  await page.evaluate(() => { document.getElementById('typing').focus(); window.pending = LettercraftLoader.preload().catch(() => false); });
  await page.waitForFunction(() => typeof Lettercraft !== 'undefined');
  assert.equal(await page.evaluate(() => { const first = LettercraftLoader.promise; return LettercraftLoader.preload() === first; }), true, 'runtime alone must not bypass pending CSS');
  releaseCss();
  assert.equal(await page.evaluate(() => window.pending), false);
  await page.evaluate(() => LettercraftLoader.preload());
  assert.equal(cssRequests, 2, 'failed CSS must be fetched again');
  assert.equal(runtimeRequests, 1, 'successful runtime must not execute twice after CSS retry');
  assert.deepEqual(await page.evaluate(() => ({ state: window.__lettercraftLoadState, game: Lettercraft.game, view: Lettercraft.view, focus: document.activeElement.id })), { state: 'ready', game: null, view: null, focus: 'typing' });
  // Reload only the bootstrap to test it independently of generated bridge handlers.
  await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'src/lettercraft/loader.js'), 'utf8') });
  await page.evaluate(() => {
   window.state = { userSettings: { enableMinigame: true } };
   document.getElementById('lettercraft-styles').remove();
  });
  let releasePending;
  await page.route('**/lettercraft.css*', async route => {
   await new Promise(resolve => releasePending = resolve);
   await route.fulfill({ contentType: 'text/css', body: '' });
  });
  await page.evaluate(() => { window.startResult = startMiniGame(); state.userSettings.enableMinigame = false; });
  await page.waitForFunction(() => document.getElementById('btn-mini-game').getAttribute('aria-busy') === 'true');
  while (!releasePending) await new Promise(resolve => setTimeout(resolve, 10));
  releasePending();
  assert.equal(await page.evaluate(() => window.startResult), false, 'admin disabling during load must prevent mounting');
  assert.deepEqual(await page.evaluate(() => ({ disabled: document.getElementById('btn-mini-game').disabled, busy: document.getElementById('btn-mini-game').hasAttribute('aria-busy'), game: Lettercraft.game })), { disabled: false, busy: false, game: null });
  await page.unroute('**/lettercraft.css*');
  await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'src/lettercraft/loader.js'), 'utf8') });
  await page.evaluate(() => document.getElementById('lettercraft-styles').remove());
  let releaseTimeout;
  await page.route('**/lettercraft.css*', async route => {
   await new Promise(resolve => releaseTimeout = resolve);
   await route.abort();
  });
  await page.clock.install();
  await page.evaluate(() => { window.timeoutResult = LettercraftLoader.preload().catch(() => false); });
  while (!releaseTimeout) await new Promise(resolve => setTimeout(resolve, 10));
  await page.clock.fastForward(16000);
  assert.equal(await page.evaluate(() => window.timeoutResult), false, 'stalled resources must stop loading after a bounded wait');
  assert.equal(await page.evaluate(() => window.__lettercraftLoadState), 'error');
  releaseTimeout();
  await page.unroute('**/lettercraft.css*');
  await page.evaluate(() => LettercraftLoader.preload());
  assert.equal(await page.evaluate(() => window.__lettercraftLoadState), 'ready', 'timed-out CSS can be retried');
  console.log('PASS: pending CSS is awaited, CSS failure retries without runtime re-execution, background preload preserves focus and creates no game.');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
