const test = require('node:test');
const assert = require('node:assert/strict');

const ArcadeCore = require('../src/arcade/core.js');

test('ArcadeCore exists and exports puzzle game factories', () => {
  assert.ok(ArcadeCore, 'ArcadeCore module must exist in src/arcade/core.js');
  assert.equal(typeof ArcadeCore.createRuneCoder, 'function');
  assert.equal(typeof ArcadeCore.createCrystalReflector, 'function');
  assert.equal(typeof ArcadeCore.createDungeonRelic, 'function');
});

test('Rune Coder: command queue execution, char unlocking, and victory', () => {
  const lessonChars = ['ก', 'ด', 'า', 'ส'];
  const game = ArcadeCore.createRuneCoder({ lessonChars, gridWidth: 5, gridHeight: 5 });

  assert.equal(game.status, 'planning');
  assert.ok(game.targetChar);
  assert.ok(lessonChars.includes(game.targetChar));

  // Step 1: Forward to (1, 0)
  game.addCommand('forward');
  // Step 2: Unlock gate at (2, 0) by typing target character
  game.addCharCommand(game.targetChar);
  // Step 3: Forward through unlocked gate to (2, 0)
  game.addCommand('forward');
  // Step 4: Forward to portal at (3, 0)
  game.addCommand('forward');

  assert.equal(game.queue.length, 4);

  // Spacebar executes the program
  const result = game.execute();
  assert.equal(result.success, true);
  assert.equal(game.status, 'won');
});

test('Rune Coder: fails and resets when hitting obstacle or missing char', () => {
  const lessonChars = ['ฟ', 'ห'];
  const game = ArcadeCore.createRuneCoder({ lessonChars, gridWidth: 4, gridHeight: 4 });

  // Add too many forward commands (hitting wall or locked gate)
  for (let i = 0; i < 6; i++) game.addCommand('forward');

  const result = game.execute();
  assert.equal(result.success, false);
  assert.equal(game.status, 'failed');

  // Reset back to planning
  game.reset();
  assert.equal(game.status, 'planning');
  assert.equal(game.queue.length, 0);
});

test('Crystal Reflector: raycast reflection and typing energize trigger', () => {
  const lessonChars = ['a', 's', 'd'];
  const game = ArcadeCore.createCrystalReflector({ lessonChars, gridWidth: 5, gridHeight: 5 });

  assert.ok(game.laser);
  assert.ok(game.mirrors.length > 0);
  assert.ok(lessonChars.includes(game.obelisk.char));

  // Move hero near mirror using arrows
  const mirror = game.mirrors[0];
  game.hero.x = mirror.x;
  game.hero.y = mirror.y - 1; // adjacent

  // Spacebar rotates mirror angle
  const oldAngle = mirror.angle;
  game.interactSpacebar();
  assert.notEqual(mirror.angle, oldAngle);

  // Align both mirrors to their solution angles
  game.mirrors.forEach(m => { m.angle = m.solutionAngle; });
  const alignedBeam = game.traceBeam();
  assert.equal(alignedBeam.hitsObelisk, true);

  // Type matching lesson character to energize obelisk and open exit
  assert.equal(game.isEnergized, false);
  const typedSuccess = game.typeChar(game.obelisk.char);
  assert.equal(typedSuccess, true);
  assert.equal(game.isEnergized, true);
  assert.equal(game.status, 'won');
});

test('Dungeon Relic: Sokoban push, letter unlock, and spacebar undo', () => {
  const lessonChars = ['ม', 'ย', 'ร'];
  const game = ArcadeCore.createDungeonRelic({ lessonChars, gridWidth: 6, gridHeight: 6 });

  assert.ok(game.chests.length > 0);
  assert.ok(game.targets.length > 0);
  assert.equal(game.chests.length, game.targets.length);

  const initialChest = game.chests[0];
  assert.ok(initialChest.locked); // initial chain lock

  // Move hero to chest
  game.hero.x = initialChest.x - 1;
  game.hero.y = initialChest.y;

  // Attempting to push locked chest fails
  const pushedLocked = game.moveHero('right');
  assert.equal(pushedLocked, false);
  assert.equal(game.chests[0].x, game.hero.x + 1);

  // Press lesson character to unlock chest chain
  const unlocked = game.typeChar(initialChest.char);
  assert.equal(unlocked, true);
  assert.equal(game.chests[0].locked, false);

  // Push unlocked chest
  const oldChestX = game.chests[0].x;
  const pushed = game.moveHero('right');
  assert.equal(pushed, true);
  assert.equal(game.chests[0].x, oldChestX + 1);

  // Spacebar undos last move
  game.interactSpacebar();
  assert.equal(game.chests[0].x, oldChestX);
});

