// src/arcade/core.js - MMORPG Puzzle Arcade Core Logic Engine
// Pure logic, zero DOM dependencies for complete testability

function pickRandom(arr) {
  if (!arr || arr.length === 0) return 'A';
  return arr[Math.floor(Math.random() * arr.length)];
}

// -------------------------------------------------------------
// Game 1: Rune Coder (Scratch-style Algorithmic Program Execution)
// -------------------------------------------------------------
function createRuneCoder(options = {}) {
  const width = options.gridWidth || 5;
  const height = options.gridHeight || 5;
  const chars = (options.lessonChars && options.lessonChars.length) ? options.lessonChars : ['ก', 'ด', 'า'];
  const targetChar = pickRandom(chars);

  const hero = { x: 0, y: 0, dir: 'right' }; // right, down, left, up
  const gate = { x: 2, y: 0, char: targetChar, unlocked: false };
  const goal = { x: 3, y: 0 };
  const walls = new Set([`1,1`, `2,1`, `3,1`]);

  const game = {
    type: 'rune_coder',
    width,
    height,
    hero: { ...hero },
    initialHero: { ...hero },
    gate: { ...gate },
    goal: { ...goal },
    targetChar,
    walls,
    queue: [],
    status: 'planning', // planning, executing, won, failed
    executionStep: 0,
    history: [],

    addCommand(cmd) {
      if (this.status !== 'planning') return;
      this.queue.push({ type: 'move', cmd });
    },

    addCharCommand(char) {
      if (this.status !== 'planning') return;
      this.queue.push({ type: 'char', char });
    },

    removeLastCommand() {
      if (this.status !== 'planning') return;
      this.queue.pop();
    },

    clearCommands() {
      if (this.status !== 'planning') return;
      this.queue = [];
    },

    reset() {
      this.hero = { ...this.initialHero };
      this.gate.unlocked = false;
      this.status = 'planning';
      this.executionStep = 0;
      this.queue = [];
    },

    stepForward(pos, dir) {
      const next = { ...pos };
      if (dir === 'right') next.x++;
      else if (dir === 'left') next.x--;
      else if (dir === 'down') next.y++;
      else if (dir === 'up') next.y--;
      return next;
    },

    stepBackward(pos, dir) {
      const next = { ...pos };
      if (dir === 'right') next.x--;
      else if (dir === 'left') next.x++;
      else if (dir === 'down') next.y--;
      else if (dir === 'up') next.y++;
      return next;
    },

    turnLeft(dir) {
      const order = ['up', 'left', 'down', 'right'];
      const idx = order.indexOf(dir);
      return order[(idx + 1) % 4];
    },

    turnRight(dir) {
      const order = ['up', 'right', 'down', 'left'];
      const idx = order.indexOf(dir);
      return order[(idx + 1) % 4];
    },

    execute() {
      this.status = 'executing';
      this.hero = { ...this.initialHero };
      this.gate.unlocked = false;

      for (let i = 0; i < this.queue.length; i++) {
        const item = this.queue[i];

        if (item.type === 'char') {
          if (item.char === this.gate.char) {
            this.gate.unlocked = true;
          }
        } else if (item.type === 'move') {
          if (item.cmd === 'forward') {
            const next = this.stepForward(this.hero, this.hero.dir);
            // Check out of bounds
            if (next.x < 0 || next.x >= this.width || next.y < 0 || next.y >= this.height) {
              this.status = 'failed';
              return { success: false, reason: 'wall_hit' };
            }
            // Check walls
            if (this.walls.has(`${next.x},${next.y}`)) {
              this.status = 'failed';
              return { success: false, reason: 'wall_hit' };
            }
            // Check locked gate
            if (next.x === this.gate.x && next.y === this.gate.y && !this.gate.unlocked) {
              this.status = 'failed';
              return { success: false, reason: 'locked_gate' };
            }
            this.hero.x = next.x;
            this.hero.y = next.y;
          } else if (item.cmd === 'backward') {
            const next = this.stepBackward(this.hero, this.hero.dir);
            if (next.x < 0 || next.x >= this.width || next.y < 0 || next.y >= this.height) {
              this.status = 'failed';
              return { success: false, reason: 'wall_hit' };
            }
            this.hero.x = next.x;
            this.hero.y = next.y;
          } else if (item.cmd === 'left') {
            this.hero.dir = this.turnLeft(this.hero.dir);
          } else if (item.cmd === 'right') {
            this.hero.dir = this.turnRight(this.hero.dir);
          }
        }
      }

      if (this.hero.x === this.goal.x && this.hero.y === this.goal.y) {
        this.status = 'won';
        return { success: true };
      }

      this.status = 'failed';
      return { success: false, reason: 'not_reached' };
    }
  };

  return game;
}

