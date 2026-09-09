# Lettercraft implementation ledger

## First-person upgrade — 2026-09-09 (in progress)

Authority: latest user's explicit six-section implementation request, following the FPS prompt/design already supplied and approved. Replaces the earlier isometric renderer; earlier validation below is historical, not FPS completion evidence.

Tasks: (1) core camera-relative movement, look and shared terrain; (2) WebGL textured renderer and projection/ray tests; (3) pointer capture lifecycle, readable HUD and tutorial; (4) actual browser interaction and screenshots; (5) final independent review.

Interface check: renderer owns view.js/view tests, consumes read-only game player/entities/drops/heightAt; parent owns core, bridge, UI, browser tests and bundle. Core heightAt gives quarter-block terraces, renderer uses identical elevation. Bridge pick reads current camera. No shared edited files between renderer and parent.

Ruling: Use native WebGL with code-generated original pixel textures, keeping index.html standalone — preserves existing deployment without adding network dependencies.
Ruling: Quarter-block terrain auto-steps underfoot; no jump key required by the request. Pointer Lock is primary, with explicitly labeled right-drag look fallback only if the browser denies capture. Timer continues while unlocked/menu/background; movement and combat pause as in existing menu behavior.

- [x] Core: new FPS tests first failed on movement/look/terrain/camera snap, then all 27 core tests passed.
- [x] Renderer: fps_renderer implemented and reported; parent visual QA requested raised initial rock label, nearby drop HUD clearance, central hold ring, cracks and cube frame. Agent added failing regressions then fixed. Final 10 renderer tests pass; parent inspected screenshots showing depth, textures, Thai labels, hand, frame and cracks.
- [x] Bridge/UI: Pointer Lock, Esc release, labeled right-drag fallback, WebGL error/return, lifecycle disposal, updated controls/tutorial and compact HUD.
- [x] Browser verification / FPS screenshots: full expanded Chrome suite PASS, 38/38 unit tests PASS. No page errors or live remote progress writes. Capture-denial fallback first failed; actual browser event tracing proved pointerdown.preventDefault suppressed compatibility mousemove during drag. Changed fallback to pointermove; complete suite then passed.
- [ ] Final review.

FPS visual evidence: `.artifacts/lettercraft-first-person.png` from actual mining/collecting/walking test; `.artifacts/lettercraft-first-person-mining.png` shows Thai lettering, damaged rock cracks and target frame. Headless Chrome sample of 90 animation frames: median 16.7ms, p95 16.8ms, WebGL error code 0 (local test machine only).

## Previous isometric version (completed)

Spec: docs/superpowers/specs/2026-09-08-letter-block-world-design.md (approved in conversation).

Tasks: core + input tests; renderer; UI + lesson bridge; browser verification; final review.

Ruling: Keep current workspace so the approved draft and pending test file remain present; preserve unrelated .freebuff and temp.js. No commit, push, or publication is included.
Ruling: Split editable game sources under src/lettercraft and mechanically embed them into index.html so deployment remains a single HTML file. Rendering and core have separate owners and stable interfaces.

Interfaces checked: core produces entity/drop/player state consumed read-only by renderer; bridge owns DOM and keyboard listeners; bundler assembles CSS, HTML, core, renderer, bridge in that order. No overlapping source-file ownership.

- [x] Core behavior and tests
- [x] Renderer
- [x] UI and lesson integration
- [x] Automated and browser verification
- [x] Final review

Validation: `node --test tests/block-world.test.cjs tests/lettercraft-view.test.cjs` — 25/25 pass. Includes mouse attack/cooldown, hold timing, WASD arbitration, Shift transitions, tool upgrades, five hits, timeout, spawn cap, enemy routing, reachable generated resources, inverse camera projection, and frontmost hit testing.

Validation: `node tests/lettercraft-browser.cjs` with bundled Playwright + Chrome — PASS. Actual browser input verifies mining, hold timing, WASD/arrows, mouse aim, help/exit dialogs, timeout/retry, victory, Thai combining marks, 640x480 layout, round cleanup and no remote Guest writes. Apps Script requests are intercepted; no live Sheets changes were made.

Validation: `node scripts/build-lettercraft.cjs --check` — up to date. `git diff --check` — no whitespace errors. Visual QA at 1440x900 and 640x480, no page errors.

Review: final_review found Shift modifier invalidation; reproduced as a failing regression then fixed. Also fixed completed-letter labels. Scoped re-review confirms addressed with no new important findings.

Renderer worker produced view.js but hit an account usage limit before reporting; parent inspected its code, completed missing resource letter labels, fixed overlapping hit selection, and performed browser QA.

Ruling: Kept completed work local without merging, committing, pushing or publishing. Deployment remains the user's existing workflow; the browser QA server is loopback-only.
