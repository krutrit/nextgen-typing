// src/arcade/core.js - MMORPG Puzzle Arcade 2.5D Core Logic Engine
// Pure logic, zero DOM dependencies for complete testability

function pickRandom(arr) {
  if (!arr || arr.length === 0) return 'A';
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickDistinctChars(chars, count) {
  const pool = (chars && chars.length) ? [...chars] : ['ก', 'ด', 'า', 'ส'];
  const result = [];
  for (let i = 0; i < count; i++) {
    const unused = pool.filter(c => !result.includes(c));
    result.push(pickRandom(unused.length > 0 ? unused : pool));
  }
  return result;
}

// -------------------------------------------------------------
// Game 1: Rune Coder (Elven Glade - Scratch-style Sequencing)
// -------------------------------------------------------------
function generateRuneCoderLayout(stage, chars) {
  const width = stage <= 1 ? 6 : 7;
  const height = stage <= 2 ? 5 : 6;
  const targetSteps = Math.min(5 + stage * 2, 11);

  const dirs = [
    { dx: 1, dy: 0, cmd: 'move_right', dir: 'right' },
    { dx: 0, dy: 1, cmd: 'move_down', dir: 'down' },
    { dx: 0, dy: -1, cmd: 'move_up', dir: 'up' },
    { dx: -1, dy: 0, cmd: 'move_left', dir: 'left' }
  ];

  let bestPath = null;
  let bestMoves = null;

  for (let attempt = 0; attempt < 30; attempt++) {
    const startY = randInt(0, height - 1);
    const start = { x: 0, y: startY };
    const path = [start];
    const moves = [];
    const visited = new Set([`${start.x},${start.y}`]);

    for (let step = 0; step < targetSteps; step++) {
      const curr = path[path.length - 1];
      const candidates = dirs.filter(d => {
        const nx = curr.x + d.dx;
        const ny = curr.y + d.dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) return false;
        if (visited.has(`${nx},${ny}`)) return false;
        // Avoid clustering adjacent to too many visited tiles so maze stays readable
        let adjVisited = 0;
        for (const check of dirs) {
          if (visited.has(`${nx + check.dx},${ny + check.dy}`)) adjVisited++;
        }
        return adjVisited <= 1;
      });

      if (candidates.length === 0) break;
      // Slight bias toward moving right/vertical for scenic left-to-right journey
      const chosen = pickRandom(candidates);
      const next = { x: curr.x + chosen.dx, y: curr.y + chosen.dy };
      path.push(next);
      moves.push(chosen.cmd);
      visited.add(`${next.x},${next.y}`);
    }

    if (path.length >= 5 && (!bestPath || path.length > bestPath.length)) {
      bestPath = path;
      bestMoves = moves;
      if (path.length >= targetSteps) break;
    }
  }

  // Fallback guaranteed winding path if random walk fell short
  if (!bestPath || bestPath.length < 5) {
    bestPath = [
      { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 },
      { x: 2, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 4, y: 3 }
    ];
    bestMoves = ['move_right', 'move_right', 'move_down', 'move_down', 'move_right', 'move_right'];
  }

  const pathSet = new Set(bestPath.map(p => `${p.x},${p.y}`));
  const gateCount = stage >= 3 && bestPath.length >= 8 ? 2 : 1;
  const gateChars = pickDistinctChars(chars, gateCount);
  const gates = [];

  if (gateCount === 1) {
    const gateIdx = Math.max(2, Math.min(bestPath.length - 2, Math.floor(bestPath.length / 2)));
    gates.push({
      x: bestPath[gateIdx].x,
      y: bestPath[gateIdx].y,
      char: gateChars[0],
      unlocked: false
    });
  } else {
    const idx1 = Math.max(2, Math.floor(bestPath.length / 3));
    const idx2 = Math.min(bestPath.length - 2, Math.floor((bestPath.length * 2) / 3));
    gates.push({ x: bestPath[idx1].x, y: bestPath[idx1].y, char: gateChars[0], unlocked: false });
    gates.push({ x: bestPath[idx2].x, y: bestPath[idx2].y, char: gateChars[1], unlocked: false });
  }

  // Place forest walls/trees on non-path tiles for atmospheric 2.5D maze feel
  const walls = new Set();
  const decor = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const key = `${x},${y}`;
      if (pathSet.has(key)) continue;
      if (Math.random() < 0.48) {
        walls.add(key);
      } else if (Math.random() < 0.35) {
        decor.push({ x, y, kind: pickRandom(['flower', 'pebble', 'mushroom']) });
      }
    }
  }

  // Construct exact guaranteed solution queue
  const solutionQueue = [];
  for (let i = 0; i < bestMoves.length; i++) {
    const targetTile = bestPath[i + 1];
    const gateAtTarget = gates.find(g => g.x === targetTile.x && g.y === targetTile.y);
    if (gateAtTarget) {
      solutionQueue.push({ type: 'char', char: gateAtTarget.char });
    }
    solutionQueue.push({ type: 'move', cmd: bestMoves[i] });
  }

  const startTile = bestPath[0];
  const goalTile = bestPath[bestPath.length - 1];

  return {
    width,
    height,
    hero: { x: startTile.x, y: startTile.y, dir: 'right' },
    gate: gates[0],
    gates,
    goal: { x: goalTile.x, y: goalTile.y },
    targetChar: gates[0].char,
    walls,
    decor,
    solutionQueue
  };
}

