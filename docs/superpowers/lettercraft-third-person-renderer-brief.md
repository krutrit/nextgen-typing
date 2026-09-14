# Phase 1 — third-person camera and block character

Extend existing view.js, do not replace whole engine. Own ONLY src/lettercraft/view.js and tests/lettercraft-view.test.cjs. Parent owns core/bridge/UI/browser. No subagents/commits. Use apply_patch and TDD for camera/rig behavior.

Existing architecture and code must be reused. First task ONLY phase 1, later phases will follow after checks. Native WebGL existing batching, atlas, scene descriptors, pick/labels/cracks/particles stay.

Parent adds game.cameraDistance default4.4 (zoom2.2..7), player.facing (body yaw), player.moving and player.running. player.angle/pitch remain camera orbit yaw/pitch (yaw0+X, right+Y, pitchpositiveup). Existing camera-relative core direction remains; moving rotates facing independently. Later adds player.z feet elevation, vz/grounded/landing; renderer should use player.z if finite else heightAt. Default pitch becomes -.32. No other core fields needed.

Implement updateCamera(game,dt) called by bridge once before pick/render. Camera trails pivot smoothly, orbit mouse angle/pitch immediate enough for targeting, distance zoom smoothed; prevent camera clipping by sweeping expanded obstacle AABBs along pivot-camera segment including terrain/trunks/foliage/map bounds, retract immediately and recover smoothly. Pick must use same resolved rendered camera, not stale or independently recalc eye. Constructor/reset renders with dt0 initializes. Camera shows full avatar from behind: choose shoulder offset .65 or sensible center framing to preserve crosshair target usability. Exclude own avatar from picking but render with depth, don't let own avatar hide required labels unnecessarily.

Full original friendly adventurer rig: head/body/left-right arms/legs, backpack/scarf/hair details optional. Use cube geometry, transforms per limb and yaw (extend _boxVertices to support transformed vertices or existing geometry helper); procedural idle/walk/run in phase1. Remove first-person screen hand and keep placeholder held existing pickaxe geometry if easy; polished distinct weapons phase3. Do not build new physics or inventory. Keep player's feet supported by terrain; character typical height1.6, width.6. Existing collision player radius.27.

Adapt FPS-only view tests to third-person, keep pure projection/rays, occlusion/frame/cracks tests and add: camera behind avatar with full-body screen framing; zoom bounded/collision retract prevents camerainsidebox; avatar has six named body parts and animation changes limbs; pick agrees rendered camera and excludes player. Legacy test fixture may supply a fixed view.camera if testing primitive picking independent of new camera.

Report phase1 result and commands in docs/superpowers/lettercraft-third-person-renderer-report.md. Keep report concise; parent browser tests after build. Do not implement later phases yet.
