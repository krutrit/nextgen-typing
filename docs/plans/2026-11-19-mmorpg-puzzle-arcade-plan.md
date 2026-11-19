# MMORPG Puzzle Arcade Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Build a modular, retro MMORPG-themed puzzle arcade with 3 games featuring the Tri-Input coordination system (Arrow Keys + Lesson Letters + Spacebar), along with a Dungeon Lobby selector, ensuring zero side-effects on the core typing platform.

**Architecture:** Create an isolated game engine in `src/arcade/` with clean lifecycle methods (`mount`, `start`, `dispose`), dynamic lesson character ingestion, and an event listener sandbox managed via `AbortController`. Integrate into `index.html` via a non-intrusive modal lobby dialog that preserves existing Lettercraft 3D as an option.

**Tech Stack:** HTML5 Canvas, Vanilla JavaScript ES6, CSS3 Animations, Node.js test runner.

---

### Task 1: Write Automated Verification Tests for the 3 Puzzle Engines

**Files:**
- Create: `tests/arcade-puzzle.test.cjs`

**Step 1: Write unit tests covering:**
1. **Rune Coder**: Command queue sequence execution (`↑`, `↓`, `←`, `→`), letter barrier unlocking (`chars`), boundary collisions, and Spacebar run triggering.
2. **Crystal Reflector**: Grid raycasting, 45°/90° mirror deflection via Spacebar, and letter obelisk activation.
3. **Dungeon Relic**: Grid pushing physics, letter chest chain unlocking, and Spacebar undo/jump mechanics.
4. **Lesson Integration**: Dynamic mapping of lesson characters (`curriculum.chars`) into puzzle targets.

**Step 2: Run test to verify initial failures / logic contract**
Run: `node --test tests/arcade-puzzle.test.cjs`

---

### Task 2: Build the Core Puzzle Logic Engine (`src/arcade/core.js`)

**Files:**
- Create: `src/arcade/core.js`

**Step 1: Implement game state and grid systems**
- Grid representation (tiles, walls, doors, crystals, chests).
- Rune Coder queue evaluator and step-by-step animator state.
- Crystal Reflector beam tracing algorithm.
- Dungeon Relic box push and history undo stack.

**Step 2: Run tests to verify logic engine passes**
Run: `node --test tests/arcade-puzzle.test.cjs`

---

### Task 3: Build the MMORPG Retro Canvas Renderer (`src/arcade/view.js`)

**Files:**
- Create: `src/arcade/view.js`

**Step 1: Implement retro fantasy graphics**
- Grid dungeon floor, stone walls, and torchlight styling.
- Hero character sprite/avatar with walking directions (Facing Up, Down, Left, Right).
- Runic letters with glowing magical borders.
- Laser beam rendering with particle sparkles and reflection lines.
- Treasure chests, magic circles, and command queue HUD.

---

### Task 4: Build the Arcade Bridge & Dungeon Lobby Interface (`src/arcade/bridge.js` & `src/arcade/ui.html`)

**Files:**
- Create: `src/arcade/bridge.js`
- Create: `src/arcade/style.css`

**Step 1: Implement Dungeon Lobby & Lifecycle Management**
- Dungeon selector dialog with retro RPG theme (4 options: Rune Coder, Crystal Reflector, Dungeon Relic, Lettercraft 3D).
- Keyboard handler using `AbortController` scoped strictly to active game sessions.
- Clean exit and cleanup restoring control to typing interface.

---

### Task 5: Integrate Arcade Launcher into `index.html` (Zero Side-Effects)

**Files:**
- Modify: `index.html`

**Step 1: Connect completion modal button to Arcade Lobby**
- Update completion modal button to open Arcade Lobby where students can choose any of the 3 puzzle games or Lettercraft 3D.
- Ensure all typing state, Google Sheets synchronization, and lesson progression remain completely unaffected.

---

### Task 6: Full Test Suite & Asset Verification

**Files:**
- Run: `node --test tests/block-world.test.cjs tests/lettercraft-view.test.cjs tests/lettercraft-physics.test.cjs tests/progress-gate.test.cjs tests/arcade-puzzle.test.cjs`
- Check: `node scripts/build-lettercraft.cjs --check`
- Syntax: Node syntax check on all files

---

### Task 7: Commit & Deploy to GitHub Pages

**Files:**
- Git commit all arcade assets and index integration.
- Push to GitHub `main` branch.
- Monitor and verify GitHub Pages deployment.
