# Visualizer Layers

## Context

Fractaleyez renders several independent visual things at once: Hopalong orbit particles, a Julia-set fractal (`julia-visualizer.ts`, config section `fractal`), a video background, and (new) a Logo overlay. Today these are wired ad hoc. Video is "on" only because `video.clips` is non-empty, Julia and Hopalong are separate visualizers, and the video-over-fractal masking added in `ee50020` is a `V` key toggle with mode-specific code in both the Julia shader and the Hopalong video plane.

This plan formalizes them as **layers**: a flat, ordered stack of up to 5 enabled layers, each with its own opacity and blend mode, composited together in stack order. Future layer types (Image, Elemental, more) slot in as new entries in the list.

Out of scope here: the asset-library modal (uploads, theming, favorites, pagination for video clips and images). The Logo sprite picker reuses the existing flat particle-sprite pool and upload pipeline as-is. A TASKS.md entry already tracks the richer library.

## Locked decisions

1. **Flat layer list, no tiers.** Layer types: Orbit (Hopalong attractor plus its particle rendering), Fractal (Julia), Video, Logo. Every layer has `enabled`, `opacity`, `blendMode`, and a position in a stack. There is no background/mid/foreground distinction and no "one background layer only" rule.
2. **Layer settings live in a separate `layers` stack, not inside each layer's algorithm section.** `layers.order` is an ordered list of layer keys (back to front, so the position is the z-order) and `layers.meta` holds `enabled` / `opacity` / `blendMode` per key. Algorithm sections (`orbit`, `fractal`, `video`, `logo`, `particle`) stay pure parameters. This avoids collision handling for numeric `order` values, makes reordering a list swap, and keeps a future move to multiple instances of one layer type contained to how the stack addresses layers.
3. **Layer descriptor registry.** One entry per layer type: key, label, sidebar body component, whether it has a body, and popup column(s). The sidebar, popup, cap check, and compositor all read it, so adding a layer type is one entry plus its renderer.
4. **Global cap of 5 enabled layers.** Checked generically (count of `layers.meta[*].enabled.value === true`), enforced wherever `enabled` flips to true: block enabling a sixth and show the control as disabled with a reason. Revisit the number once more layer types exist to test it.
5. **Real z-order via per-layer render targets.** Each layer renders to its own target. A composite pass blends the targets in stack order (`layers.order`), using each layer's `blendMode` and `opacity`. This replaces the fixed Video-farthest/Orbit-mid/Logo-nearest ordering and replaces the ad hoc video mask code. Open risk: up to five full-screen targets cost GPU and memory, so measure early.
6. **`blendMode` defaults to `mask` on every layer.** `mask` means the layer's black areas are transparent, so layers below it show through. The existing video-over-Julia behavior (Julia visible only in the video's black areas, or video visible only in Julia's black areas, depending on stack order) falls out of `mask` plus the stack order, so the `V` toggle and its bespoke shader and plane code go away. Additional blend modes and the picker UI are a follow-on (see Follow-ons).
7. **Camera-attached Logo.** Logo's sprite is parented to the camera so it never gets parallax and renders in screen space. In the layer model it still renders to its own target like any other layer, so its z-position is just its place in `layers.order`.
8. **Orbit and Particle config stay structurally separate.** They are different concepts (algorithm parameters vs particle rendering parameters). Both live under the Orbit layer's accordion as two nested sub-accordions, with the particle sprite selector inside Particle config.
9. **Fixed display order, shared by sidebar and popup:** user, color, effects, audio, video, fractal, orbit, logo. User, color, effects, and audio are global: they cut across layers and are not part of the layer system. Color is the future shared Color config. It ships as a non-functional preview here and is implemented separately (see the Color config note in memory and TASKS.md). The display order is independent of the z-stack, so reordering layers never moves rows or columns. The Video layer's clip picker lives in the Video layer's own body, directly below Audio.
10. **Logo's asset picker reuses the particle-sprite pool and upload pipeline** (`ParticleSpriteHud` / `uploadParticleHandler`) as a single-select. No new upload infrastructure.
11. **Video's `enabled` becomes explicit** instead of inferred from `clips.length`. Merge logic still derives `enabled = clips.length > 0` for presets saved before this change so nothing silently flips off.
12. **Enable/disable fades.** Opacity animates 0 to configured `opacity` on enable and back to 0 on disable, using the existing crossfade duration infrastructure (`PARTICLE_CROSSFADE_DURATION_DEFAULT_MS`, `getParticleCrossfadeDurationMs` / `setParticleCrossfadeDurationMs` in `src/config/visualizer.config.ts`) as the shared fade duration. No second duration setting.
13. **Style pass is separate.** Tighter margins between configs and shorter sliders happen after the structure lands, not inside the structural work.