test('ArcadeBridge exports required lifecycle methods and lobby management', () => {
  const ArcadeBridge = require('../src/arcade/bridge.js');
  assert.ok(ArcadeBridge);
  assert.equal(typeof ArcadeBridge.openLobby, 'function');
  assert.equal(typeof ArcadeBridge.closeLobby, 'function');
  assert.equal(typeof ArcadeBridge.launchGame, 'function');
  assert.equal(typeof ArcadeBridge.dispose, 'function');
});

test('index.html contains Arcade assets and safe mini-game integration', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

  // Verify stylesheet and script inclusion
  assert.ok(indexHtml.includes('src/arcade/style.css'), 'index.html must include arcade/style.css');
  assert.ok(indexHtml.includes('src/arcade/core.js'), 'index.html must include arcade/core.js');
  assert.ok(indexHtml.includes('src/arcade/view.js'), 'index.html must include arcade/view.js');
  assert.ok(indexHtml.includes('src/arcade/bridge.js'), 'index.html must include arcade/bridge.js');

  // Verify button exists with updated label
  assert.ok(indexHtml.includes('id="btn-mini-game"'), 'index.html must contain btn-mini-game');
  assert.ok(indexHtml.includes('มินิเกมประลองปัญญา'), 'btn-mini-game must display arcade title');

  // Verify header direct launch button has been removed so game is gated behind lesson completion
  assert.strictEqual(indexHtml.includes('id="header-btn-arcade"'), false, 'index.html must NOT contain header-btn-arcade');

  // Verify focus and input isolation
  assert.ok(indexHtml.includes('ArcadeBridge.activeSession'), 'focusInput/handleGlobalKeydown must check ArcadeBridge.activeSession');
});

test('ArcadeView: drawRoundedRect falls back safely when ctx.roundRect is unavailable', () => {
  const ArcadeView = require('../src/arcade/view.js');
  let rectCalled = false;
  const mockCtx = {
    rect: () => { rectCalled = true; },
    // simulate older browser where roundRect is undefined
    roundRect: undefined
  };
  const mockCanvas = { getContext: () => mockCtx, width: 100, height: 100 };
  const view = new ArcadeView(mockCanvas);

  assert.equal(typeof view.drawRoundedRect, 'function');
  view.drawRoundedRect(0, 0, 50, 50, 5);
  assert.equal(rectCalled, true, 'Should use rect fallback when roundRect is undefined');
});

