# Phase 1 renderer result

- Extended existing `view.js`: resolved shoulder camera, immediate orbit, eased pivot/zoom, padded boom sweep against existing terrain/entity descriptors and map bounds; collision retracts immediately and recovery eases.
- Bridge contract: call `updateCamera(game, dt)` once before pick/render; `dt = 0` resets follow state. Render initializes on new game/player identity. Picking uses the exact resolved camera.
- Added original teal explorer with six named articulated parts, boots, hair/face, scarf, backpack and placeholder held pickaxe. Existing atlas/vertex batch/depth testing retained. Idle/walk/run poses follow `player.facing`; lowest foot remains supported using `player.z` when present.
- Removed screen-space first-person hand. Player geometry stays outside world picking and plaque occlusion descriptors. Existing labels, drops, particles, target frames and cracks retained.
- Test-first failures confirmed for new camera, avatar and pick behavior; a gait support test additionally caught and fixed hovering boot corners.
- Verification: `node --test tests/lettercraft-view.test.cjs` — 15 passed, 0 failed. Parent owns browser integration and subsequent phase gates.

# Phase 2 renderer result

- Added distinct airborne rising/falling arm and leg poses driven by `grounded` and `vz`; landing countdown produces a short compress/recover pose. Rig support uses absolute `player.z` in every pose and shoulder attachments follow the landing crouch.
- Test-first airborne assertion failed before implementation. Verification: `node --test tests/lettercraft-view.test.cjs` — 16 passed, 0 failed. No physics, weapon redesign, enemy, or environment edits in this phase.
