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

  // Verify focus and input isolation
  assert.ok(indexHtml.includes('ArcadeBridge.activeSession'), 'focusInput/handleGlobalKeydown must check ArcadeBridge.activeSession');
});
