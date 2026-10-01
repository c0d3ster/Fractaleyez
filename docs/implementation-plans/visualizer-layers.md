# Visualizer Layers

## Context

Fractaleyez renders several independent visual things at once: Hopalong orbit particles, a Julia-set fractal (`julia-visualizer.ts`, config section `fractal`), a video background, and (new) a Logo overlay. Today these are wired ad hoc. Video is "on" only because `video.clips` is non-empty, Julia and Hopalong are separate visualizers, and the video-over-fractal masking added in `ee50020` is a `V` key toggle with mode-specific code in both the Julia shader and the Hopalong video plane.

This plan formalizes them as **layers**: a flat, ordered list of up to 5 enabled layers, each with its own opacity, blend mode, and z-position, composited together. Future layer types (Image, Elemental, more) slot in as new entries in the list.

Out of scope here: the asset-library modal (uploads, theming, favorites, pagination for video clips and images). The Logo sprite picker reuses the existing flat particle-sprite pool and upload pipeline as-is. A TASKS.md entry already tracks the richer library.

## Locked decisions

1. **Flat layer list, no tiers.** Layer types: Orbit (Hopalong attractor plus its particle rendering), Fractal (Julia), Video, Logo. Every layer has `enabled`, `opacity`, `blendMode`, and `order`. There is no background/mid/foreground distinction and no "one background layer only" rule.
2. **Global cap of 5 enabled layers.** Checked generically (count of `enabled.value === true` across all layer sections), enforced wherever `enabled` flips to true: block enabling a sixth and show the control as disabled with a reason. Revisit the number once more layer types exist to test it.
3. **Real z-order via per-layer render targets.** Each layer renders to its own target. A composite pass blends the targets in `order`, using each layer's `blendMode` and `opacity`. This replaces the fixed Video-farthest/Orbit-mid/Logo-nearest ordering and replaces the ad hoc video mask code. Open risk: up to five full-screen targets cost GPU and memory, so measure early.
4. **`blendMode` defaults to `mask` on every layer.** `mask` means the layer's black areas are transparent, so layers below it show through. The existing video-over-Julia behavior (Julia visible only in the video's black areas, or video visible only in Julia's black areas, depending on order) falls out of `mask` plus `order`, so the `V` toggle and its bespoke shader and plane code go away. Additional blend modes and the picker UI are a follow-on (see Follow-ons).
5. **Camera-attached Logo.** Logo's sprite is parented to the camera so it never gets parallax and renders in screen space. In the layer model it still renders to its own target like any other layer, so its z-position is just its `order`.
6. **Orbit and Particle config stay structurally separate.** They are different concepts (algorithm parameters vs particle rendering parameters). Both live under the Orbit layer's accordion as two nested sub-accordions, with the particle sprite selector inside Particle config.
7. **User, Effects, and Audio stay global.** They cut across layers and are not part of the layer system. (Audio config and the Video clip picker share one accordion; see Sidebar UI.)
8. **Logo's asset picker reuses the particle-sprite pool and upload pipeline** (`ParticleSpriteHud` / `uploadParticleHandler`) as a single-select. No new upload infrastructure.
9. **Video's `enabled` becomes explicit** instead of inferred from `clips.length`. Merge logic still derives `enabled = clips.length > 0` for presets saved before this change so nothing silently flips off.
10. **Enable/disable fades.** Opacity animates 0 to configured `opacity` on enable and back to 0 on disable, using the existing crossfade duration infrastructure (`PARTICLE_CROSSFADE_DURATION_DEFAULT_MS`, `getParticleCrossfadeDurationMs` / `setParticleCrossfadeDurationMs` in `src/config/visualizer.config.ts`) as the shared fade duration. No second duration setting.
11. **Style pass is separate.** Tighter margins between configs and shorter sliders happen after the structure lands, not inside the structural work.

## Config types

Every layer section extends a shared base. In `src/config/configDefaults.ts`:

```ts
export type BlendMode = 'mask' // widened in the blend-mode follow-on

export type LayerConfigBase = {
  enabled: CheckboxItem
  opacity: SliderItem
  blendMode: BlendMode // not a ConfigItem; no UI until the follow-on
  order: SliderItem // integer z-position, 0 = farthest from the viewer
}

export type OrbitConfigSection = LayerConfigBase & { a: SliderItem; b: SliderItem; c: SliderItem; d: SliderItem; e: SliderItem }
export type FractalConfigSection = LayerConfigBase & { tour: SliderItem }
export type VideoConfigSection = LayerConfigBase & { clips: string[]; allClips: string[]; index: number }
export type LogoConfigSection = LayerConfigBase & {
  sprite: MultiselectItem // single-select via min:1,max:1
  spin: CheckboxItem
  spinSpeed: SliderItem
  beatScale: SliderItem
  shake: SliderItem
  glowOnBeat: CheckboxItem
}
```

Notes:
- This extends the existing top-level `orbit` / `fractal` / `video` sections with the shared fields instead of introducing a `layers: {...}` wrapper. `mergeConfigSection` already iterates every key generically, so new fields need no new merge code, and a wrapper would break every direct `config.orbit.a.value` / `config.video.clips` access plus the bundled preset blobs for no functional gain.
- `AppConfig` gains `logo: LogoConfigSection`. `particle` stays its own top-level section (Decision 6).
- **Defaults:** `enabled: true, opacity: 1, blendMode: 'mask'` for orbit, fractal (confirm against current default behavior when discovery reads `configDefaults`), and video-with-clips; `logo.enabled: false` (a new feature should not render over existing shows). Default `order` preserves today's visual stacking: video 0, fractal 1, orbit 2, logo 3.
- **`sprite` field:** no existing `ConfigItem` variant is "pick exactly one from a pool." Reuse `MultiselectItem` with `min: 1, max: 1` rather than widening the `ConfigItem` union (used pervasively in `ConfigCategory.tsx`) for one field. The Logo picker is a bespoke component anyway.
- New `src/config/logo.config.ts` holds min/max/default/step constants, mirroring the bare-constants pattern in `orbit.config.ts` / `particle.config.ts` / `fractal.config.ts`. A shared layer constants file holds `LAYER_CAP = 5` and the default order and opacity values.
- `CONFIG_CATEGORY_ORDER` gets `'logo'`. `CONFIG_WINDOW_COLUMN_ORDER` replaces bare `'particle'` / `'orbit'` with a combined `'orbit_particle'` key (mirrors the existing `'effects_particle'` trick) and adds `'fractal'` and `'logo'` columns as needed.
- `StoredVideoSection` widens to `Pick<VideoConfigSection, 'clips' | 'index'> & Partial<Pick<VideoConfigSection, 'enabled' | 'opacity' | 'order'>>` so existing bundled presets keep compiling untouched.

## Config merge and migration (`src/components/config/context/ConfigProvider.tsx`)

