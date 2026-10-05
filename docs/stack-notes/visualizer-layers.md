## #44 Replace the bundled `default` preset with the new first-load default

Branch: overnight/2026-10-03/44-default-preset

- `presets.default` already had `video.clips: ['galaxy.mp4', 'earth.mp4']`; the only preset change is rebuilt from `configDefaults` (the old on-load state) with `orbit.a.value` = 5 and the `video` section; the old `default` entry is gone.
- `ConfigProvider` initial state now comes from `normalizeLoadedPreset(structuredClone(presets.default.config))` (falls back to `configDefaults` only if the entry is missing, which the `noUncheckedIndexedAccess` typing forces). The sprite warm-up effect reads `window.config` instead of `configDefaults`.
- `main.ts` temporary runtime defaults: `activeVisualizer = 'both'`, `videoMask = true`, `window.juliaActive = true`; `init()` now calls `applyVisualizerLayout()` once so the initial layout is applied (canvas order, blend, mask). `#24`/`#25` replace these with layer state.
- No new exports or interfaces.
- Deviation: none. NEEDS HUMAN: run `yarn seed` against production Mongo; stale `localStorage['presets']` copies of `default` persist until `#34`; confirm "radius" means `orbit.a`.

## #21 Layer types, defaults, and registry

Branch: overnight/2026-10-03/21-layer-types-registry

- `configDefaults.ts`: added `LayerKey`, `BlendMode`, `LayerMeta`, `LayersConfigSection`, `LogoConfigSection`; `AppConfig` gains `layers` and `logo`. Defaults: all layers `enabled: true, opacity: 1, blendMode: 'mask'`, `logo.enabled: false`; order `['video','fractal','orbit','logo']`. `CONFIG_CATEGORY_ORDER`, `CONFIG_WINDOW_COLUMN_ORDER`, and `ConfigWindowColumnKey` removed.
- New `src/config/logo.config.ts` (bare constants) and `src/config/layers.config.ts` (`CAP`, `ORDER_DEFAULT`, opacity min/max/default/step).
- New `src/config/layers.ts`: `LAYER_CAP`, `LAYER_REGISTRY` (key, label, hotkey, hasBody, `popupColumn` = config sections in that column; orbit is `['orbit','particle']`), `GLOBAL_ENTRIES` (user, color, effects, audio; `color` has no section), `DISPLAY_ORDER`, `getEntrySections`, `isLayerKey`, `DEFAULT_LAYER_ORDER`, types `GlobalKey`/`DisplayKey`/`LayerDescriptor`.
- `PresetConfig` (type line in `presets.ts`) makes `layers` and `logo` optional; preset entries untouched.
- `ConfigAccordion` and `ConfigWindow` iterate `DISPLAY_ORDER.flatMap(getEntrySections)`; `color` renders nothing yet, and `logo` now shows as a generic category (popup column count/width still 7 columns, left for the popup task).
- `ConfigProvider`: `ConfigSectionKey` includes `'logo'`; `normalizeLoadedPreset` merges `logo` and sets `layers: configDefaults.layers` as a placeholder (real `mergeLayers` and legacy migration are `#22`).
- Deviation: registry has no body component field yet (no body components exist); add it when the layer bodies land. Layer number is 0-based per the task. Design canvas not fetched (no web access); plan doc only.

## #22 Merge, migration, and layer actions in `ConfigProvider.tsx`

Branch: overnight/2026-10-03/22-merge-migration-layer-actions

