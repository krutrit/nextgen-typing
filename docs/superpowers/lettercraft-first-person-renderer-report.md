# First-person renderer report

Implemented in src/lettercraft/view.js and tests/lettercraft-view.test.cjs.

- Native WebGL, one batched draw per frame, depth testing, 70-degree vertical perspective, fog and directional face shading.
- Deterministic 256×16 procedural pixel atlas with NEAREST filtering. Distinct grass tops/grass dirt sides, paths, stone, bark, leaves, wool, ore and tool materials.
- Shared cube descriptors drive geometry and nearest ray occlusion. Camera reads current yaw/pitch and heightAt + 1.6 for render and pick. Trunks/rocks occupy the agreed .8-wide footprint; foliage blocks rays without becoming an attack target. Heads resolve their owner's id.
- Stepped 32×32 terrain, tan crossing paths, a low stone curb outside the walkable map boundary, voxel clouds, trees, ore rocks, sheep and green enemies.
- Overlay includes readable Thai/English plaques with dotted-circle combining marks, completion labels, health bars, collection rings, particles, crosshair and swinging held tool. No minimap, preserving the world view.
- Plaques are perspective-positioned, distance culled/faded and ray-occlusion checked before both drawing and picking.
- GPU buffer, atlas texture, shaders/program are bounded and deleted on disposal or initialization failure. Clear error if WebGL is unavailable.

Validation: node --check src/lettercraft/view.js; node --test tests/lettercraft-view.test.cjs (10 passing). Projection/ray tests were first observed failing against the original isometric implementation; further coverage checks terrain occlusion and plaques behind trunks. Parent reports real Chrome FPS input tests passing with WebGL getError=0.

Chrome visual feedback follow-up: moved rock plaques from ground+1.17 to ground+1.45, making the first rock's letter visible in the open center of the starting view. Nearby drop plaques pin above the footer while preserving world-anchor ray occlusion. Collection progress now draws around the crosshair, so it remains visible even when the drop is directly beneath the player. Added two regression tests; both were observed failing before the correction.

Damage/selection follow-up: damaged owners receive dark branching crack strips on all four sides and top of their largest cube, with more branches at greater damage. Selection adds twelve thin gold edge rods around only the owner's largest cube. Both use the existing depth-tested geometry batch and never become collision/pick bodies. Added a failing-then-passing geometry regression verifying cracks, primary-body frame bounds, and no decoration on healthy untargeted objects. Parent should visually inspect the added cracks/frame in Chrome.

Notes: scene geometry uses axis-aligned cubes; creatures do not rotate their body cubes to movement direction. Static terrain geometry is cached by game, height function and size; heightAt is assumed immutable within a game as specified. Label picking extends to a plaque's visible square, but still compares its depth against the nearest cube. No game state is mutated and no listeners are registered.
