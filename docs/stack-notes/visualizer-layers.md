## #44 Replace the bundled `default` preset with the new first-load default

Branch: overnight/2026-10-03/44-default-preset

- `presets.default` already had `video.clips: ['galaxy.mp4', 'earth.mp4']`; the only preset change is `orbit.a.value` 2.5 -> 5 (`defaultValue` left at 2.5, name left as `A`; the UI label "Radius" comes from `configDefaults`).
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
