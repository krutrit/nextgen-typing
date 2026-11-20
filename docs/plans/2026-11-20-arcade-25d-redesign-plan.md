# MMORPG Puzzle Arcade 2.5D Redesign Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Redesign the 3 MMORPG puzzle games into a vibrant Top-Down 2.5D Oblique Diorama arcade with 3 distinct fantasy biomes (Elven Forest, Astral Crystal Spire, Ancient Sun Temple), smooth animations/particles/RPG audio, and guaranteed-solvable procedural stage generation while maintaining 100% backward compatibility and zero side-effects.

**Architecture:** All changes remain strictly isolated within `src/arcade/` (`core.js`, `view.js`, `bridge.js`, `style.css`) and `tests/arcade-puzzle.test.cjs`. `core.js` provides pure, deterministic-by-default and procedural-when-requested solvable engines; `view.js` implements a Y-depth-sorted 2.5D Oblique Canvas diorama renderer with tweening and particles; `bridge.js` handles animated playback, Web Audio RPG chimes, stage progression, and isolated keyboard capture.

**Tech Stack:** Vanilla JavaScript (UMD for Node.js tests + Browser globals), HTML5 Canvas 2D (HiDPI), Web Audio API, CSS3, Node.js `node:test`.

---

### Task 13: TDD RED — Add tests for 2.5D procedural solvable stages, cardinal commands, execution trace, and multi-biome rendering

**Files:**
- Modify: `tests/arcade-puzzle.test.cjs`

**Steps:**
1. Add unit tests verifying:
   - Rune Coder supports cardinal commands (`move_up`, `move_down`, `move_left`, `move_right`), returns step-by-step `trace`, and `createRuneCoder({ lessonChars, stage: 1, random: true })` generates solvable stages with `solutionQueue` that solves cleanly.
   - Crystal Reflector `createCrystalReflector({ lessonChars, stage: 1, random: true })` generates solvable stages where aligning mirrors to `solutionAngle` hits the obelisk and hero can reach adjacent to every mirror without walking through obstacles.
   - Dungeon Relic `createDungeonRelic({ lessonChars, stage: 1, random: true })` generates varied solvable temple layouts (1 chest on stage 1, 2 chests on stage 2+) with `nextStage()` progression.
   - `ArcadeView` renders all 3 biomes in 2.5D without throwing even on legacy Canvas 2D contexts missing `roundRect` and `ellipse`.
2. Run `node --test tests/arcade-puzzle.test.cjs` and observe expected RED failures.

---

### Task 14: TDD GREEN — Upgrade `src/arcade/core.js` with guaranteed-solvable procedural generators, cardinal commands, and execution traces

**Files:**
- Modify: `src/arcade/core.js`

**Steps:**
1. Preserve 100% legacy behavior when neither `random` nor `stage` is specified.
2. Add cardinal commands (`move_up`, `move_down`, `move_left`, `move_right`) and `trace` array output to `RuneCoder.execute()`.
3. Implement constructive solvable procedural stage generator for Rune Coder (Elven Glade), Crystal Reflector (Astral Crystal Spire), and Dungeon Relic (Ancient Sun Temple, using curated deadlock-free templates × 8 geometric symmetries + randomized lesson characters).
4. Add `moveHero(dir)` obstacle collision check to `CrystalReflector` so the Starlight Mage cannot walk through crystal pillars/mirrors/obelisk/emitter.
5. Add `nextStage()` / `randomizeStage()` helpers to all 3 game engines.
6. Run `node --test tests/arcade-puzzle.test.cjs` and confirm core tests pass.

---

### Task 15: TDD GREEN — Rebuild `src/arcade/view.js` as a Y-Sorted Top-Down 2.5D Oblique Diorama Engine

**Files:**
- Modify: `src/arcade/view.js`

**Steps:**
1. Build 2.5D Oblique drawing primitives:
   - Floating diorama island with extruded stone/earth cliff depth
   - 2.5D extruded blocks (top face + shaded front depth face + bevel highlight + drop shadow)
   - Biome backdrops & ambient floating particles (Elven fireflies, Astral stars/aurora, Temple embers)
   - Painter's Algorithm Y-depth sorting for all tall entities and the smoothly interpolated Hero
2. Implement custom 2.5D sprites:
   - Chibi Elven Knight, Starlight Mage, and Sun Temple Paladin with idle bob, hop arc, directional facing, and capes
   - Layered swaying 2.5D Elven trees, mossy rune gates, swirling warp portals
   - Faceted amethyst crystal spires, ruby dragon emitter, rotating sapphire 2.5D prism mirrors, arcane obelisks, multi-layer glowing laser rays with impact sparks
   - Sandstone temple walls with flickering torches, rotating golden solar circles, chained 2.5D wooden-gold treasure chests
3. Add smooth visual tweening (`visualX`, `visualY`, `hopZ`, `visualAngle`, screen shake) and foreground particle bursts (`spawnBurst`).
4. Keep `drawRoundedRect` and `ellipse` safe fallbacks.
5. Run `node --test tests/arcade-puzzle.test.cjs` and confirm all view tests pass.

---

### Task 16: Upgrade `src/arcade/bridge.js` and `src/arcade/style.css` for 2.5D Stage UI, Animated Playback, Web Audio SFX, and Themed Lobby

**Files:**
- Modify: `src/arcade/bridge.js`
- Modify: `src/arcade/style.css`

**Steps:**
1. Redesign the Arcade Lobby cards with distinct fantasy biome styling, glowing borders, and Tri-Input keycap badges.
2. Upgrade the game modal to a responsive `800×560` HiDPI canvas with RPG top header controls: Stage badge (`ด่านที่ X`), Cleared star counter (`⭐`), Reset (`R`), New Random Stage (`🎲`), Back to Lobby (`🏠`), and Close (`✕`).
3. Implement smooth step-by-step animated playback for Rune Coder execution (highlighting active command block, triggering particle bursts & SFX at each step, screen shake on bump).
4. Add lightweight zero-dependency Web Audio RPG sound synthesizer (honoring `state.soundEnabled`).
5. Add keyboard capture isolation (`capture: true`, `stopImmediatePropagation`, `Escape` to exit, `R` to reset, `Space`/`Enter` on victory to advance to `nextStage()`).

---

### Task 17: Full Verification, Commit & Deploy to GitHub Pages

**Steps:**
1. Run `node --test tests/*.test.cjs` — confirm 100% pass across all unit tests (80+ tests).
2. Run `node scripts/build-lettercraft.cjs --check` — confirm zero side-effects on Lettercraft bundle.
3. Update `docs/plans/task.md`.
4. Commit and push to `origin/main` and verify GitHub Pages deployment succeeds.
