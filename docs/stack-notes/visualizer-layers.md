## #44 Replace the bundled `default` preset with the new first-load default

Branch: overnight/2026-10-03/44-default-preset

- `presets.default` already had `video.clips: ['galaxy.mp4', 'earth.mp4']`; the only preset change is `orbit.a.value` 2.5 -> 5 (`defaultValue` left at 2.5, name left as `A`; the UI label "Radius" comes from `configDefaults`).
- `ConfigProvider` initial state now comes from `normalizeLoadedPreset(structuredClone(presets.default.config))` (falls back to `configDefaults` only if the entry is missing, which the `noUncheckedIndexedAccess` typing forces). The sprite warm-up effect reads `window.config` instead of `configDefaults`.
- `main.ts` temporary runtime defaults: `activeVisualizer = 'both'`, `videoMask = true`, `window.juliaActive = true`; `init()` now calls `applyVisualizerLayout()` once so the initial layout is applied (canvas order, blend, mask). `#24`/`#25` replace these with layer state.
- No new exports or interfaces.
- Deviation: none. NEEDS HUMAN: run `yarn seed` against production Mongo; stale `localStorage['presets']` copies of `default` persist until `#34`; confirm "radius" means `orbit.a`.