// -------------------------------------------------------------
// Game 2: Crystal Reflector (Optics & Beam Trigger Strategy)
// -------------------------------------------------------------
function createCrystalReflector(options = {}) {
  const width = options.gridWidth || 5;
  const height = options.gridHeight || 5;
  const chars = (options.lessonChars && options.lessonChars.length) ? options.lessonChars : ['a', 's', 'd'];
  const obeliskChar = pickRandom(chars);

  const laser = { x: 0, y: 1, dir: 'right' };
  const mirrors = [
    { x: 3, y: 1, angle: 0, solutionAngle: 45 }, // 45 deflects right beam down
    { x: 3, y: 3, angle: 0, solutionAngle: 135 } // 135 deflects down beam left
  ];
  const obelisk = { x: 1, y: 3, char: obeliskChar };
  const hero = { x: 0, y: 0 };

  const game = {
    type: 'crystal_reflector',
    width,
    height,
    hero,
    laser,
    mirrors,
    obelisk,
    isEnergized: false,
    status: 'playing', // playing, won

    interactSpacebar() {
      // Find adjacent mirror
      for (const m of this.mirrors) {
        const dist = Math.abs(this.hero.x - m.x) + Math.abs(this.hero.y - m.y);
        if (dist <= 1) {
          m.angle = (m.angle + 45) % 360;
          return true;
        }
      }
      return false;
    },

    traceBeam() {
      const path = [{ x: this.laser.x, y: this.laser.y }];
      let cx = this.laser.x;
      let cy = this.laser.y;
      let cdir = this.laser.dir;
      let hitsObelisk = false;

      for (let step = 0; step < 20; step++) {
        if (cdir === 'right') cx++;
        else if (cdir === 'left') cx--;
        else if (cdir === 'down') cy++;
        else if (cdir === 'up') cy--;

        if (cx < 0 || cx >= this.width || cy < 0 || cy >= this.height) {
          path.push({ x: cx, y: cy });
          break;
        }

        path.push({ x: cx, y: cy });

        if (cx === this.obelisk.x && cy === this.obelisk.y) {
          hitsObelisk = true;
          break;
        }

        // Check mirror reflections
        const mirror = this.mirrors.find(m => m.x === cx && m.y === cy);
        if (mirror) {
          if (cdir === 'right' && mirror.angle === 45) cdir = 'down';
          else if (cdir === 'down' && mirror.angle === 135) cdir = 'left';
          else if (cdir === 'up' && mirror.angle === 45) cdir = 'left';
          else if (cdir === 'left' && mirror.angle === 135) cdir = 'up';
          else {
            // Beam blocked by unaligned mirror
            break;
          }
        }
      }

      return { path, hitsObelisk };
    },

    typeChar(char) {
      const beam = this.traceBeam();
      if (beam.hitsObelisk && char === this.obelisk.char) {
        this.isEnergized = true;
        this.status = 'won';
        return true;
      }
      return false;
    }
  };

  return game;
}

// -------------------------------------------------------------
// Game 3: Dungeon Relic (Sokoban Strategic Push & Undo)
// -------------------------------------------------------------
function createDungeonRelic(options = {}) {
  const width = options.gridWidth || 6;
  const height = options.gridHeight || 6;
  const chars = (options.lessonChars && options.lessonChars.length) ? options.lessonChars : ['ม', 'ย', 'ร'];
  const char = pickRandom(chars);

  const hero = { x: 1, y: 2 };
  const chests = [{ id: 1, x: 2, y: 2, char: char, locked: true }];
  const targets = [{ id: 1, x: 4, y: 2, char: char }];
  const walls = new Set();

  // Outer border
  for (let x = 0; x < width; x++) {
    walls.add(`${x},0`);
    walls.add(`${x},${height - 1}`);
  }
  for (let y = 0; y < height; y++) {
    walls.add(`0,${y}`);
    walls.add(`${width - 1},${y}`);
  }

  const game = {
    type: 'dungeon_relic',
    width,
    height,
    hero: { ...hero },
    chests: chests.map(c => ({ ...c })),
    targets,
    walls,
    history: [],
    status: 'playing',

    typeChar(c) {
      let unlockedAny = false;
      for (const chest of this.chests) {
        const dist = Math.abs(this.hero.x - chest.x) + Math.abs(this.hero.y - chest.y);
        if (dist <= 1 && chest.char === c) {
          chest.locked = false;
          unlockedAny = true;
        }
      }
      return unlockedAny;
    },

    moveHero(dir) {
      let dx = 0;
      let dy = 0;
      if (dir === 'up') dy = -1;
      else if (dir === 'down') dy = 1;
      else if (dir === 'left') dx = -1;
      else if (dir === 'right') dx = 1;

      const nextX = this.hero.x + dx;
      const nextY = this.hero.y + dy;

      if (this.walls.has(`${nextX},${nextY}`)) return false;

      const chest = this.chests.find(c => c.x === nextX && c.y === nextY);
      if (chest) {
        if (chest.locked) return false;

        const chestNextX = chest.x + dx;
        const chestNextY = chest.y + dy;

        if (this.walls.has(`${chestNextX},${chestNextY}`)) return false;
        if (this.chests.some(c => c.x === chestNextX && c.y === chestNextY)) return false;

        // Push allowed, save history for undo
        this.history.push({
          hero: { ...this.hero },
          chests: this.chests.map(c => ({ ...c }))
        });

        chest.x = chestNextX;
        chest.y = chestNextY;
        this.hero.x = nextX;
        this.hero.y = nextY;

        this.checkWin();
        return true;
      }

      // Normal step
      this.history.push({
        hero: { ...this.hero },
        chests: this.chests.map(c => ({ ...c }))
      });
      this.hero.x = nextX;
      this.hero.y = nextY;
      return true;
    },

    interactSpacebar() {
      // Undo last move
      if (this.history.length === 0) return false;
      const prev = this.history.pop();
      this.hero = { ...prev.hero };
      this.chests = prev.chests.map(c => ({ ...c }));
      this.status = 'playing';
      return true;
    },

    checkWin() {
      const allMatched = this.chests.every(c =>
        this.targets.some(t => t.x === c.x && t.y === c.y && t.char === c.char)
      );
      if (allMatched) {
        this.status = 'won';
      }
    }
  };

  return game;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createRuneCoder,
    createCrystalReflector,
    createDungeonRelic
  };
}
if (typeof window !== 'undefined') {
  window.ArcadeCore = {
    createRuneCoder,
    createCrystalReflector,
    createDungeonRelic
  };
}
