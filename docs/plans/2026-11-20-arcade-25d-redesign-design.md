# MMORPG Puzzle Arcade 2.5D Redesign — Design Specification

**Date:** 2026-11-20  
**Scope:** Strictly isolated within `src/arcade/`, `tests/arcade-puzzle.test.cjs`, and minimal asset linking in `index.html` (zero side-effects on core typing engine, `curriculum`, progress gating, Google Sheets API, or Lettercraft 3D).

---

## 1. Visual & Perspective Direction

- **Perspective:** **Top-Down 2.5D Oblique Diorama** (inspired by modern Zelda / indie RPG dioramas).
  - Arrow keys (`↑ ↓ ← →`) map 1:1 to screen directions so young students never experience directional confusion.
  - Every grid sits on a floating 2.5D diorama island with extruded cliff thickness, atmospheric biome backdrop, and ambient floating particles.
  - All 3D entities (walls, trees, crystal pillars, rune gates, mirrors, obelisks, treasure chests, hero) render with top faces, extruded front faces, bevel highlights, and soft cast shadows.
  - **Y-Axis Depth Sorting (Painter's Algorithm):** Entities are sorted by vertical row (`visualY`) so the hero walks naturally behind foreground obstacles and in front of background ones.
  - **HiDPI Rendering:** Logical `800×560` canvas scaled via `devicePixelRatio` for crisp visuals on all displays.

---

## 2. Three Distinct Fantasy Worlds (Biomes)

### Game 1: ⚔️ วงกตศิลาจารึก (Rune Coder) — 🌲 ป่าเอลฟ์โบราณ (Elven Glade)
- **Theme:** Deep emerald twilight backdrop, drifting golden fireflies, mossy flagstones, layered 2.5D trees swaying gently, glowing runic stone gate, swirling cyan-emerald warp portal, and a Chibi Elven Knight.
- **Tri-Input Mechanics:**
  - **Arrow Keys (`↑ ↓ ← →`):** Enqueue direct 4-way movement steps (`move_up`, `move_down`, `move_left`, `move_right`) — intuitive Scratch-style sequencing! (Legacy `forward`/`backward`/`left`/`right` commands remain supported in `core.js` for backward compatibility.)
  - **Lesson Character Key:** Enqueue a runic spell block matching the character on the locked gate(s).
  - **Spacebar:** Execute the program with **animated step-by-step playback** (~280ms per step), highlighting the active command block in the bottom Scratch tray, triggering spell particle bursts on gate unlock, or bounce + screen shake on collision.
- **Procedural Stage Generator:** Constructive guaranteed-solvable maze generator (`stage >= 1`) creating winding forest paths with 1–2 rune gates and obstacles, scaling difficulty per stage.

### Game 2: 🔮 หอคอยกระจกสะท้อน (Crystal Reflector) — ✨ หอคอยคริสตัลนภา (Astral Crystal Spire)
- **Theme:** Starry midnight cosmos with aurora glow, polished celestial marble tiles, faceted amethyst crystal pillars, ornate ruby laser cannon, floating sapphire 2.5D prism mirrors on bronze stands, arcane obelisk, and a Starlight Mage.
- **Tri-Input Mechanics:**
  - **Arrow Keys (`↑ ↓ ← →`):** Move the Starlight Mage around the spire (blocked by pillars/mirrors/emitter/obelisk).
  - **Spacebar (adjacent to mirror):** Smoothly rotate the crystal mirror by 45° with chime & sparkle feedback; real-time multi-layer glowing laser ray updates immediately.
  - **Lesson Character Key (when beam hits obelisk):** Energize the obelisk with the displayed lesson letter to burst light and clear the stage.
- **Procedural Stage Generator:** Constructive beam-path generator that builds a guaranteed-solvable 2-to-3-bounce optical path, places decorative crystal obstacles while verifying hero BFS reachability to every mirror, and scrambles initial mirror angles.

### Game 3: 📦 หีบสมบัติวงเวท (Dungeon Relic) — 🏛️ วิหารทองคำโบราณ (Ancient Sun Temple)
- **Theme:** Obsidian-amber temple cavern with rising embers, sandstone flagstones, temple brick walls topped with flickering torches, rotating golden solar magic circles, chained wooden-gold treasure chests, and a Temple Explorer Paladin.
- **Tri-Input Mechanics:**
  - **Arrow Keys (`↑ ↓ ← →`):** Walk and push unlocked treasure chests onto matching magic circles with smooth sliding & dust puffs.
  - **Lesson Character Key (adjacent to locked chest):** Shatter crimson arcane chains with particle bursts when typing the character inscribed on the chest.
  - **Spacebar:** Rewind 1 step (Undo) with golden time-warp ripple effect.
- **Procedural Stage Generator:** Curated pool of deadlock-free Sokoban temple blueprints transformed with 8 geometric symmetries (rotations + mirrors) and fresh lesson characters, ensuring 80+ non-repeating, 100% solvable stages scaling from 1 chest (Stage 1) to 2 chests (Stage 2+).

---

## 3. Game Feel, Audio & UI Polish

- **Smooth Tweening:** Hero position (`visualX`, `visualY`), hop arc (`hopZ`), mirror angle (`visualAngle`), and chest positions interpolate smoothly at 60fps.
- **Particle Engine:** Lightweight canvas particle system for footsteps, rune shatter, crystal glints, laser impact sparks, undo ripples, and victory confetti.
- **Procedural Web Audio SFX:** Zero-dependency RPG sound effects (step, crystal chime, rune unlock chord, chest slide, rewind whoosh, bump, victory fanfare), honoring the main app's `state.soundEnabled` flag.
- **Stage Progression & Controls:**
  - Header bar displays Biome name, Stage counter (`ด่านที่ X`), Cleared count (`⭐`), plus buttons for **รีเซ็ตด่าน**, **สุ่มด่านใหม่**, **กลับหน้ารวมเกม**, and **ปิด**.
  - On victory, players press `Spacebar`/`Enter` or click **"ด่านถัดไป ➡️"** to continue into a newly generated stage seamlessly.
- **Arcade Lobby Redesign:** Rich themed realm cards with fantasy color palettes, icons, descriptions, and Tri-Input keycap pills.

---

## 4. Architecture & Testing Strategy

- **`src/arcade/core.js`**: Pure logic engines + guaranteed-solvable procedural stage generators + step-by-step execution trace for Rune Coder + `nextStage()` support. Zero DOM dependencies.
- **`src/arcade/view.js`**: Procedural 2.5D Oblique Diorama Renderer, Y-depth sorting, biome themes, tween state tracking, particle system, and safe Canvas 2D fallbacks (`drawRoundedRect`, `ellipse`).
- **`src/arcade/bridge.js`**: Lobby UI, game stage container, HiDPI canvas sizing, animated execution playback controller, Web Audio RPG synth, `AbortController` isolated input binding (`capture: true` + `stopImmediatePropagation`).
- **`src/arcade/style.css`**: Themed fantasy realm lobby cards, RPG HUD buttons, responsive game stage modal.
- **`tests/arcade-puzzle.test.cjs`**: Preserves all existing tests + adds TDD tests for:
  - Cardinal 4-way commands & step trace in Rune Coder
  - Procedural solvable stage generation across all 3 games (testing multiple seeds/stages for guaranteed solvability & reachability)
  - `nextStage()` progression
  - Full 2.5D rendering of all 3 biomes in mock canvas (including without `roundRect`/`ellipse`).
