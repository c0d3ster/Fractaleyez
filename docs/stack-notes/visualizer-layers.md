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