test('ArcadeBridge: launchGame initializes without ReferenceError and sets activeSession', () => {
  const ArcadeCore = require('../src/arcade/core.js');
  const ArcadeView = require('../src/arcade/view.js');
  const ArcadeBridge = require('../src/arcade/bridge.js');

  global.ArcadeCore = ArcadeCore;
  global.ArcadeView = ArcadeView;

  const mockCtx = {
    fillRect: () => {},
    strokeRect: () => {},
    fillText: () => {},
    strokeText: () => {},
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    stroke: () => {},
    fill: () => {},
    setLineDash: () => {},
    roundRect: () => {}
  };

  const mockCanvas = {
    getContext: () => mockCtx,
    width: 640,
    height: 470
  };

  const mockElement = {
    id: '',
    className: '',
    innerHTML: '',
    style: {},
    querySelectorAll: () => [],
    appendChild: () => {},
    remove: () => {},
    getContext: () => mockCtx
  };

  global.document = {
    createElement: () => ({ ...mockElement }),
    body: { appendChild: () => {} },
    getElementById: (id) => (id === 'arcade-canvas' ? mockCanvas : { ...mockElement })
  };
  global.window = {
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  global.requestAnimationFrame = () => 1;
  global.cancelAnimationFrame = () => {};

  // This should succeed without throwing ReferenceError
  ArcadeBridge.launchGame('rune_coder', ['ก', 'ด', 'า']);

  assert.ok(ArcadeBridge.activeSession, 'activeSession should be set');
  assert.equal(ArcadeBridge.activeSession.gameKey, 'rune_coder');
  assert.ok(ArcadeBridge.activeSession.game);
  assert.ok(ArcadeBridge.activeSession.view);

  ArcadeBridge.dispose();
  assert.equal(ArcadeBridge.activeSession, null);
});

test('Rune Coder 2.5D: cardinal commands, execution trace, and procedural solvable stages', () => {
  const lessonChars = ['ก', 'ด', 'า', 'ส', 'ว'];
  for (let stage = 1; stage <= 3; stage++) {
    const game = ArcadeCore.createRuneCoder({ lessonChars, stage, random: true });
    assert.equal(game.stage, stage);
    assert.equal(game.biome, 'elven_glade');
    assert.ok(Array.isArray(game.solutionQueue) && game.solutionQueue.length >= 3, 'Procedural stage must provide a valid solutionQueue');

    // Feed solution commands into queue
    for (const step of game.solutionQueue) {
      if (step.type === 'move') game.addCommand(step.cmd);
      else if (step.type === 'char') game.addCharCommand(step.char);
    }

    const result = game.execute();
    assert.equal(result.success, true, `Stage ${stage} solutionQueue must succeed`);
    assert.equal(game.status, 'won');
    assert.ok(Array.isArray(result.trace) && result.trace.length > 0, 'execute() must return step-by-step animation trace');

    // Verify nextStage advances stage cleanly
    game.nextStage();
    assert.equal(game.stage, stage + 1);
    assert.equal(game.status, 'planning');
  }
});

test('Crystal Reflector 2.5D: procedural solvable optics stages, obstacle collision, and nextStage', () => {
  const lessonChars = ['a', 's', 'd', 'f'];
  for (let stage = 1; stage <= 3; stage++) {
    const game = ArcadeCore.createCrystalReflector({ lessonChars, stage, random: true });
    assert.equal(game.stage, stage);
    assert.equal(game.biome, 'crystal_spire');
    assert.ok(game.mirrors.length >= 2);
    assert.equal(typeof game.moveHero, 'function', 'CrystalReflector must expose obstacle-aware moveHero');

    // Align all mirrors to their solutionAngle and verify beam hits obelisk
    game.mirrors.forEach(m => { m.angle = m.solutionAngle; });
    const beam = game.traceBeam();
    assert.equal(beam.hitsObelisk, true, `Stage ${stage} beam must hit obelisk when mirrors aligned`);

    assert.equal(game.typeChar(game.obelisk.char), true);
    assert.equal(game.status, 'won');

    game.nextStage();
    assert.equal(game.stage, stage + 1);
    assert.equal(game.status, 'playing');
  }
});

test('Dungeon Relic 2.5D: procedural temple stages scale chests and support nextStage', () => {
  const lessonChars = ['ม', 'ย', 'ร', 'น'];
  const stage1 = ArcadeCore.createDungeonRelic({ lessonChars, stage: 1, random: true });
  assert.equal(stage1.stage, 1);
  assert.equal(stage1.biome, 'sun_temple');
  assert.equal(stage1.chests.length, 1);
  assert.equal(stage1.targets.length, 1);

  const stage2 = ArcadeCore.createDungeonRelic({ lessonChars, stage: 2, random: true });
  assert.equal(stage2.stage, 2);
  assert.ok(stage2.chests.length >= 2, 'Stage 2+ should have at least 2 chests');
  assert.equal(stage2.chests.length, stage2.targets.length);

  stage1.nextStage();
  assert.equal(stage1.stage, 2);
  assert.equal(stage1.status, 'playing');
});

test('ArcadeView 2.5D: renders all 3 biomes safely without roundRect/ellipse and supports particles', () => {
  const ArcadeView = require('../src/arcade/view.js');
  const noop = () => {};
  const gradMock = { addColorStop: noop };
  const legacyCtx = {
    fillRect: noop,
    strokeRect: noop,
    fillText: noop,
    strokeText: noop,
    save: noop,
    restore: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    arc: noop,
    rect: noop,
    stroke: noop,
    fill: noop,
    setLineDash: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    createLinearGradient: () => gradMock,
    createRadialGradient: () => gradMock,
    measureText: () => ({ width: 40 })
  };
  const canvas = { getContext: () => legacyCtx, width: 800, height: 560 };
  const view = new ArcadeView(canvas);

  assert.equal(typeof view.spawnBurst, 'function');
  view.spawnBurst(400, 280, '#fbbf24', 8);

  const g1 = ArcadeCore.createRuneCoder({ lessonChars: ['ก', 'ด'], stage: 1, random: true });
  const g2 = ArcadeCore.createCrystalReflector({ lessonChars: ['a', 's'], stage: 1, random: true });
  const g3 = ArcadeCore.createDungeonRelic({ lessonChars: ['ม', 'ย'], stage: 1, random: true });

  assert.doesNotThrow(() => view.renderRuneCoder(g1));
  assert.doesNotThrow(() => view.renderCrystalReflector(g2));
  assert.doesNotThrow(() => view.renderDungeonRelic(g3));
});

test('ArcadeBridge: Lettercraft 3D option is removed from lobby and only 3 MMORPG games are available', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const bridgeSrc = fs.readFileSync(path.join(__dirname, '../src/arcade/bridge.js'), 'utf-8');
  assert.strictEqual(bridgeSrc.includes('data-game="lettercraft_3d"'), false, 'Lobby must not offer lettercraft_3d');
  assert.strictEqual(bridgeSrc.includes('นักสำรวจ 3 มิติ'), false, 'Lobby must not show 3D explorer card');
  assert.ok(bridgeSrc.includes('data-game="rune_coder"'), 'Lobby must contain rune_coder');
  assert.ok(bridgeSrc.includes('data-game="crystal_reflector"'), 'Lobby must contain crystal_reflector');
  assert.ok(bridgeSrc.includes('data-game="dungeon_relic"'), 'Lobby must contain dungeon_relic');
});