function createRuneCoder(options = {}) {
  const chars = (options.lessonChars && options.lessonChars.length) ? options.lessonChars : ['ก', 'ด', 'า'];
  const isProcedural = Boolean(options.random || options.stage);
  const initialStage = options.stage || (options.random ? 1 : 0);

  function buildState(stageNum, procedural) {
    if (procedural) {
      return generateRuneCoderLayout(stageNum, chars);
    }
    const width = options.gridWidth || 5;
    const height = options.gridHeight || 5;
    const targetChar = pickRandom(chars);
    const gate = { x: 2, y: 0, char: targetChar, unlocked: false };
    return {
      width,
      height,
      hero: { x: 0, y: 0, dir: 'right' },
      gate,
      gates: [gate],
      goal: { x: 3, y: 0 },
      targetChar,
      walls: new Set(['1,1', '2,1', '3,1']),
      decor: [],
      solutionQueue: [
        { type: 'move', cmd: 'forward' },
        { type: 'char', char: targetChar },
        { type: 'move', cmd: 'forward' },
        { type: 'move', cmd: 'forward' }
      ]
    };
  }

  const layout = buildState(initialStage, isProcedural);

  const game = {
    type: 'rune_coder',
    biome: 'elven_glade',
    stage: initialStage,
    lessonChars: chars,
    width: layout.width,
    height: layout.height,
    hero: { ...layout.hero },
    initialHero: { ...layout.hero },
    gate: layout.gate,
    gates: layout.gates,
    goal: { ...layout.goal },
    targetChar: layout.targetChar,
    walls: layout.walls,
    decor: layout.decor,
    solutionQueue: layout.solutionQueue,
    queue: [],
    status: 'planning', // planning, executing, won, failed
    executionStep: 0,
    history: [],

    applyLayout(nextLayout) {
      this.width = nextLayout.width;
      this.height = nextLayout.height;
      this.hero = { ...nextLayout.hero };
      this.initialHero = { ...nextLayout.hero };
      this.gate = nextLayout.gate;
      this.gates = nextLayout.gates;
      this.goal = { ...nextLayout.goal };
      this.targetChar = nextLayout.targetChar;
      this.walls = nextLayout.walls;
      this.decor = nextLayout.decor;
      this.solutionQueue = nextLayout.solutionQueue;
      this.queue = [];
      this.status = 'planning';
      this.executionStep = 0;
    },

    nextStage() {
      this.stage = (this.stage || 1) + 1;
      this.applyLayout(buildState(this.stage, true));
    },

    randomizeStage() {
      this.stage = this.stage || 1;
      this.applyLayout(buildState(this.stage, true));
    },

    addCommand(cmd) {
      if (this.status !== 'planning') return;
      if (this.queue.length >= 16) return;
      this.queue.push({ type: 'move', cmd });
    },

    addCharCommand(char) {
      if (this.status !== 'planning') return;
      if (this.queue.length >= 16) return;
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
      this.gates.forEach(g => { g.unlocked = false; });
      this.gate = this.gates[0];
      this.status = 'planning';
      this.executionStep = 0;
      this.queue = [];
    },

    resetPositionOnly() {
      this.hero = { ...this.initialHero };
      this.gates.forEach(g => { g.unlocked = false; });
      this.gate = this.gates[0];
      this.status = 'planning';
      this.executionStep = 0;
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
      this.gates.forEach(g => { g.unlocked = false; });
      const trace = [];

      const cardinalMap = {
        move_up: { dx: 0, dy: -1, dir: 'up' },
        move_down: { dx: 0, dy: 1, dir: 'down' },
        move_left: { dx: -1, dy: 0, dir: 'left' },
        move_right: { dx: 1, dy: 0, dir: 'right' }
      };

      const checkCollision = (next) => {
        if (next.x < 0 || next.x >= this.width || next.y < 0 || next.y >= this.height) {
          return 'wall_hit';
        }
        if (this.walls.has(`${next.x},${next.y}`)) {
          return 'wall_hit';
        }
        const lockedGate = this.gates.find(g => g.x === next.x && g.y === next.y && !g.unlocked);
        if (lockedGate) {
          return 'locked_gate';
        }
        return null;
      };

      for (let i = 0; i < this.queue.length; i++) {
        const item = this.queue[i];

        if (item.type === 'char') {
          let unlockedGate = null;
          for (const g of this.gates) {
            if (!g.unlocked && g.char === item.char) {
              g.unlocked = true;
              unlockedGate = { x: g.x, y: g.y, char: g.char };
              break;
            }
          }
          trace.push({
            stepIndex: i,
            type: 'char',
            char: item.char,
            hero: { ...this.hero },
            gatesState: this.gates.map(g => g.unlocked),
            unlockedGate,
            event: unlockedGate ? 'unlock' : 'noop_char'
          });
        } else if (item.type === 'move') {
          if (cardinalMap[item.cmd]) {
            const delta = cardinalMap[item.cmd];
            this.hero.dir = delta.dir;
            const next = { x: this.hero.x + delta.dx, y: this.hero.y + delta.dy, dir: delta.dir };
            const failReason = checkCollision(next);
            if (failReason) {
              this.status = 'failed';
              trace.push({
                stepIndex: i,
                type: 'move',
                cmd: item.cmd,
                hero: { ...this.hero },
                attempted: next,
                gatesState: this.gates.map(g => g.unlocked),
                event: failReason
              });
              return { success: false, reason: failReason, trace };
            }
            this.hero.x = next.x;
            this.hero.y = next.y;
            trace.push({
              stepIndex: i,
              type: 'move',
              cmd: item.cmd,
              hero: { ...this.hero },
              gatesState: this.gates.map(g => g.unlocked),
              event: 'move'
            });
          } else if (item.cmd === 'forward') {
            const next = this.stepForward(this.hero, this.hero.dir);
            const failReason = checkCollision(next);
            if (failReason) {
              this.status = 'failed';
              trace.push({
                stepIndex: i,
                type: 'move',
                cmd: item.cmd,
                hero: { ...this.hero },
                attempted: next,
                gatesState: this.gates.map(g => g.unlocked),
                event: failReason
              });
              return { success: false, reason: failReason, trace };
            }
            this.hero.x = next.x;
            this.hero.y = next.y;
            trace.push({
              stepIndex: i,
              type: 'move',
              cmd: item.cmd,
              hero: { ...this.hero },
              gatesState: this.gates.map(g => g.unlocked),
              event: 'move'
            });
          } else if (item.cmd === 'backward') {
            const next = this.stepBackward(this.hero, this.hero.dir);
            const failReason = checkCollision(next);
            if (failReason) {
              this.status = 'failed';
              trace.push({
                stepIndex: i,
                type: 'move',
                cmd: item.cmd,
                hero: { ...this.hero },
                attempted: next,
                gatesState: this.gates.map(g => g.unlocked),
                event: failReason
              });
              return { success: false, reason: failReason, trace };
            }
            this.hero.x = next.x;
            this.hero.y = next.y;
            trace.push({
              stepIndex: i,
              type: 'move',
              cmd: item.cmd,
              hero: { ...this.hero },
              gatesState: this.gates.map(g => g.unlocked),
              event: 'move'
            });
          } else if (item.cmd === 'left') {
            this.hero.dir = this.turnLeft(this.hero.dir);
            trace.push({
              stepIndex: i,
              type: 'move',
              cmd: item.cmd,
              hero: { ...this.hero },
              gatesState: this.gates.map(g => g.unlocked),
              event: 'turn'
            });
          } else if (item.cmd === 'right') {
            this.hero.dir = this.turnRight(this.hero.dir);
            trace.push({
              stepIndex: i,
              type: 'move',
              cmd: item.cmd,
              hero: { ...this.hero },
              gatesState: this.gates.map(g => g.unlocked),
              event: 'turn'
            });
          }
        }
      }

      if (this.hero.x === this.goal.x && this.hero.y === this.goal.y) {
        this.status = 'won';
        trace.push({
          stepIndex: this.queue.length - 1,
          type: 'result',
          hero: { ...this.hero },
          gatesState: this.gates.map(g => g.unlocked),
          event: 'won'
        });
        return { success: true, trace };
      }

      this.status = 'failed';
      return { success: false, reason: 'not_reached', trace };
    }
  };

  return game;
}

