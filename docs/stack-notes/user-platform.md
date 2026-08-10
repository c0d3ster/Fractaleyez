# user-platform

## #2 Add crossfade for preset switching

Branch: overnight/2026-08-07/02-particle-crossfade

### Hard-reset trigger (confirmed)

`HopalongManager.particleConfigChanged()` (`src/visualization/hopalong-manager.ts`) polls
`window.config.particle` every frame against the live `HopalongVisualizer` instance's own
fields. Any drift (particle count/layers/levels/saturation/size, or a new `sprites` array
reference) used to call `resetVisualization()`, which synchronously destroyed the whole
`HopalongVisualizer` (disposing its scene) and constructed+initialized a brand new one on
the same frame — one frame with the old particle system gone and the new one not yet drawn.
This is the *only* hard-reset path in the app; per `README.md` it's specific to the Particle
Config category (orbit/user/effects changes mutate in place, no full rebuild). Since preset
switching (`retrieveConfigPreset`/`resetConfig` in `ConfigProvider.tsx`) writes a whole new
`window.config`, it routes through this same path whenever the incoming preset's particle
section differs from the current one.

### Implementation

Mainly in `src/visualization/hopalong-manager.ts`, with a sprite-texture cache added in
`src/utils/textureCache.ts` (particle systems reuse the same handful of sprite URLs across
dozens of layer/level objects; caching avoids re-decoding/re-uploading the same texture per
object) and, later, an equivalent per-object crossfade for Orbit Config changes added to
`src/visualization/hopalong-visualizer.ts` (see "Later additions" below). `resetVisualization()`
is replaced by:

- `startCrossfade()` — constructs the new (`incoming`) `HopalongVisualizer`, and reparents
  the *outgoing* visualizer's particle `Points` objects into `incoming.scene` via
  `THREE.Object3D#add()` (which moves rather than copies). `this.hopalongVisualizer` flips to
  `incoming` immediately so config-diffing, camera, and `update()` calls all target it from
  the next line onward. `setupEffects()` is re-run so the `EffectComposer`'s `RenderPass`
  points at the new (now-combined) live scene — same call the old code made, no new pass
  wiring needed, since crossfading is just an opacity tween on objects that already live in
  one scene together.
- `advanceCrossfade(deltaTime)` — runs every frame while a fade is active: tweens outgoing
  opacity `1→0` and incoming opacity `0→1` linearly over `PARTICLE_CROSSFADE_DURATION_MS`,
  via `setParticleOpacity()` (sets `.myMaterial.opacity`; materials are already
  `transparent: true` from construction). Both the outgoing and incoming visualizers keep
  receiving `update(deltaTime, audioData)` during the fade, so the old particles keep
  animating/rotating rather than freezing mid-fade.
- `finalizeCrossfade()` — once `t >= 1`, moves the outgoing objects *back* into the outgoing
  visualizer's own (unrendered) scene, then calls its existing `destroyVisualization()`. This
  reuses `HopalongVisualizer`'s own tested `disposeScene`/`disposeMaterial` traversal instead
  of duplicating geometry/material/texture disposal logic in the manager, and avoids leaking
  the outgoing particle objects into the live scene permanently.
- If a second particle-config change lands mid-fade, `startCrossfade()` finalizes the
  in-progress fade first, then starts a fresh one from the current (possibly
  partially-faded) incoming visualizer. Verified via a scripted 3-preset-in-a-row switch —
  no leak, no growth in live scene child count across repeated fades.