test('Arcade Performance: snappy hero tween responsiveness (>= 50% movement in frame 1)', () => {
  const ArcadeView = require('../src/arcade/view.js');
  const mockCanvas = { getContext: () => ({}), width: 800, height: 560 };
  const view = new ArcadeView(mockCanvas);

  const mockGame = { hero: { x: 0, y: 0 } };
  view.syncHeroTween(mockGame);
  assert.equal(view.heroVisual.x, 0);

  // Hero moves to x = 1
  mockGame.hero.x = 1;
  const v1 = view.syncHeroTween(mockGame);
  // Must close at least 0.5 (50%) of the distance on frame 1 to avoid sluggish/dragging feel
  assert.ok(v1.x >= 0.5, `Hero tween rate must be snappy (>= 0.5), got ${v1.x}`);
});

test('Arcade Performance: ArcadeView caches diorama island to eliminate per-frame tile re-draws', () => {
  const ArcadeView = require('../src/arcade/view.js');
  const mockCanvas = { getContext: () => ({}), width: 800, height: 560 };
  const view = new ArcadeView(mockCanvas);

  assert.equal(typeof view.getCachedIsland, 'function', 'ArcadeView must provide getCachedIsland method');
});

test('Arcade Performance: Rune Coder playback step speed is fast and energetic (stepMs <= 160)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const bridgeSrc = fs.readFileSync(path.join(__dirname, '../src/arcade/bridge.js'), 'utf-8');

  const match = bridgeSrc.match(/const\s+stepMs\s*=\s*(\d+);/);
  assert.ok(match, 'bridge.js must define stepMs for Rune Coder playback');
  const stepMs = Number(match[1]);
  assert.ok(stepMs <= 160, `stepMs must be <= 160ms for fast energetic playback, got ${stepMs}ms`);
});
