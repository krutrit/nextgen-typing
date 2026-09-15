# Educational Voxel Adventure — continuation plan (2026-09-14)

User requests continuation of the detailed six-phase Third Person upgrade, using existing code, not a replacement game. Initial checkout is clean; existing 38 tests and bundle check pass. All changes stay local; no publishing or remote progress writes.

Architecture inspected: core owns simulation, quests, entities/enemies/tools/events; view owns WebGL geometry, pixel atlas, ray picking and Canvas labels; bridge owns input/lifecycle and existing lesson hooks; UI/style own HUD; generated index embeds sources. Existing admin enableMinigame checks must remain. No new external dependencies or copied assets.

## Phases / ownership / interfaces

1. Camera + character: extend player with facing (body direction), retain angle/pitch as camera orbit orientation for compatibility. game.cameraDistance controls zoom. core direction stays camera relative; body turns while moving. view updates a smooth collision-resolved camera, renders full block rig, excludes player from ray targets. bridge wheel changes distance and updates camera once before pick/render. Reuse existing Pointer Lock/Esc + right-drag fallback.
2. Jump: player.z (feet), vz, grounded, landing; Space rising edge jumps only on ground, gravity and swept vertical collision; terrain quarter steps remain walkable, rock tops can be landed on. Holding collection requires ground and vertical proximity; jumping cancels. No double jump or auto bunny-hop.
3. Weapons: reuse tools/activeTool/cooldown/swing, replace old screen hand with in-world geometry attached to right hand; distinct procedural sword/axe/pickaxe rotations. No parallel inventory/combat system.
4. Enemies: extend existing enemies/update/flow, add wander, state, attackCooldown/attackTime/hurtTime/motion; LOS and vertical attack range, small knockback and unchanged hearts/invulnerability. Reuse events for audio/particles/flash/HP.
5. Environment/lighting: preserve heightAt and existing atlas/geometry, add generated non-solid grass/flowers and small landmarks outside navigation paths; ambient+directional shading, gradient sky/fog, bounded batches.
6. HUD/polish: compact controls, current tool/level, target/enemy info, tutorials for orbit/zoom/jump. Keep login/lang/progress/admin/sound/timer20letters/retry/exit unchanged.

After each phase: syntax, unit tests, bundle sync, regression/lesson integration tests. Final real browser keyboard/mouse gameplay and screenshot.

## Progress

- Architecture + baseline: complete (38 tests pass, clean checkout).
- Phase 1: complete — 44 unit tests and Chrome lesson-boundary checks passed; orbit/zoom/follow/camera collision/body rig inspected.
- Phase 2: complete — 52 tests and Chrome Space jump/landing plus lesson-boundary checks passed. Core adds z/vz/grounded and swept landing/ceiling/step collision; renderer adds rising/falling/landing poses.
- Phase 3: complete — connected weapon geometry, stepped tips/edges/guards, distinct eased swings, material levels, one shared-grip transform correction. Two user-visible bugs reproduced in tests before fixes (floating weapon parts and repeated gait offset). 56 tests and lesson integration passed.
- Phase 4: complete — original enemy flow/pursuit extended with patrol/idle, cooldown, LOS/vertical damage checks, hit flash, moving arms/legs and HP. Core/renderer tests and full Chrome combat regression pass.
- Phase 5: complete — deterministic cached flowers/grass, flat compass mosaic, retained terrain/trees/clouds, transformed-face directional light plus ambient fill, gradient sky matching horizon fog. 63 tests and Chrome lesson integration pass. No dependency or imported asset; decorative plants are deliberately non-solid.
- Phase 6: complete — retained compact HUD, fixed initial equipped-tool highlight, updated intro/help/shortcuts for third-person orbit, wheel zoom, Space jump, Shift run and grounded collection. Real Chrome wheel/jump and lesson integration tests pass; full browser gameplay regression passes. Original login/progress/Apps Script/admin toggle code preserved.

## Verification / artifacts (2026-09-15)

- Unit suite: 64 passing across core, physics, enemies, renderer after review.
- Syntax: core/view/bridge; generated index bundle check; git diff whitespace check.
- Chrome integration: lesson finish/entry/exit, admin toggle, languages, sound, progress, 20 letters / 5 minutes, jump and mouse wheel. Remote requests intercepted; no live progress writes.
- Chrome gameplay: orbit/Esc, crosshair mining/occlusion, collision, WASD/arrows, real tool pickup, hold while looking, monster chase/five hits/invulnerability, timeout/retry/win, Thai marks, responsive layout and cleanup.
- Visual QA: all three held weapons inspected at crystal level using a local visual fixture; no JavaScript errors, WebGL getError = 0. Screenshots `.artifacts/lettercraft-{sword,axe,pickaxe}-polished.png`; ordinary gameplay screenshot `.artifacts/lettercraft-third-person.png`.
- No production deployment or commit performed. Screenshots of upgraded tools deliberately set the existing tool level for inspection, not evidence of earning every upgrade in one live round.
- Independent code review: no Critical/Important findings. Minor diagonal enemy face occlusion reproduced in a new test and fixed by projecting facial features onto the axis-aligned head surface; geometry remains shared with ray picking.

Decision: retain orbit angle/pitch names to minimize disruption; add separate facing. Run uses Shift only while walking, so existing Shift handling for Thai collection remains authoritative. Camera distance range 2.2–7 tiles; obstacles may retract further to avoid clipping. Tight spaces can temporarily crop the avatar; no camera inside blocks.