## Config types

Layer settings live in one new top-level `layers` section. Algorithm sections hold only their own parameters. In `src/config/configDefaults.ts`:

```ts
export type LayerKey = 'video' | 'fractal' | 'orbit' | 'logo' // widened as layer types are added
export type BlendMode = 'mask' // widened in the blend-mode follow-on

export type LayerMeta = {
  enabled: CheckboxItem
  opacity: SliderItem
  blendMode: BlendMode // not a ConfigItem; no UI until the follow-on
}

export type LayersConfigSection = {
  order: LayerKey[] // back to front: index 0 is farthest, the last entry is in front
  meta: Record<LayerKey, LayerMeta>
}

// unchanged algorithm sections
export type OrbitConfigSection = { a: SliderItem; b: SliderItem; c: SliderItem; d: SliderItem; e: SliderItem }
export type FractalConfigSection = { tour: SliderItem }
export type VideoConfigSection = { clips: string[]; allClips: string[]; index: number }
export type LogoConfigSection = {
  sprite: MultiselectItem // single-select via min:1,max:1
  spinSpeed: SliderItem
  beatScale: SliderItem
  shake: SliderItem
}
```

Notes:
- `AppConfig` gains `layers: LayersConfigSection` and `logo: LogoConfigSection`. `particle` stays its own top-level section (Decision 8) and is part of the Orbit layer's UI but not a layer itself.
- **Layer number in the UI** is derived: position in `layers.order` plus one (or zero-based, to match the descriptor; discovery to pick one and be consistent). Higher is in front. It is a z-position label only. It does not control where the layer's row or column sits in the UI (see the fixed display order below).
- **Why not per-section fields:** putting `enabled`/`opacity`/`order` inside every algorithm section would force numeric `order` collision handling and make `particle` a special case. It would also mean a later move to multiple instances of one type has to rework every section.
- **Registry:** a layer descriptor table (key, label, body component, hasBody, popup columns) in a new `src/config/layers.ts`. Everything that enumerates layers reads it.
- **Defaults:** every layer `enabled: true, opacity: 1, blendMode: 'mask'` except `logo.enabled: false` (a new feature should not render over existing shows). Default `order` preserves today's visual stacking: `['video', 'fractal', 'orbit', 'logo']`. Confirm how today's Julia/Hopalong/both selection maps onto `enabled` for old presets when discovery reads the current mode switching code.
- **`sprite` field:** no existing `ConfigItem` variant is "pick exactly one from a pool." Reuse `MultiselectItem` with `min: 1, max: 1` rather than widening the `ConfigItem` union (used pervasively in `ConfigCategory.tsx`) for one field. The Logo picker is a bespoke component anyway.
- New `src/config/logo.config.ts` holds min/max/default/step constants, mirroring the bare-constants pattern in `orbit.config.ts` / `particle.config.ts` / `fractal.config.ts`. A shared layer constants file holds `LAYER_CAP = 5` and the default order and opacity values.
- `CONFIG_CATEGORY_ORDER` and `CONFIG_WINDOW_COLUMN_ORDER` are replaced by one fixed **display order** in the registry, used by both the sidebar and the popup: `user`, `color`, `effects`, `audio`, `video`, `fractal`, `orbit`, `logo`. `color` is the shared Color config. Until its real implementation lands (a separate branch), it renders as a non-functional preview entry in both surfaces, like Logo's preview, and is skipped by the layer system since it is global. Orbit is one entry with two sections (orbit config, particle config). The display order is independent of `layers.order` (the z-stack): reordering the stack never moves rows or columns, so controls stay where muscle memory expects them during a show. Column count is 8 (user, color, effects, audio, video, fractal, orbit, logo), all the same 205px width, so `--config-column-count` goes from 7 to 8 and `POPOUT_WIDTH` from 1500 to about 1670, which fits a 1920px second screen.
- `layers` is optional in stored/bundled presets, so existing bundled presets keep compiling untouched and fall back to defaults. `StoredVideoSection` stays as is.

## Config merge and migration (`src/components/config/context/ConfigProvider.tsx`)