- New `src/config/mergeLayers.ts` exports `mergeLayers(loaded: unknown, clipCount: number): LayersConfigSection` (pure, so vitest can import it without React/Clerk). Order repair keeps known keys deduped then appends missing in default order; meta merges field by field over `configDefaults`. Missing/non-object `layers` gives legacy defaults (orbit on, video on iff clips, fractal/logo off). Loaded `layers` missing `enabled` for a layer falls back to the same legacy rule. Tests in `mergeLayers.test.ts`.
- `normalizeLoadedPreset` now sets `layers: mergeLayers(cfg.layers, video.clips.length)`. `ConfigSectionKey` already had `'logo'` from `#21`.
- `ConfigContextValue` gains `updateLogoSprite(sprite)`, `setLayerEnabled(key, enabled): boolean` (cap via `LAYER_CAP`, reads `window.config` to return synchronously), `setLayerOpacity(key, opacity)` (clamped), `moveLayer(key, toIndex)` (clamped). `ConfigWindow` bridge props pass them through.
- Video enable/disable dispatches `videoClipsRestored` (clips, or `[]` when disabled). `retrieveConfigPreset` now compares effective clips (empty when video layer disabled). `updateVideoClips` is unchanged and still ignores the `enabled` flag; `#25` should reconcile.
- Bundled `default` preset has explicit `layers` (all but logo enabled, opacity 1, mask, order `['fractal','video','orbit','logo']`).
- Deviation: `mergeLayers` lives in its own module rather than inline in `ConfigProvider.tsx`, for testability.
- NEEDS HUMAN: other bundled presets now start with fractal off; confirm none depended on it.

## #23 Layer pipeline spike

Branch: overnight/2026-10-03/23-layer-pipeline-spike

- New `src/visualization/layers/` (barrel `index.ts`): `Layer` type (`render(target, deltaTime, audio)`, `resize(w, h)`, `dispose()`), `LayerCompositor` (shared renderer, lazily created per-layer render targets, optional per-layer `resolutionScale`, one composite pass to screen), pure `planLayers(layersConfig)` (front-to-back list; disabled or zero-opacity layers are skipped, so they never render), `OrbitLayer`, `FractalLayer`, `createLayerSpike()`.
- `mask` blend is a front-to-back luminance key: a layer shows only where everything in front of it is dark. `layers.order` is back to front, so the compositor walks it reversed. Edge threshold is `layerConfig.MASK_EDGE` (0.33) in `layers.config.ts`, now also interpolated into the Julia shader's `VIDEO_MASK_EDGE` so there is one source.
- `JuliaVisualizer.init(headless = false)` skips its own renderer and canvas; new `renderTo(renderer, target)` draws into a caller's target. Legacy path unchanged.
- Opt-in only: `?layerSpike` in `main.ts` hides the legacy canvases and renders Orbit and Fractal through the compositor. Not the production path.
- Spike scope gaps: Orbit layer has no particle crossfade, no video plane (hidden), no bloom or shockwave. Skipped layers also stop updating (their time freezes). Compositor mask replaces the legacy screen blend between Orbit and Fractal, so the look differs.
- Post effects decision: bloom and shockwave run once on the final composite (compositor output to a target, then `EffectComposer`), not per layer. Logo would be warped by that; add a per-layer opt-out (draw it after the effect pass) if that is unwanted.
- Deviation: not verified on a GPU (no browser here); typecheck, lint, and tests pass. NEEDS HUMAN: measure GPU, memory, and frame time with 4-5 layers at the largest resolution; decide whether Fractal can run at reduced resolution (spike uses 0.5).

## #24 Port Orbit and Fractal onto the layer pipeline, replace `main.ts` mode switching

Branch: overnight/2026-10-03/24-port-layers-replace-modes

