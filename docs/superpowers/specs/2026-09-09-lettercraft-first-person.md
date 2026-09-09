# Lettercraft — approved first-person upgrade

Authority: user explicitly requested implementation of the six-part FPS design in the conversation on 2026-09-09. This supersedes the isometric camera/rendering portions of the 2026-09-08 design. Existing lesson integration, five-minute clock, five hearts, 20-letter quest and hold rules remain.

## Acceptance requirements

1. Real perspective 3D viewed from player eyes, visible hand/tool at lower right, central crosshair; mouse yaw and pitch; click-to-Pointer-Lock and Esc unlock. No isometric/top-down view.
2. Depth-tested cubic world, original crisp pixel textures (distinct grass top/side, dirt, stone, bark, leaves); gentle terrain steps, trees/forest, rocks, sky, block clouds, directional face shading. No copied Minecraft assets or sounds.
3. W/up forward, S/down backward, A/D/left/right strafe relative to camera. Collision with ground and solid bodies. Visible target frame. Only the visible crosshair target can be mined/attacked within 1.85 map tiles; no attacks through obstacles.
4. Left click mines/chops/attacks, with swinging hand, cracks, fragments and generated sound. Letters belong to resources, animals, monsters; breaking drops a floating collectible. Nearby matching key held continuously for 3 seconds collects it; visible readable Thai/English label and progress ring. A fresh press of a WASD collection key while stationary takes priority over movement; already-held movement does not collect. Arrows can escape. Mouse look alone never cancels collecting.
5. Pickaxe/axe/sword drops upgrade damage and attack cooldown, never shorten the 3-second hold. Monsters chase and route around obstacles. Five hearts, one heart per successful hit, two seconds invulnerability. Exactly 20 required lesson letters in five minutes wins; time expiry and lethal damage precede final collection.
6. Clear hearts, time, equipment, letter count with open world/crosshair space; intro tutorial, help, win/loss, replay/exit. Preserve lessons/progress/Apps Script contracts. Verify actual browser controls and deliver an FPS screenshot.

## Implementation decisions

- Keep standalone index.html deployment; editable sources in src/lettercraft are embedded by scripts/build-lettercraft.cjs. No new external runtime dependency.
- Native WebGL scene plus Canvas2D labels/hand; terrain heights 0/.25/.5/.75 auto-step at ground level with eye height 1.6. No jumping was requested.
- Pointer Lock denial: explicit labeled fallback uses right-button drag for mouse look. Esc releases either mode. No WebGL: actionable error and return-to-lesson control.
- Existing timing rule retained: clock continues in menus, unlocked, hidden or blurred; movement/combat/collection pause. Clear held inputs on each transition.
- Original synthesized game/lesson sounds are reused; sound toggle remains on the lesson page.
- Letter labels remain world-occlusion checked. A nearby drop may pin its label above the footer; active collection also has a central ring so looking away still gives progress feedback.

## Verification

Pure engine and renderer tests cover movement, pitch, continuous holds, modifier changes, collisions, range/cooldown, combat, pathfinding, terrain, perspective, ray occlusion, target frames, cracks and labels.

Chrome/Playwright exercises actual key and mouse inputs: Pointer Lock/Esc, yaw/pitch, mining, collection while looking, walking/strafe, equipment pickup, obstruction/collision, chase and five hits, timeout/retry, victory, Thai marks, compact viewport, explicit capture denial fallback and missing-WebGL return. Fixtures control rare boundary states; no live Google Sheets writes.