- `mergeConfigSection` (generic over every key in a section's defaults) picks up all of `logo.*` through its existing "missing key keeps default" fallback. Widen `ConfigSectionKey` to include `'logo'`.
- New `mergeLayers` for the `layers` section (it is not a flat section of items, so the generic merge does not fit): take `order` from the loaded config only if it is a permutation of the known `LayerKey`s (drop unknown keys, append missing ones in default order, dedupe); merge each `meta[key]` field-by-field against defaults. A missing `layers` section yields defaults.
- `mergeVideo` keeps its current clip handling. The legacy inference for Decision 11 moves into `mergeLayers`: if the loaded config has no `layers.meta.video.enabled`, derive it as `clips.length > 0`. The early return for a missing or non-object `video` section keeps returning an empty clip list, and `video` layer `enabled` defaults to false in that case.
- `normalizeLoadedPreset` adds `logo: mergeConfigSection('logo', cfg.logo)` and `layers: mergeLayers(cfg.layers, mergedVideo)` next to the existing section merges.
- `updateVideoClips` currently dispatches `videoClipsRestored` only on the empty/non-empty transition of `clips` (what `hopalong-visualizer.ts` listens to for create/dispose of the video plane). Enabling or disabling the video layer should reuse that create/dispose path (dispatch the same event with `clips: enabled ? clips : []`). Discovery should confirm this event path still makes sense once video renders to its own target; if the layer pipeline owns video lifecycle directly, replace rather than extend.
- New `updateLogoSprite`, parallel to `updateParticleSprites`: same `warmSpriteCache` pattern, sets `logo.sprite.value = [chosen]`.
- New layer-level actions: `setLayerEnabled` (enforces the 5-layer cap, and for video triggers the lifecycle path above), `setLayerOpacity`, `moveLayer` (reorders `layers.order`; no renumbering needed).
- No server or DB migration: presets are merged against `configDefaults` client-side on every load, and bundled presets already freely omit fields.

## Renderer

### Layer pipeline (new)

- A layer abstraction (e.g. `Layer` interface: `render(target, deltaTime, audio)`, `dispose()`, `resize()`) implemented by Orbit, Fractal, Video, and Logo. Each owns its scene, camera, and render target.
- A compositor owns the composite pass: a full-screen quad shader that samples each enabled layer's target in `layers.order` (back to front), applying that layer's `blendMode` (`mask` only for now) and `opacity`. `mask` is a luminance key: every layer renders opaque on black into its target, and the composite treats black as transparent, so it works the same for particles, shaders, video, and the logo. Disabled layers are skipped and their targets can be released or kept per the memory measurements below.
- Targets are resized with the window and share the renderer. Measure memory and frame time with 4 and 5 layers enabled at the largest supported resolution before building the rest on top, and decide whether targets can run at reduced resolution for soft layers (e.g. Fractal) if needed.
- Replaces the ad hoc video mask path in `hopalong-manager.ts` (video plane `renderOrder` hack and screen blend) and the Julia shader's built-in video sampling (`uVideo` / `uVideoMask`, `setVideoMask`, the `V` key toggle). `mask` mode plus stack order reproduces both behaviors, so remove them as part of this step and keep the user-visible result. Fold Julia's "black areas" threshold (`VIDEO_MASK_EDGE`, steep smoothstep) into the compositor's `mask` blend.
- Post effects that currently run in the `EffectComposer` chain (bloom, shockwave) need a defined place. Recommendation: run them once on the final composited image. Shockwave is a screen-space distortion, so this removes the current Julia-vs-Hopalong duplication. The catch is that the Logo gets warped too, which may need a per-layer opt-out later. Discovery should confirm against how shockwave sources are placed today.
- A layer at zero effective opacity (disabled and fully faded out) skips rendering entirely, so five targets only cost GPU when they are actually visible.

### Per-layer behavior

- **Orbit** (`hopalong-visualizer.ts`, `hopalong-manager.ts`): renders into its own target. The orbit layer's `enabled` and `opacity` (in `layers.meta`) are handled by the compositor and the fade animation (Decision 12), not by tearing down the particle system for a visibility toggle. Existing particle crossfades between generations keep working inside the Orbit layer.
- **Fractal** (`julia-visualizer.ts`): renders into its own target as a full-viewport shader quad, with its existing tour, shape, and audio reactivity unchanged. Its built-in video sampling is removed (see above).
- **Video:** the video plane becomes its own layer scene (full-viewport plane with pan overscan margin, as today), with `transparent: true` and opacity handled by the compositor. Replace the `clips.length`-only checks (`init()`, `nextVideo()` in `hopalong-visualizer.ts`) with the video layer's `enabled` flag and `clips.length`. Keep the Chrome playback workarounds from `ee50020` (source element attached to the page as an opaque 2px dot, started with `play()` muted, resume if paused) since the video texture is still sampled from that element.
- **Logo** (new, in `hopalong-manager.ts` or its own module): owns its sprite directly, parented to the camera with a small local `position.z` offset via `CameraManager.getCamera()`, so it ignores `cameraBound` panning and `scaleFactor`. Reactive fields follow the existing `glow` / `shockwave` convention in `update()` (read `audioData.peak.value` / `.energy`):
  - `beatScale`: scale by `1 + peak.value * beatScale.value` when peak crosses the existing threshold.
  - `shake`: small random position offset scaled by `shake.value`, same peak gate.
  - glow: no logo setting; the Effects `glow` switch nudges the sprite tint with `peak.value * peak.energy`, the same formula the `glow` effect uses.
  - `spinSpeed`: not beat-reactive; constant `rotation.y += spinSpeed.value * deltaTime` per frame (a 3D turn on the logo's vertical axis). 0 is no spin (there is no separate spin toggle).
- **Fades:** the compositor drives each layer's effective opacity toward its target (configured `opacity` if enabled, else 0) over the shared crossfade duration, instead of writing it directly.

## Sidebar UI

Vertical accordions per layer replace the originally planned tab strip. Tabs were rejected because User, Effects, and Audio are global, so the layers are peers, not the main axis of the whole sidebar.

The visual design is the "Fractaleyez Layer Sidebar" canvas (current as of the fixed display order and nested Orbit accordions) (https://claude.ai/artifact/TDWRJKCChbk3GkUmKvWSv6). It reproduces today's sidebar spacing, including the presets block, so the layout can be judged at true size. Where this section and the canvas disagree, ask before building.

- **Sidebar structure, top to bottom:** presets block (unchanged), "Configuration" title with the expand button (unchanged), then every entry in the fixed display order as an accordion: the global rows (user, color preview, effects, audio) are normal `ConfigCategory` rows and the layer rows (video, fractal, orbit, logo) use the layer header, with no separate "Layers" group, so Video sits directly below Audio. The sidebar stays single-open (`canOpenMultiple={false}` today), so one accordion is open at a time.
- **Layer accordion header** (one per layer, new shared component, reused in the popup): power icon to toggle `enabled`, layer name, opacity percent, layer number badge on the right, and a chevron (sidebar only; the popup has no chevron since columns are always open).
  - **Drag to set opacity:** dragging the header horizontally sets opacity 0-1. The header fills left to right, bright blue when the layer is on and dim steel when it is off. An off layer keeps its fill so the remembered opacity stays visible. The power icon is the only enable toggle, so dragging never doubles as one. Dragging an off layer's header should also turn it on (subject to the cap). Needs keyboard support too: header is focusable with a slider role, arrow keys step opacity.
  - **Layer number:** displays the layer's z-position from `layers.order` (higher is in front). A small stepper or click on the number moves it (`moveLayer`). No drag-to-reorder in v1. The row itself does not move; only the number and the composite change.
  - **Cap state:** with 5 layers on, the power icon on the others is disabled with a tooltip giving the reason.
- **Orbit layer body:** two nested accordions, "orbit config" (a-e sliders via the existing `ConfigCategory`) and "particle config" (the existing particle sliders plus the particle sprite selector, moved in from `ParticleSpriteHud`, which today only appears in the popup). Both start collapsed since they do not fit together. The nested accordions use the same title and content styling as the existing categories.
- **Fractal layer body:** "tour" slider plus the Shape pad. The Shape pad stays in Fractal config. The Camera pad stays in User config.
- **Video layer body:** the clip picker (the clip-pill list), split out of `ConfigVideo.tsx`. There is no separate Video row in the global group. Video has a body, so it expands like the other layers.
- **Logo layer body** (preview only until the Logo layer is functional): single-select sprite picker, spin speed / beat scale / shake sliders.
- **`ConfigVideo.tsx` refactor:** split its collapse-header ownership from its clip-list body so the body can be reused inside the Video layer accordion without a redundant nested header.
- **New sprite-upload hook** (e.g. `useSpriteUpload`), extracted from `ParticleSpriteHud.tsx` (`onFiles`, size and dimension constants), shared between `ParticleSpriteHud` (multi-select, add-to-array) and the Logo picker (single-select, replace-value).
- **`ConfigAccordion.tsx`:** renders the entries from the descriptor registry in the fixed display order, using `ConfigCategory` for global entries and the layer accordion for layer entries. The current `category === 'video'` special case goes away.

## Expanded view (`ConfigWindow.tsx` / `ExternalWindowBridge`)

The expanded pop-out window has no tabs and no top-level accordions (the one exception is the Orbit column's nested sections): everything else is always visible, because its purpose is zero-click glanceability during a live show. This is the most important surface, and the canvas's first board shows it at true size.

- **Layout, left to right:** presets block (pack tabs, save form, 18 presets per page with hotkey badges, pagination; unchanged), then the fixed display order as 205px columns: user (+ camera pad), color (preview only until implemented), effects, audio (+ frequency and beat HUDs), Video (+ perf HUD), Fractal (+ shape pad), Orbit, Logo. Orbit is a single column with its layer header on top and two nested accordions below (orbit config, particle config + sprite HUD), the same structure as the sidebar. This keeps the two surfaces consistent and keeps column count down; an adaptive side-by-side layout for wide windows is possible later but is not planned.
- **Layer header strip:** each layer's column starts with the shared layer header (no chevron), above that layer's config categories. Drag-to-opacity and the power toggle work in the popup.
- **Disabled layers:** the layer's config columns (not its header) are dimmed (opacity and grayscale), explicitly not `pointer-events: none`, so a disabled layer can be tweaked and re-enabled from the popup. This reuses the existing `config-inactive` class already used for visualizers that are not showing.
- **Window size:** 8 columns (user, color, effects, audio, video, fractal, orbit, logo), so `--config-column-count` goes from 7 to 8 and `POPOUT_WIDTH` from 1500 to about 1670. The existing second-screen sizing already clamps to `availWidth` and scrolls horizontally on narrower screens.
- **Height:** the Orbit column shows one nested accordion open at a time (Particle open by default, since it holds the sprite picker), so it is no longer taller than the window. The other columns keep today's heights. The compact style pass can still tighten spacing everywhere.
- The popup keeps forwarding hotkeys to the main window (existing `forwardKey` behavior), and the new header must not swallow keys that should be forwarded.
- Per-frame work in the popup shares the main thread with the video texture (see `ee50020`), so keep the new header cheap (transform and width changes only, no per-frame layout reads).

## Implementation order

1. **Types, defaults, and registry** (`configDefaults.ts`, new `logo.config.ts`, new `src/config/layers.ts`): `LayerKey`, `BlendMode`, `LayersConfigSection`, `LogoConfigSection`, defaults, the layer descriptor registry, and the global category list replacing `CONFIG_CATEGORY_ORDER` / `CONFIG_WINDOW_COLUMN_ORDER`.
2. **Merge and migration** (`ConfigProvider.tsx`): `mergeLayers` (including the legacy video `enabled` inference), `logo` merge, layer actions (`setLayerEnabled` with the 5-layer cap, `setLayerOpacity`, `moveLayer`). Land early so config loads never break while UI and renderer work is incremental.
3. **Layer pipeline spike:** `Layer` interface and compositor with per-layer render targets, `mask` blend, stack order. First prove Orbit plus Fractal compose correctly, and measure GPU and memory with 4-5 layers. Decide where bloom and shockwave live.
4. **Port existing visualizers to layers:** Orbit, Fractal, and Video render to their own targets through the compositor. Remove the ad hoc video mask code (video plane `renderOrder` hack, Julia `uVideo`/`uVideoMask`, `V` toggle) once `mask` plus stack order reproduces it. Verify visual parity before and after.
5. **Logo layer:** sprite, camera attachment, beat-reactive fields, `updateLogoSprite`, and the `useSpriteUpload` extraction.
6. **Enable/disable fades and opacity** in the compositor using the shared crossfade duration.
7. **Sidebar UI:** `ConfigVideo.tsx` split, shared layer header component with drag-to-opacity, keyboard support, and cap state, layer number control, Orbit nested accordions (sprite selector moved into Particle config), Fractal / Video / Logo bodies, `ConfigAccordion.tsx` driven by the registry.
8. **Expanded view** (the most important surface): `ConfigWindow.tsx` columns from the registry in the fixed display order, Orbit column with nested accordions, dimmed disabled columns.
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
  - Toggle each layer's enabled state in both the sidebar and the pop-out expanded view, and confirm layers compose in stack order, including video in front of Julia showing the fractal only in the video's black areas (the behavior the `V` toggle gave).
  - Drag each header to confirm opacity fades the layer and enabling past 5 layers is blocked with a reason.
  - Change a layer's number and confirm the stack order changes on screen in both the sidebar and the popup.
  - Confirm a disabled layer's popup column is dimmed but responsive.
  - Load an old bundled preset (no `layers` / `logo` keys) and confirm it does not crash and preserves its prior video on/off state.
  - Watch frame time and memory with 4-5 layers enabled and while swapping presets rapidly (each swap can rebuild and crossfade multiple layers at once).