// -------------------------------------------------------------
// Game 2: Crystal Reflector (Astral Crystal Spire - Optics)
// -------------------------------------------------------------
function reflectDirection(dir, angle) {
  const norm = ((angle % 180) + 180) % 180;
  // 45 deg = '\' diagonal mirror
  if (norm === 45) {
    if (dir === 'right') return 'down';
    if (dir === 'down') return 'right';
    if (dir === 'up') return 'left';
    if (dir === 'left') return 'up';
  }
  // 135 deg = '/' diagonal mirror
  if (norm === 135) {
    if (dir === 'down') return 'left';
    if (dir === 'left') return 'down';
    if (dir === 'right') return 'up';
    if (dir === 'up') return 'right';
  }
  return null;
}

function angleForTurn(inDir, outDir) {
  if (reflectDirection(inDir, 45) === outDir) return 45;
  if (reflectDirection(inDir, 135) === outDir) return 135;
  return 45;
}

function isHeroReachableToMirrors(width, height, hero, mirrors, blockedSet) {
  const visited = new Set([`${hero.x},${hero.y}`]);
  const queue = [{ x: hero.x, y: hero.y }];
  const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  while (queue.length > 0) {
    const curr = queue.shift();
    for (const [dx, dy] of offsets) {
      const nx = curr.x + dx;
      const ny = curr.y + dy;
      const key = `${nx},${ny}`;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      if (visited.has(key) || blockedSet.has(key)) continue;
      visited.add(key);
      queue.push({ x: nx, y: ny });
    }
  }

  return mirrors.every(m =>
    offsets.some(([dx, dy]) => visited.has(`${m.x + dx},${m.y + dy}`))
  );
}