`PARTICLE_CROSSFADE_DURATION_MS` added to `src/config/visualizer.config.ts` per the task's
sub-task 3 (a fixed default for now; a future config-gear task makes it user-configurable).
Tuned during the session to 750ms, paired with `MAX_CROSSFADE_GENERATIONS = 4` (see "Later
additions") -- 800/1000ms values mentioned elsewhere in this doc are from earlier in
development and no longer current.

### `ConfigProvider.tsx` (sub-task 4) — no code change, and why

`retrieveConfigPreset`/`resetConfig` already write straight to `window.config` (synchronously,
same tick as the React `setConfig`). `HopalongManager.update()` runs on `main.ts`'s own
`requestAnimationFrame` loop, completely decoupled from React, and polls `window.config` every
frame — this is the *existing* mechanism every other config mutator in this codebase
(`updateConfigItem`, `updateParticleSprites`, keyboard handlers) already relies on to reach the
visualizer. Since the crossfade fix lives inside `particleConfigChanged()`'s own trigger point,
every caller that mutates `window.config.particle` — presets included — is automatically routed
through it with no ConfigProvider-side change required. Adding a direct
ConfigProvider → HopalongManager call would introduce a new coupling across the
React/Three.js boundary that doesn't exist anywhere else in the codebase and isn't needed here.

### Verified

- `yarn typecheck`, `yarn lint`, `yarn test` all pass.
- Manual browser verification (Playwright, temporary — not committed): confirmed via a debug
  hook that `startCrossfade()`/`advanceCrossfade()` ran for the full duration (800ms at the
  time of this check; the constant was tuned to 750ms afterward, see "Later additions") with
  correctly complementary opacities (e.g. sampled mid-fade: outgoing 0.109 / incoming 0.891 at
  713ms/800ms elapsed), and that `finalizeCrossfade()` leaves no orphaned objects in the live
  scene after 3 consecutive preset switches (children count tracks the current preset's own
  layer/level count each time, no growth). Not re-run against later changes below.

### Known deviation / limitation

The task's acceptance criteria ("no frame where the scene hard-resets") is about the particle
system specifically, matching the README's documented Particle-Config-only warning. Two other
elements are *not* crossfaded, both pre-existing behavior, out of scope here:
- **Video plane**: on preset switches that also change `video.clips`, the old plane is
  disposed and a new one created immediately (`HopalongVisualizer.createVideoPlane`), same as
  before this task. Video wasn't called out in the acceptance criteria and isn't part of the
  Particle Config hard-reset the README describes.
- **Lights**: outgoing's `PointLight`s are not reparented/faded — confirmed harmless since
  `THREE.PointsMaterial` (used for all particles) is unlit and ignores scene lights entirely.

### Later additions (post-review, same branch)

Review feedback (Cursor Bugbot, CodeRabbit) and follow-up requests surfaced several more
issues addressed on this branch after the initial implementation above:

- **Sprite texture cache** (`src/utils/textureCache.ts`): particle systems reuse a handful of
  sprite URLs across dozens of layer/level objects; each used to get its own `TextureLoader`
  call. Refcounted cache reuses one GPU upload per unique URL — fixed the worst-case preset
  lag (`notes`/`noteExplosion`, which re-decoded/re-uploaded oversized sprites 40x per switch).
- **Orbit Config crossfade** (`HopalongVisualizer`): orbit slider changes (`a`-`e`,
  `scaleFactor`) previously overwrote particle position buffers directly, snapping instantly —
  the same jarring jump the Particle Config crossfade above was built to avoid, just via a
  separate code path (`updateOrbit()`'s own poll interval, never routed through
  `HopalongManager`). Now uses the identical double-buffer opacity technique, scoped to one
  visualizer's own objects: `startOrbitFade()`/`advanceOrbitFade()`/`finalizeOutgoingOrbitFade()`.
- **Crossfade generation cap**: both crossfades now support up to `MAX_CROSSFADE_GENERATIONS`
  (4) concurrent generations — 1 incoming + up to 3 still-fading outgoing, each fading
  independently — instead of always truncating an in-flight fade the instant another change
  landed. Tuned alongside `updateOrbit()`'s poll interval (250ms) and
  `PARTICLE_CROSSFADE_DURATION_MS` (750ms) so 3 outgoing slots exactly cover a full fade
  (3 × 250ms = 750ms) with no truncation gap.
- **Outgoing visualizer bugs fixed during review**: outgoing visualizers kept polling
  `window.config` and reshaping themselves around the *incoming* preset's values mid-fade
  (`freezeConfig()` now stops this); a spurious orbit fade fired on every new visualizer's
  first `updateOrbit()` tick because `lastOrbitParams` started `null` (now seeded from live
  config at construction); `scaleFactor` changes lost their compensating Z-depth shift when
  orbit changes became a crossfade (reinstated in `startOrbitFade()`); the outgoing side of a
  particle crossfade kept its old `<video>` element playing/audible for the full fade
  duration since only particle `Points` were reparented (now torn down in `freezeConfig()`);
  `setupEffects()` rebuilt `EffectComposer` on every crossfade without disposing the previous
  one, leaking render targets on every Particle Config drag tick (now disposed first).
- **Opacity easing tried and reverted**: a quadratic ease (`t²` / `(1-t)²`) was tried to fix a
  perceived "snaps to 100%" look on additive-blended particles, but broke the
  `incomingOpacity + outgoingOpacity = 1` invariant linear crossfading has — `t² + (1-t)²`
  dips to 0.5 at the midpoint, causing a visible mid-fade dim and end-of-fade flash, which was
  worse than the original front-loaded-but-smooth linear fade. Reverted back to plain linear.