- New `layers/pipeline.ts` (`createLayerPipeline(): LayerPipeline` with `render`, `triggerShockwave`, `getCameraSteer`, `dispose`) replaces `spike.ts` and `?layerSpike`; it is the production path. One renderer and canvas; Orbit and Fractal render to their own targets, `main.ts` just calls `pipeline.render`.
- `LayerCompositor.render` split into `renderLayers(...)` and `composite()`, plus `getScene()`/`getCamera()`. New `layers/post-effects.ts` (`PostEffects`: bloom and shockwave via `EffectComposer` over the compositor's scene, `triggerShockwave`, beat-driven `render(audio)`); logic moved from `hopalong-manager.ts`, which is deleted.
- `OrbitLayer` now owns the orbit camera, mouse and arrow-key handling, `window.setVirtualCameraPosition`/`getVirtualCameraPosition`/`enabledFreqBands`, and the particle crossfade logic (moved verbatim from the manager; crossfades still work). Video planes are forced hidden. `getCameraTrailPosition()` feeds the shockwave aim.
- `JuliaVisualizer` is headless only: removed own renderer/canvas, `setVisible`, `setLayered`, `getDomElement`, `render()`, pixel-ratio caps; `getSteerPosition()` no longer returns null. `setVideoMask`/`uVideoMask` left in place for `#25` to remove.
- `activeVisualizer`, `J`, `V`, `applyVisualizerLayout`, `window.juliaActive`/`orbitActive` and `useVisualizerActive.ts` are gone. `ConfigCategory` dims by `config.layers.meta[layer].enabled`. `F`/`O` toggle via `window.setLayerEnabled` (bridge set by `ConfigProvider`; cap enforced there; ignored in INPUT/TEXTAREA and on key repeat); hotkeys read from `LAYER_REGISTRY`. Popup `forwardKey` already forwards every key, so F/O work from the popup.
- `window.getCameraSteer`: Fractal steering only when Orbit is off and Fractal on, else the orbit camera.
- Persistence: Julia/Hopalong/both mode was runtime-only in `main.ts`; not stored in any preset or setting.
- Deviations: Video is not rendered between this task and `#25` (plane hidden, `V` removed). Fractal runs at full resolution (no 0.5 scale) and the renderer is at pixel ratio 1 (Hopalong's old cap; Julia solo used up to 1.5). Compositor `mask` blend replaces the legacy screen blend, and bloom now applies to the whole composite, so Orbit/Fractal look differs slightly. Orbit and Fractal layers are constructed eagerly even when disabled (they just do not render).
- NEEDS HUMAN: before/after visual parity check (Orbit, Fractal, both; particle crossfade on Particle Config drag; `S` shockwave; F/O toggles including from the popup).

## #25 Port Video onto the layer pipeline and remove the ad hoc mask code

Branch: overnight/2026-10-03/25-port-video-layer

- New `layers/video-layer.ts` (`VideoLayer`, exported from the barrel): fullscreen quad textured from the clip, owns the `<video>` element, its 2px-dot attachment, muted `play()`, resume-if-paused, clip advance on `ended` (all moved from `HopalongVisualizer`), and a plain `THREE.Texture` with a `requestVideoFrameCallback` loop (from Julia's mask code). Created in `createLayerPipeline` and registered as `video` in the compositor.
- `Layer` gains optional `isActive?: () => boolean`; the compositor skips a layer whose `isActive` is false. `VideoLayer.isActive` is true only while a clip is loaded, so the gate is `video.enabled && clips.length` (enabled via `planLayers`, clips via the element). The `videoClipsRestored` event (from `ConfigProvider`) still creates/tears down the element. `updateVideoClips` now skips the dispatch while the video layer is disabled (reconciles the `#22` note).
- Removed: `HopalongVisualizer` video plane/element code, `OrbitLayer.hideVideoPlanes`, Julia `uVideo`/`uVideoMask`/`setVideoMask` and the shader block (`VIDEO_MASK_EDGE` const gone; `layerConfig.MASK_EDGE` is now only the compositor's). No mask-specific code remains outside the compositor's `mask` blend.
- `V` toggles video through `LAYER_HOTKEYS` in `main.ts` (same `setLayerEnabled` rules).
- Deviation: the old plane had camera-pan overscan; the video layer is a plain fullscreen quad (stretched to the viewport, as before) that ignores the orbit camera. Not verified on a GPU. NEEDS HUMAN: visual parity check, including video in front of Julia (`mask`, order `fractal` behind `video`) and the reverse.

## #26 Extract `useSpriteUpload` from `ParticleSpriteHud.tsx`

Branch: overnight/2026-10-03/26-use-sprite-upload

- New `src/components/huds/useSpriteUpload.ts` exports `useSpriteUpload({ isSignedIn, getToken, atCapacity, onUploaded }): { onFiles, uploadError }`, plus `MAX_DATA_URL_BYTES` and `SPRITE_MAX_SIDE_PX`. It owns the file checks, `prepareSprite`, size recheck, token fetch, `/api/uploadParticle` POST, and error display timer. The caller decides what to do with the URL: the particle picker appends (`[...spritesRef.current, url]`), a Logo picker can replace its value.
- `ParticleSpriteHud` keeps `uploadDisabled` and the label title logic unchanged; only `onFiles`/`uploadError` and the constants moved. Error strings and sign-in path are verbatim. Hook is not in the huds barrel (not a component).
- Gating contract: `atCapacity` (silent ignore) and `isSignedIn` (error message) are the only gates. `#20`'s premium check is not folded in; add it as a further option or via `uploadDisabled` when `#20` lands. Whether Logo uploads are premium-gated remains open.
- Deviation: none. No separate dimension check exists client-side beyond `SPRITE_MAX_SIDE_PX` scaling; behavior unchanged. Not exercised in a browser; typecheck and lint pass (no test script).

## #27 Logo layer

Branch: overnight/2026-10-03/27-logo-layer

- New `layers/logo-layer.ts` (`LogoLayer`, in the barrel), registered as `logo` in `createLayerPipeline`. It owns a `CameraManager` that is only `init()`ed and never `manageCameraPosition`ed, so the camera is never panned (`cameraBound`) and the logo (a group of slices) is a camera child at local `z = -10` (viewport height fraction 0.3, independent of `scaleFactor`). Own render target via the compositor; defaults off through `layers.meta.logo`.
- Beat reactions read `audio.beat` (the shared peak): scale `1 + beat.value * beatScale`; shake = random x/y offset gated and scaled by `beat.value`; glow follows the Effects glow switch (no logo setting) and brightens by `min(1, beat.value * beat.energy)`; spin always adds `spinSpeed * musicSpeedMultiplier * deltaTime / 1000` (deltaTime is ms; the multiplier is `getMusicSpeedMultiplier`, shared with Orbit) to the logo group's `rotation.y`, so `spinSpeed` 0 is still (default 0; there is no separate spin toggle).
- Sprite follows `logo.sprite.value[0]` (set by `updateLogoSprite`) via `acquireSpriteTexture`/`getResolvedSpriteUrl`; an empty value or a still-loading image hides the sprite and renders a clear target (no crash). `L` added to `LAYER_HOTKEYS` in `main.ts` (goes through `setLayerEnabled`, cap applies).
- Blend: the logo uses a new `over` blend (compositor `BLEND_CODES`): its target clears transparent and the composite covers the layers behind it by its own alpha, so a dark logo still hides them (under `mask` its darkness let the fractal and video show through). Orbit stays `screen`; video and fractal stay `mask`.
- Edge-on glitch: seen exactly edge-on, the blended front/back faces fell back to the smallest mipmap (the average of the whole image: dim, part transparent) and drew a faint line across the full image height. The faces now fade out as `|cos(spin)|` drops below 0.3 (gone below 0.05, constants in `logo-layer.ts`); the cutout sides carry the shape. The sides use their own no-mipmap copy of the texture (`createSideTexture`), because a mipmapped lookup edge-on averaged the image under the 0.5 alpha cutoff and cut the middle of the sliver out.
- Deviation: the logo is a stack of 64 textured `PlaneGeometry` slices (both faces drawn) over 10% of its height, not a `Sprite`, so spin is a 3D turn around its vertical axis (`group.rotation.y`) instead of a flat roll; the two outer slices are blended faces (soft edges kept) and the ones between are opaque alpha cutouts (0.5) that write depth, so the sides show the image's own edge colors; the back shows the image mirrored. Slice count, depth and shade are constants in `logo-layer.ts`. Swappable for a real extrusion later. Post effects (bloom/shockwave) still apply to the logo, as noted in `#23`. Not verified on a GPU. `#7` wiring not done (`#7` not landed).
- NEEDS HUMAN: audio-reactive tuning (beatScale, shake and glow strength, logo size/distance); visual check of `L` toggle and layer order.

## #28 Enable/disable fades and opacity in the compositor

Branch: overnight/2026-10-03/28-layer-fades

- New `layers/fade.ts` exports pure `stepOpacity(current, target, deltaMs, durationMs)` (linear, full 0..1 sweep per duration, duration <= 0 snaps, no overshoot). `plan.ts` gains `targetOpacity(meta, key)` and `planLayers(config, effective?)`; `effective` overrides the target for layers mid-fade.
- `LayerCompositor` keeps an effective opacity per layer, stepped each `renderLayers` by `deltaTime` (ms) toward `targetOpacity` using `getParticleCrossfadeDurationMs()` (no new setting). First sighting of a layer starts at its target, so nothing fades in on load. Because the state is the current value, toggling mid-fade reverses from where it is.
- Layers at effective opacity 0 are dropped by `planLayers`, so they get no render, no target allocation, and no composite slot. A layer mid-fade still renders.
- Tests: `fade.test.ts`, extra cases in `plan.test.ts`.
- Deviation: none. Not verified on a GPU. Note: a layer that finishes fading out stops updating (its time freezes), as already noted in `#23`.
- Video fade-out fix: disabling the layer used to tear the `<video>` down at once (`videoClipsRestored` with `[]`), so `isActive()` went false and the compositor dropped the layer mid-fade. `VideoLayer` now keeps the clip playing and frees it from the new optional `Layer.onHidden` hook, which the compositor calls every frame a layer is fully faded out (effective and target opacity 0). Re-enabling mid-fade keeps the playing clip.
- Video crossfade: `VideoLayer` holds a current and an incoming slot. Within the crossfade duration of a clip's end (`isNearEnd` in `fade.ts`) the next clip starts underneath, waits for its first frame, and fades in over the same shared crossfade duration (the quad is blended over the current one, so the result is current * (1 - t) + incoming * t), then takes over and the old one is freed. Duration 0 keeps the plain cut. A single clip crossfades into itself. Both clips decode for the length of the fade. Not verified on a GPU.
- Shockwave hotkey: `S` now flips the Effects Shockwave checkbox (`window.updateConfigItem`, bridged from `ConfigProvider` like `setLayerEnabled`) instead of firing a manual shockwave, so the checkbox follows. Beats still fire it only while the checkbox is on. The pipeline's `triggerShockwave` is gone; `PostEffects` calls it internally on a beat.

## #29 Shared `LayerHeader` component and `ConfigVideo.tsx` split

Branch: overnight/2026-10-03/29-layer-header

- New `components/config/LayerHeader.tsx` (+ `.css`): `LayerHeader({ layerKey, title, collapsible?, isOpen?, onToggleOpen? })`, connected to config context. Power button (only enable toggle; disabled with a tooltip at `LAYER_CAP`), name, opacity percent, `-`/badge/`+` stepper (badge click cycles forward, wrapping; both call `moveLayer`), chevron when `collapsible`. Root is `role='slider'`, focusable; Left/Right step opacity by 0.05; Enter/Space toggles the body when collapsible; all other keys bubble untouched.
- Drag: pointer capture, one `getBoundingClientRect` per drag, then `scaleX` on the fill via ref plus a rAF-throttled `setLayerOpacity`. A 4px threshold separates click (toggles body) from drag. Dragging an off layer calls `setLayerEnabled(key, true)` first; if the cap refuses, the drag is aborted. Fill is blue, dim steel when off (remembered opacity stays visible).
- `ConfigVideo.tsx` is now just header + body shell (`popup` prop = always open, no chevron); clip list moved to `ConfigVideoBody.tsx`. `ConfigCategory` renders `LayerHeader` for sections whose name is a layer key (video's sibling `fractal`, `orbit`, `logo`); `particle` keeps the plain title. `ConfigWindow` passes `popup`.
- Deviation: layer number is the 0-based index in `layers.order`. Stepper `-`/`+` added alongside the badge. Not checked against the canvas (no design access) or in a browser. NEEDS HUMAN: visual check of the six header states.
- LayerHeader polish: the blue fill now follows the layer's effective opacity (its opacity while on, 0 while off), so the power button sweeps it right to left (or back) at the shared crossfade duration with the same `stepOpacity` the compositor uses, instead of jumping. Dragging and arrow keys still paint it instantly. The steel "off" fill color is gone (an off layer has no fill). The power button is 18px (was 14) and centered with equal padding (an inline SVG left a baseline gap below it, so the hover area was uneven), and the layer name is 1.15rem. Not checked in a browser.