function generateCrystalReflectorLayout(stage, chars) {
  const width = stage <= 1 ? 6 : 7;
  const height = stage <= 2 ? 5 : 6;
  const numMirrors = stage >= 2 ? 3 : 2;
  const obeliskChar = pickRandom(chars);

  const dirVec = {
    right: { dx: 1, dy: 0 },
    left: { dx: -1, dy: 0 },
    down: { dx: 0, dy: 1 },
    up: { dx: 0, dy: -1 }
  };

  const perpDirs = {
    right: ['down', 'up'],
    left: ['down', 'up'],
    down: ['left', 'right'],
    up: ['left', 'right']
  };

  for (let attempt = 0; attempt < 50; attempt++) {
    const startOnLeft = Math.random() < 0.6;
    const laser = startOnLeft
      ? { x: 0, y: randInt(0, height - 1), dir: 'right' }
      : { x: randInt(0, width - 1), y: 0, dir: 'down' };

    const rayTiles = new Set([`${laser.x},${laser.y}`]);
    const mirrors = [];
    let cx = laser.x;
    let cy = laser.y;
    let cdir = laser.dir;
    let valid = true;

    for (let m = 0; m < numMirrors; m++) {
      const v = dirVec[cdir];
      const candidates = [];
      let tx = cx;
      let ty = cy;

      for (let dist = 1; dist <= Math.max(width, height); dist++) {
        tx += v.dx;
        ty += v.dy;
        if (tx < 0 || tx >= width || ty < 0 || ty >= height) break;
        if (rayTiles.has(`${tx},${ty}`)) break;
        if (dist >= 2) {
          candidates.push({ x: tx, y: ty, dist });
        }
      }

      if (candidates.length === 0) {
        valid = false;
        break;
      }

      const chosen = pickRandom(candidates);
      // Mark segment tiles
      let sx = cx;
      let sy = cy;
      for (let s = 1; s <= chosen.dist; s++) {
        sx += v.dx;
        sy += v.dy;
        rayTiles.add(`${sx},${sy}`);
      }

      // Pick valid perpendicular direction with room
      const nextDirs = perpDirs[cdir].filter(nd => {
        const nv = dirVec[nd];
        const nx1 = chosen.x + nv.dx;
        const ny1 = chosen.y + nv.dy;
        const nx2 = chosen.x + nv.dx * 2;
        const ny2 = chosen.y + nv.dy * 2;
        if (nx1 < 0 || nx1 >= width || ny1 < 0 || ny1 >= height) return false;
        if (rayTiles.has(`${nx1},${ny1}`)) return false;
        return nx2 >= 0 && nx2 < width && ny2 >= 0 && ny2 < height && !rayTiles.has(`${nx2},${ny2}`);
      });

      if (nextDirs.length === 0) {
        valid = false;
        break;
      }

      const outDir = pickRandom(nextDirs);
      const solutionAngle = angleForTurn(cdir, outDir);
      const wrongAngles = [0, 90, solutionAngle === 45 ? 135 : 45];
      mirrors.push({
        x: chosen.x,
        y: chosen.y,
        angle: pickRandom(wrongAngles),
        solutionAngle
      });

      cx = chosen.x;
      cy = chosen.y;
      cdir = outDir;
    }

    if (!valid) continue;

    // Place obelisk along final ray
    const fv = dirVec[cdir];
    const obCandidates = [];
    let ox = cx;
    let oy = cy;
    for (let dist = 1; dist <= Math.max(width, height); dist++) {
      ox += fv.dx;
      oy += fv.dy;
      if (ox < 0 || ox >= width || oy < 0 || oy >= height) break;
      if (rayTiles.has(`${ox},${oy}`)) break;
      if (dist >= 2) obCandidates.push({ x: ox, y: oy, dist });
    }
    if (obCandidates.length === 0) continue;

    const obChoice = pickRandom(obCandidates);
    let sx = cx;
    let sy = cy;
    for (let s = 1; s <= obChoice.dist; s++) {
      sx += fv.dx;
      sy += fv.dy;
      rayTiles.add(`${sx},${sy}`);
    }

    const obelisk = { x: obChoice.x, y: obChoice.y, char: obeliskChar };

    // Pick hero start on open tile
    const blocked = new Set([
      `${laser.x},${laser.y}`,
      `${obelisk.x},${obelisk.y}`,
      ...mirrors.map(m => `${m.x},${m.y}`)
    ]);

    const openTiles = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!blocked.has(`${x},${y}`)) openTiles.push({ x, y });
      }
    }
    if (openTiles.length === 0) continue;

    const heroStart = openTiles[0];
    const walls = new Set();
    const pillarBudget = Math.min(2 + stage, 5);
    const nonRayOpen = openTiles.filter(t => !rayTiles.has(`${t.x},${t.y}`) && (t.x !== heroStart.x || t.y !== heroStart.y));

    for (let p = 0; p < pillarBudget && nonRayOpen.length > 0; p++) {
      const idx = randInt(0, nonRayOpen.length - 1);
      const tile = nonRayOpen.splice(idx, 1)[0];
      const key = `${tile.x},${tile.y}`;
      walls.add(key);
      blocked.add(key);
      if (!isHeroReachableToMirrors(width, height, heroStart, mirrors, blocked)) {
        walls.delete(key);
        blocked.delete(key);
      }
    }

    if (!isHeroReachableToMirrors(width, height, heroStart, mirrors, blocked)) continue;

    return {
      width,
      height,
      hero: { x: heroStart.x, y: heroStart.y, dir: 'down' },
      laser,
      mirrors,
      obelisk,
      walls
    };
  }

  // Guaranteed fallback layout
  return {
    width: 6,
    height: 5,
    hero: { x: 0, y: 0, dir: 'down' },
    laser: { x: 0, y: 1, dir: 'right' },
    mirrors: [
      { x: 4, y: 1, angle: 0, solutionAngle: 45 },
      { x: 4, y: 3, angle: 90, solutionAngle: 135 }
    ],
    obelisk: { x: 1, y: 3, char: obeliskChar },
    walls: new Set(['2,2', '5,0'])
  };
}