- `mergeConfigSection` (generic over every key in a section's defaults) picks up `enabled` / `opacity` / `blendMode` / `order` for orbit and fractal and all of `logo.*` through its existing "missing key keeps default" fallback. Widen `ConfigSectionKey` to include `'logo'`.
- `mergeVideo` needs a branch for Decision 9: use `enabled.value` if the loaded config has a boolean one, else derive `enabled = clips.length > 0`. Same for `opacity` (default 1), `order`, `blendMode`. The early return for a missing or non-object `video` section must return all of these too (`enabled: false`, `opacity: 1`, default order, `'mask'`) so no renderer read ever sees `undefined`.
- `normalizeLoadedPreset` adds `logo: mergeConfigSection('logo', cfg.logo)` next to the existing section merges.
- **Order collisions:** two layers can end up with the same `order` (older presets, or two layers set to the same number). Normalize on load: sort by `(order, default order)` and rewrite to a dense 0..n-1 sequence. The UI order control also always writes dense values.
- `updateVideoClips` currently dispatches `videoClipsRestored` only on the empty/non-empty transition of `clips` (what `hopalong-visualizer.ts` listens to for create/dispose of the video plane). Add `updateVideoEnabled`, parallel to it, that flips `video.enabled.value` and dispatches the same event with `clips: enabled ? clips : []`, reusing the create/dispose path. (Discovery should confirm this event path still makes sense once video renders to its own target; if the layer pipeline owns video lifecycle directly, replace rather than extend.)
- New `updateLogoSprite`, parallel to `updateParticleSprites`: same `warmSpriteCache` pattern, sets `logo.sprite.value = [chosen]`.
- New layer-level actions: `setLayerEnabled` (enforces the 5-layer cap), `setLayerOpacity`, `setLayerOrder` (reorders and re-densifies all layers' `order`).
- No server or DB migration: presets are merged against `configDefaults` client-side on every load, and bundled presets already freely omit fields.

## Renderer

### Layer pipeline (new)

- A layer abstraction (e.g. `Layer` interface: `render(target, deltaTime, audio)`, `dispose()`, `resize()`) implemented by Orbit, Fractal, Video, and Logo. Each owns its scene, camera, and render target.
- A compositor owns the composite pass: a full-screen quad shader that samples each enabled layer's target in ascending `order`, applying that layer's `blendMode` (`mask` only for now) and `opacity`. Disabled layers are skipped and their targets can be released or kept per the memory measurements below.
- Targets are resized with the window and share the renderer. Measure memory and frame time with 4 and 5 layers enabled at the largest supported resolution before building the rest on top, and decide whether targets can run at reduced resolution for soft layers (e.g. Fractal) if needed.
- Replaces the ad hoc video mask path in `hopalong-manager.ts` (video plane `renderOrder` hack and screen blend) and the Julia shader's built-in video sampling (`uVideo` / `uVideoMask`, `setVideoMask`, the `V` key toggle). `mask` mode plus `order` reproduces both behaviors, so remove them as part of this step and keep the user-visible result. Fold Julia's "black areas" threshold (`VIDEO_MASK_EDGE`, steep smoothstep) into the compositor's `mask` blend.
- Post effects that currently run in the `EffectComposer` chain (bloom, shockwave) need a defined place: either per-layer (Orbit's own pass, matching today) or on the final composited image. Discovery should decide from how shockwave sources are placed for Julia vs Hopalong today.

### Per-layer behavior

- **Orbit** (`hopalong-visualizer.ts`, `hopalong-manager.ts`): renders into its own target. `orbit.enabled` and `orbit.opacity` are handled by the compositor and the fade animation (Decision 10), not by tearing down the particle system for a visibility toggle. Existing particle crossfades between generations keep working inside the Orbit layer.
- **Fractal** (`julia-visualizer.ts`): renders into its own target as a full-viewport shader quad, with its existing tour, shape, and audio reactivity unchanged. Its built-in video sampling is removed (see above).
- **Video:** the video plane becomes its own layer scene (full-viewport plane with pan overscan margin, as today), with `transparent: true` and opacity handled by the compositor. Replace the `clips.length`-only checks (`init()`, `nextVideo()` in `hopalong-visualizer.ts`) with `video.enabled.value && clips.length`. Keep the Chrome playback workarounds from `ee50020` (source element attached to the page as an opaque 2px dot, started with `play()` muted, resume if paused) since the video texture is still sampled from that element.
- **Logo** (new, in `hopalong-manager.ts` or its own module): owns its sprite directly, parented to the camera with a small local `position.z` offset via `CameraManager.getCamera()`, so it ignores `cameraBound` panning and `scaleFactor`. Reactive fields follow the existing `glow` / `shockwave` convention in `update()` (read `audioData.peak.value` / `.energy`):
  - `beatScale`: scale by `1 + peak.value * beatScale.value` when peak crosses the existing threshold.
  - `shake`: small random position offset scaled by `shake.value`, same peak gate.
  - `glowOnBeat`: nudge sprite opacity or tint with `peak.value * peak.energy`, the same formula the `glow` effect uses.
  - `spin` / `spinSpeed`: not beat-reactive; constant `rotation.z += spinSpeed.value * deltaTime` per frame.
- **Fades:** the compositor drives each layer's effective opacity toward its target (configured `opacity` if enabled, else 0) over the shared crossfade duration, instead of writing it directly.

## Sidebar UI

Vertical accordions per layer replace the originally planned tab strip. Tabs were rejected because User, Effects, and Audio are global, so the layers are peers, not the main axis of the whole sidebar.

- **Layer accordion header** (one per layer, new shared component): layer name, on/off state, the layer number on the right.
  - **Drag to set opacity:** dragging the header horizontally sets `opacity` 0-1. The header fills from a disabled look to fully opaque, using shades of blue for inactive vs active, matching the frequency analyzer's active/inactive pattern. A separate checkbox or eye affordance toggles `enabled` so dragging never doubles as a toggle. Dragging a disabled layer's header should enable it (still subject to the 5-layer cap).
  - **Layer number = `order`:** a small stepper or click on the number changes the layer's z-position and re-densifies all `order` values. No drag-to-reorder in v1.
- **Orbit layer body:** two nested accordions, "Orbit config" (the a-e sliders via the existing `ConfigCategory`) and "Particle config" (the existing particle sliders plus the particle sprite selector moved in from `ParticleSpriteHud`). Collapsed by default since both do not fit vertically.
- **Fractal layer body:** the existing fractal config (tour, shape pad access as it works today).
- **Video layer body:** the clip picker, split out of `ConfigVideo.tsx`.
- **Logo layer body:** spin, spinSpeed, beatScale, shake, glowOnBeat, and the Logo sprite picker.
- **Audio and Video clip picker group:** Audio config and the clip picker body share one vertical accordion. (The Video layer's header controls still live on its layer accordion; only the clip list placement is a design question for discovery to settle with the existing `ConfigVideo` structure.)
- **`ConfigVideo.tsx` refactor:** split its collapse-header ownership from its clip-list body so the body can be reused inside a layer accordion without a redundant nested header.
- **New sprite-upload hook** (e.g. `useSpriteUpload`), extracted from `ParticleSpriteHud.tsx` (`onFiles`, size and dimension constants), shared between `ParticleSpriteHud` (multi-select, add-to-array) and the Logo picker (single-select, replace-value).
- **`ConfigAccordion.tsx`:** the current `category === 'video' ? <ConfigVideo/> : <ConfigCategory/>` special case becomes a skip-set for `orbit` / `particle` / `fractal` / `video` / `logo`, rendering the layer accordions in `order` (highest layer number first or last is a discovery call; match the visual-stack metaphor) in their place.
- Layer cap UX: when 5 layers are enabled, enable controls on the others are disabled with a short reason.

## Expanded view (`ConfigWindow.tsx` / `ExternalWindowBridge`)

The expanded pop-out window has no accordions or tabs: one column per layer, always visible, because its purpose is zero-click glanceability during a live show.
- Add `'orbit_particle'`, `'fractal'`, and `'logo'` column branches, mirroring the existing `'effects_particle'` stacked-column pattern. `orbit_particle` stacks the Orbit and Particle categories; `logo` gets its own column with the sprite picker. Columns stay permanently open (`isOpen=true`, no-op `toggleOpen`).
- Layer header strip in each column (name, layer number, opacity fill) reuses the sidebar header component where practical, with drag-to-opacity working in the popup.
- A disabled layer's column stays visible but dimmed (opacity/grayscale), explicitly not `pointer-events: none`, so it can be tweaked and re-enabled from the popup.
- Per-frame work in the popup shares the main thread with the video texture (see `ee50020`), so keep the new header cheap.

## Implementation order

1. **Types and defaults** (`configDefaults.ts`, new `logo.config.ts`, shared layer constants): `LayerConfigBase`, `BlendMode`, `LogoConfigSection`, defaults, `CONFIG_CATEGORY_ORDER`, `CONFIG_WINDOW_COLUMN_ORDER`.
2. **Merge and migration** (`ConfigProvider.tsx`): `mergeVideo` branch, `logo` merge, order normalization, new layer actions including the 5-layer cap. Land early so config loads never break while UI and renderer work is incremental.
3. **Layer pipeline spike:** `Layer` interface and compositor with per-layer render targets, `mask` blend, `order`. First prove Orbit plus Fractal compose correctly, and measure GPU and memory with 4-5 layers. Decide where bloom and shockwave live.
4. **Port existing visualizers to layers:** Orbit, Fractal, and Video render to their own targets through the compositor. Remove the ad hoc video mask code (video plane `renderOrder` hack, Julia `uVideo`/`uVideoMask`, `V` toggle) once `mask` plus `order` reproduces it. Verify visual parity before and after.
5. **Logo layer:** sprite, camera attachment, beat-reactive fields, `updateLogoSprite`, and the `useSpriteUpload` extraction.
6. **Enable/disable fades and opacity** in the compositor using the shared crossfade duration.
7. **Sidebar UI:** `ConfigVideo.tsx` split, shared layer accordion header with drag-to-opacity, layer number control, Orbit nested accordions (sprite selector moved into Particle config), Fractal / Video / Logo bodies, `ConfigAccordion.tsx` skip-set, cap UX.
8. **Expanded view:** `ConfigWindow.tsx` column branches, dimmed disabled columns, layer header strip in the popup.
9. **TASKS.md and docs:** keep the asset-library entry current, update CLAUDE.md's Visualization pipeline and Config system sections for the layer model.

### Follow-ons (separate tasks, after the above)

- **Blend mode UI and modes:** per-layer picker plus additional modes (normal, add, screen, multiply). The UI is the hard part: a dropdown per layer header or in the layer body, and how it reads in the compact expanded view. Every layer defaults to `mask` until this lands.
- **Compact style pass:** reduce margins between configs and slider height so more fits on the page. Do it after the accordion structure exists, so the new rows are what gets compacted.

## Critical files

- `src/config/configDefaults.ts`
- `src/config/logo.config.ts` (new), shared layer constants (new)
- `src/components/config/context/ConfigProvider.tsx`
- `src/visualization/hopalong-manager.ts`
- `src/visualization/hopalong-visualizer.ts`
- `src/visualization/julia-visualizer.ts` (and `src/visualization/shaders`)
- Layer abstraction and compositor (new, under `src/visualization/`)
- `src/components/config/ConfigVideo.tsx`
- `src/components/config/ConfigAccordion.tsx`
- `src/components/config/ConfigWindow.tsx`
- Layer accordion header and Logo picker components (new, under `src/components/config/`)
- `src/components/huds/ParticleSpriteHud.tsx` (source of the extracted upload hook; sprite selector moves into Particle config)

## Verification

- `yarn typecheck` and `yarn lint` after each stage (the types stage especially, to confirm no `AppConfig` consumer broke).
- `yarn dev`, then manually:
  - Toggle each layer's enabled state in both the sidebar and the pop-out expanded view, and confirm layers compose in `order`, including video in front of Julia showing the fractal only in the video's black areas (the behavior the `V` toggle gave).
  - Drag each header to confirm opacity fades the layer and enabling past 5 layers is blocked with a reason.
  - Change a layer's number and confirm the stack order changes on screen and orders stay dense.
  - Confirm a disabled layer's popup column is dimmed but responsive.
  - Load an old bundled preset (no `enabled` / `opacity` / `order` / `logo` keys) and confirm it does not crash and preserves its prior video on/off state.
  - Watch frame time and memory with 4-5 layers enabled and while swapping presets rapidly (each swap can rebuild and crossfade multiple layers at once).