function createCrystalReflector(options = {}) {
  const chars = (options.lessonChars && options.lessonChars.length) ? options.lessonChars : ['a', 's', 'd'];
  const isProcedural = Boolean(options.random || options.stage);
  const initialStage = options.stage || (options.random ? 1 : 0);

  function buildState(stageNum, procedural) {
    if (procedural) {
      return generateCrystalReflectorLayout(stageNum, chars);
    }
    return {
      width: options.gridWidth || 5,
      height: options.gridHeight || 5,
      hero: { x: 0, y: 0, dir: 'down' },
      laser: { x: 0, y: 1, dir: 'right' },
      mirrors: [
        { x: 3, y: 1, angle: 0, solutionAngle: 45 },
        { x: 3, y: 3, angle: 0, solutionAngle: 135 }
      ],
      obelisk: { x: 1, y: 3, char: pickRandom(chars) },
      walls: new Set()
    };
  }

  const layout = buildState(initialStage, isProcedural);

  const game = {
    type: 'crystal_reflector',
    biome: 'crystal_spire',
    stage: initialStage,
    lessonChars: chars,
    width: layout.width,
    height: layout.height,
    hero: { ...layout.hero },
    initialHero: { ...layout.hero },
    laser: { ...layout.laser },
    mirrors: layout.mirrors.map(m => ({ ...m })),
    initialAngles: layout.mirrors.map(m => m.angle),
    obelisk: { ...layout.obelisk },
    walls: layout.walls,
    isEnergized: false,
    status: 'playing', // playing, won

    applyLayout(nextLayout) {
      this.width = nextLayout.width;
      this.height = nextLayout.height;
      this.hero = { ...nextLayout.hero };
      this.initialHero = { ...nextLayout.hero };
      this.laser = { ...nextLayout.laser };
      this.mirrors = nextLayout.mirrors.map(m => ({ ...m }));
      this.initialAngles = nextLayout.mirrors.map(m => m.angle);
      this.obelisk = { ...nextLayout.obelisk };
      this.walls = nextLayout.walls;
      this.isEnergized = false;
      this.status = 'playing';
    },

    reset() {
      this.hero = { ...this.initialHero };
      this.mirrors.forEach((m, i) => { m.angle = this.initialAngles[i]; });
      this.isEnergized = false;
      this.status = 'playing';
    },

    nextStage() {
      this.stage = (this.stage || 1) + 1;
      this.applyLayout(buildState(this.stage, true));
    },

    randomizeStage() {
      this.stage = this.stage || 1;
      this.applyLayout(buildState(this.stage, true));
    },

    isBlocked(x, y) {
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) return true;
      if (this.walls && this.walls.has(`${x},${y}`)) return true;
      if (x === this.laser.x && y === this.laser.y) return true;
      if (x === this.obelisk.x && y === this.obelisk.y) return true;
      if (this.mirrors.some(m => m.x === x && m.y === y)) return true;
      return false;
    },

    moveHero(dir) {
      if (this.status !== 'playing') return false;
      this.hero.dir = dir;
      let nx = this.hero.x;
      let ny = this.hero.y;
      if (dir === 'up') ny--;
      else if (dir === 'down') ny++;
      else if (dir === 'left') nx--;
      else if (dir === 'right') nx++;

      if (this.isBlocked(nx, ny)) return false;
      this.hero.x = nx;
      this.hero.y = ny;
      return true;
    },

    interactSpacebar() {
      // Find adjacent mirror
      for (const m of this.mirrors) {
        const dist = Math.abs(this.hero.x - m.x) + Math.abs(this.hero.y - m.y);
        if (dist <= 1) {
          m.angle = (m.angle + 45) % 360;
          return m;
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

      for (let step = 0; step < 30; step++) {
        if (cdir === 'right') cx++;
        else if (cdir === 'left') cx--;
        else if (cdir === 'down') cy++;
        else if (cdir === 'up') cy--;

        if (cx < 0 || cx >= this.width || cy < 0 || cy >= this.height) {
          path.push({ x: cx, y: cy });
          break;
        }

        if (this.walls && this.walls.has(`${cx},${cy}`)) {
          path.push({ x: cx, y: cy });
          break;
        }

        path.push({ x: cx, y: cy });

        if (cx === this.obelisk.x && cy === this.obelisk.y) {
          hitsObelisk = true;
          break;
        }

        const mirror = this.mirrors.find(m => m.x === cx && m.y === cy);
        if (mirror) {
          const nextDir = reflectDirection(cdir, mirror.angle);
          if (nextDir) {
            cdir = nextDir;
          } else {
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
// Game 3: Dungeon Relic (Ancient Sun Temple - Sokoban Push & Undo)
// -------------------------------------------------------------
// Curated deadlock-free 7x6 Sokoban temple blueprints (# wall, . floor, @ hero, $ chest, * target)
const TEMPLE_TEMPLATES_1_CHEST = [
  [
    '#######',
    '#.....#',
    '#.@$.*#',
    '#..#..#',
    '#.....#',
    '#######'
  ],
  [
    '#######',
    '#@....#',
    '#.$#..#',
    '#....*#',
    '#.....#',
    '#######'
  ],
  [
    '#######',
    '#..#..#',
    '#@.$..#',
    '#...#.#',
    '#....*#',
    '#######'
  ],
  [
    '#######',
    '#....*#',
    '#.##..#',
    '#..$..#',
    '#@....#',
    '#######'
  ],
  [
    '#######',
    '#.....#',
    '#.#$.@#',
    '#.#...#',
    '#.*...#',
    '#######'
  ]
];

const TEMPLE_TEMPLATES_2_CHESTS = [
  [
    '#######',
    '#.....#',
    '#.@$.*#',
    '#..$.*#',
    '#.....#',
    '#######'
  ],
  [
    '#######',
    '#..*..#',
    '#..$..#',
    '#@.$.*#',
    '#.....#',
    '#######'
  ],
  [
    '#######',
    '#.*...#',
    '#.$#..#',
    '#@.$.*#',
    '#.....#',
    '#######'
  ],
  [
    '#######',
    '#....*#',
    '#..$$.#',
    '#@.#..#',
    '#....*#',
    '#######'
  ],
  [
    '#######',
    '#*....#',
    '#.$@$.#',
    '#...#.#',
    '#....*#',
    '#######'
  ]
];

function transformCoord(x, y, w, h, rot, flipX) {
  let rx = flipX ? (w - 1 - x) : x;
  let ry = y;
  let rw = w;
  let rh = h;
  for (let r = 0; r < rot; r++) {
    const nx = rh - 1 - ry;
    const ny = rx;
    rx = nx;
    ry = ny;
    const tmp = rw;
    rw = rh;
    rh = tmp;
  }
  return { x: rx, y: ry, w: rw, h: rh };
}

function generateDungeonRelicLayout(stage, chars, lastTemplateKey = null) {
  const pool = stage <= 1 ? TEMPLE_TEMPLATES_1_CHEST : TEMPLE_TEMPLATES_2_CHESTS;
  let idx = randInt(0, pool.length - 1);
  if (lastTemplateKey && pool.length > 1 && `${stage <= 1 ? 1 : 2}:${idx}` === lastTemplateKey) {
    idx = (idx + 1) % pool.length;
  }
  const templateKey = `${stage <= 1 ? 1 : 2}:${idx}`;
  const grid = pool[idx];
  const origH = grid.length;
  const origW = grid[0].length;

  // Apply random horizontal/vertical flip (keep wide aspect ratio 7x6 for clean canvas fit)
  const flipX = Math.random() < 0.5;
  const rot = Math.random() < 0.5 ? 0 : 2; // 0 or 180 deg preserves 7x6 landscape layout

  const walls = new Set();
  const rawChests = [];
  const rawTargets = [];
  let hero = { x: 1, y: 1, dir: 'down' };

  for (let y = 0; y < origH; y++) {
    for (let x = 0; x < origW; x++) {
      const ch = grid[y][x];
      const t = transformCoord(x, y, origW, origH, rot, flipX);
      if (ch === '#') walls.add(`${t.x},${t.y}`);
      else if (ch === '@') hero = { x: t.x, y: t.y, dir: 'down' };
      else if (ch === '$') rawChests.push({ x: t.x, y: t.y });
      else if (ch === '*') rawTargets.push({ x: t.x, y: t.y });
    }
  }

  const assignedChars = pickDistinctChars(chars, rawChests.length);
  const chests = rawChests.map((c, i) => ({
    id: i + 1,
    x: c.x,
    y: c.y,
    char: assignedChars[i],
    locked: true
  }));
  const targets = rawTargets.map((t, i) => ({
    id: i + 1,
    x: t.x,
    y: t.y,
    char: assignedChars[i]
  }));

  // Pick 2-4 wall tiles for flickering temple torches
  const torches = [];
  if (walls.has('1,0')) torches.push({ x: 1, y: 0 });
  if (walls.has(`${origW - 2},0`)) torches.push({ x: origW - 2, y: 0 });

  return {
    width: origW,
    height: origH,
    hero,
    chests,
    targets,
    walls,
    torches,
    templateKey
  };
}

function createDungeonRelic(options = {}) {
  const chars = (options.lessonChars && options.lessonChars.length) ? options.lessonChars : ['ม', 'ย', 'ร'];
  const isProcedural = Boolean(options.random || options.stage);
  const initialStage = options.stage || (options.random ? 1 : 0);

  function buildState(stageNum, procedural, lastKey) {
    if (procedural) {
      return generateDungeonRelicLayout(stageNum, chars, lastKey);
    }
    const width = options.gridWidth || 6;
    const height = options.gridHeight || 6;
    const char = pickRandom(chars);
    const walls = new Set();
    for (let x = 0; x < width; x++) {
      walls.add(`${x},0`);
      walls.add(`${x},${height - 1}`);
    }
    for (let y = 0; y < height; y++) {
      walls.add(`0,${y}`);
      walls.add(`${width - 1},${y}`);
    }
    return {
      width,
      height,
      hero: { x: 1, y: 2, dir: 'right' },
      chests: [{ id: 1, x: 2, y: 2, char, locked: true }],
      targets: [{ id: 1, x: 4, y: 2, char }],
      walls,
      torches: [{ x: 1, y: 0 }, { x: width - 2, y: 0 }],
      templateKey: null
    };
  }

  const layout = buildState(initialStage, isProcedural, null);

  const game = {
    type: 'dungeon_relic',
    biome: 'sun_temple',
    stage: initialStage,
    lessonChars: chars,
    width: layout.width,
    height: layout.height,
    hero: { ...layout.hero },
    initialHero: { ...layout.hero },
    chests: layout.chests.map(c => ({ ...c })),
    initialChests: layout.chests.map(c => ({ ...c })),
    targets: layout.targets.map(t => ({ ...t })),
    walls: layout.walls,
    torches: layout.torches || [],
    templateKey: layout.templateKey,
    history: [],
    status: 'playing',

    applyLayout(nextLayout) {
      this.width = nextLayout.width;
      this.height = nextLayout.height;
      this.hero = { ...nextLayout.hero };
      this.initialHero = { ...nextLayout.hero };
      this.chests = nextLayout.chests.map(c => ({ ...c }));
      this.initialChests = nextLayout.chests.map(c => ({ ...c }));
      this.targets = nextLayout.targets.map(t => ({ ...t }));
      this.walls = nextLayout.walls;
      this.torches = nextLayout.torches || [];
      this.templateKey = nextLayout.templateKey;
      this.history = [];
      this.status = 'playing';
    },

    reset() {
      this.hero = { ...this.initialHero };
      this.chests = this.initialChests.map(c => ({ ...c }));
      this.history = [];
      this.status = 'playing';
    },

    nextStage() {
      this.stage = (this.stage || 1) + 1;
      this.applyLayout(buildState(this.stage, true, this.templateKey));
    },

    randomizeStage() {
      this.stage = this.stage || 1;
      this.applyLayout(buildState(this.stage, true, this.templateKey));
    },

    typeChar(c) {
      let unlockedAny = false;
      for (const chest of this.chests) {
        const dist = Math.abs(this.hero.x - chest.x) + Math.abs(this.hero.y - chest.y);
        if (dist <= 1 && chest.locked && chest.char === c) {
          chest.locked = false;
          unlockedAny = true;
        }
      }
      return unlockedAny;
    },

    moveHero(dir) {
      if (this.status !== 'playing') return false;
      this.hero.dir = dir;
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

      this.history.push({
        hero: { ...this.hero },
        chests: this.chests.map(c => ({ ...c }))
      });
      this.hero.x = nextX;
      this.hero.y = nextY;
      return true;
    },

    interactSpacebar() {
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
