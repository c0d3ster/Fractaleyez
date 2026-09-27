# Visualizer Layers (Orbit / Video / Logo)

## Context

Fractaleyez currently has no formal concept of "what's being visualized" — orbit particles always render, and the video background is silently on/off based on whether `video.clips` happens to be non-empty. The user wants to add a Logo overlay (spin/beat-scale/shake/glow-on-beat, driven by a chosen sprite) that can render *at the same time* as orbit particles and/or a video background, with independent enable/opacity per layer, rather than continuing to bolt features onto an implicit, exclusive-feeling mode switch.

Investigation confirmed video and orbit particles **already coexist today** with zero exclusivity logic — the video plane is just a background mesh in the same scene, farther from the camera than the particle systems. So this feature formalizes an existing-but-implicit layering behavior rather than inventing compositing from scratch, and adds Logo as the first genuinely new layer type.

Scope for this plan, per decisions made with the user: **only** the layer architecture + config UI (sidebar accordion + the expanded pop-out `ConfigWindow`). The asset-library modal (uploads/theming/favorites/pagination for video clips & images) is explicitly deferred — Logo's sprite picker reuses the existing flat particle-sprite pool/upload pipeline as-is; a TASKS.md entry documents the richer library as future work.

This conversation is deliberately doing the architectural lift, not just shipping three layers — the user's stated direction is several more layer types down the road: **Fractal** (Julia-set zoom, audio-reactive), **Image** (endless Droste-style zoom into a point in a still image), and **Elemental** (fire/water/cloud/rain — today just a particle-sprite theme pack, eventually its own particle-physics algorithm). The type model, tab UI, and compositing order below are shaped so those slot in later without a rework — see "Forward-looking: future layer types" and "Layer capacity & transitions."

## Key decisions locked in

1. Layers: **Orbit** (fractal attractor + its particle rendering), **Video** (existing clip background), **Logo** (new: sprite + spin/spinSpeed/beatScale/shake/glowOnBeat). Each has `enabled` + `opacity`. Fixed compositing order — Video farthest, Orbit particles mid, Logo nearest camera. No arbitrary z-index/reordering.
2. Orbit and Particle config stay **visually/structurally separate** (two sub-sections), even though both live under the "Orbit" tab — the user was explicit these are different concepts (algorithm params vs. particle-rendering params) and must not be flattened together.
3. `User`/`Audio` config stay outside the layer system entirely (cross-cutting, not per-algorithm).
4. Logo's asset picker reuses the existing particle-sprite pool + upload pipeline (`ParticleSpriteHud`/`uploadParticleHandler`) as a single-select — no new upload infra.
5. Sidebar: the three layers collapse into **one** accordion row with an inner tab strip (Orbit / Video / Logo). Tabs are always present regardless of `enabled`, so a disabled layer's settings remain editable.
6. Expanded/event view (`ConfigWindow`, a pop-out window, not a modal): **no tabs** — one column per layer, always shown, since the view's whole purpose is zero-click glanceability during a live show. A disabled layer's column stays visible but visually grayed out (dimmed, not hidden, not click-disabled).
7. Video's on/off becomes an explicit `enabled: CheckboxItem` instead of being inferred from `clips.length` — but the merge logic still derives a sensible default (`enabled = clips.length > 0`) for presets saved before this change, so nothing silently flips off.

## Forward-looking: future layer types (placeholders — not designed here)

Not speccing these now, but naming where they'd land in the architecture above so the current build doesn't have to be reworked when they arrive:

- **Fractal** — Julia-set zoom, audio-reactive. Almost certainly a shader/background-tier layer (like Video: full-viewport, farthest from camera), not a particle-position algorithm — it'd slot in as a sibling to Video rather than to Orbit.
- **Image** — endless Droste-style zoom into a point in a still image. Same tier as Video/Fractal (background), driven by a static image asset instead of a video clip or shader.
- **Elemental** — fire/water/cloud/rain. Today it's just a particle-sprite theme (a pack of images fed into the existing Orbit layer's particle rendering); "much more refined" implies it eventually becomes its own particle-*motion* algorithm, i.e. a sibling to Orbit at the particle tier (a different physics driving positions, the way the earlier-discussed "water/rain/droplet" idea was scoped as a new orbit-family algorithm, not a UI change).

Net: layer types aren't flat and unrelated — they cluster into **tiers** (background: Video/Fractal/Image; particle/mid: Orbit/Elemental/water-style; foreground: Logo), and each tier keeps the same fixed compositing position (background farthest, mid, foreground nearest) regardless of which implementation within a tier is active. This plan implements exactly one type per tier (Video, Orbit, Logo) but should model `enabled`/`opacity` and the tab/column UI generically enough that a second type in the background or mid tier is "add a tab," not "redesign the compositing model."

**What actually defines a tier** (this is a real technical distinction, not just "where it sits on screen"): whether the camera's actual position/motion acts on the layer's geometry.
- **Background** is a flat plane that always fills the viewport (with pan-overscan margin, same technique the existing video plane already uses) — it has no z-depth for the camera to move through. Anything that reads as "zoom" here (Fractal's Julia-set, Image's Droste-style zoom into a still) is a 2D/shader-space transform — scaling texture or complex-plane coordinates over time — not the camera dollying through Three.js geometry.
- **Mid** is literal 3D objects distributed through real z-depth, so camera pan/dolly/look-at produces genuine parallax against them. This is why mid-tier layers can coexist (see below) — they share one real 3D volume the way any two particle systems in a scene naturally interleave.
- **Foreground** is screen-plane/camera-attached (Logo's sprite parented directly to the camera) — it never gets camera parallax at all; it only animates in screen-space terms (spin, beat-scale, shake).

## Layer capacity & transitions

Two things worth deciding structurally now, even though only 3 layer types exist today and none of this is reachable yet:

- **Tier exclusivity is not uniform across tiers.** Background and foreground are flat/screen-locked planes — stacking two just means one occludes the other unless opacity-blended, so single-active-implementation-per-tier is the sensible default there (revisit only if a real future request wants two background layers cross-faded, which is a blend question, not a layering one). **Mid is different**: because mid-tier layers genuinely share one 3D volume, multiple can be active *simultaneously* as a real multiselect — e.g. Orbit's Hopalong particles and a future Elemental fire/water particle system both rendering and interleaving in the same depth, not one replacing the other. Model mid-tier `enabled` as allowing multiple true regardless of what background/foreground allow.
- **Global cap**: user's proposed default — cap total *active* layers at 4 across all tiers combined (so mid's multiselect still counts against the same shared budget, e.g. Orbit + Elemental + Video + Logo = 4), enforced wherever `enabled` gets flipped true (block enabling a 5th, or surface the tab/checkbox as disabled with a reason). Not reachable with only 3 layer types today; the enable-handler should be written to check the cap generically (count of `enabled.value === true` across all layer sections, not tier-aware) so it's already correct once Fractal/Image/Elemental exist, rather than needing to be added later.
- **Smooth enable/disable**: opacity should animate rather than snap — fade 0→configured `opacity` on enable, `opacity`→0 on disable. Reuse the existing crossfade-duration infrastructure (`src/config/visualizer.config.ts`'s `PARTICLE_CROSSFADE_DURATION_DEFAULT_MS` + `getParticleCrossfadeDurationMs`/`setParticleCrossfadeDurationMs`, already used for particle-system rebuild crossfades) as the shared fade duration for layer enable/disable, instead of introducing a second duration setting — implement in the same per-frame opacity-write path described under "Renderer changes" (drive toward target opacity over that duration instead of writing it directly).

## Type changes — least invasive option

Extend the *existing* `orbit`/`video` top-level `AppConfig` sections with `enabled`/`opacity` fields rather than introducing a `layers: {...}` wrapper. Reasons: `mergeConfigSection` (see below) already iterates every key of a section generically, so new fields need zero new merge code; a wrapper would break every direct `window.config.orbit.a.value` / `config.video.clips` access across `hopalong-visualizer.ts`, `presets.ts`, and bundled preset blobs for no functional gain; and decision #2 already requires `orbit`/`particle` to stay separate top-level keys anyway.

In `src/config/configDefaults.ts`:

```ts
export type OrbitConfigSection = {
  enabled: CheckboxItem
  opacity: SliderItem
  a: SliderItem; b: SliderItem; c: SliderItem; d: SliderItem; e: SliderItem
}

export type VideoConfigSection = {
  enabled: CheckboxItem
  opacity: SliderItem
  clips: string[]; allClips: string[]; index: number
}

export type LogoConfigSection = {
  enabled: CheckboxItem
  opacity: SliderItem
  sprite: MultiselectItem   // single-select via min:1,max:1 — see note below
  spin: CheckboxItem
  spinSpeed: SliderItem
  beatScale: SliderItem
  shake: SliderItem
  glowOnBeat: CheckboxItem
}
```

`AppConfig` gains `logo: LogoConfigSection`. `configDefaults.orbit`/`.video` default to `enabled: true, opacity: 1` (preserves current always-on behavior); `configDefaults.logo` defaults to `enabled: false` (a new feature shouldn't suddenly render on top of existing shows).

**`sprite` field**: none of the existing `ConfigItem` variants is "pick exactly one from a pool." Reuse `MultiselectItem` with `min: 1, max: 1` rather than adding a new `ConfigItem` variant — the Logo tab needs a bespoke picker component regardless (built-in + uploaded sprites, replace-not-toggle semantics), so the generic `ConfigCategory` renderer never touches this field either way, and it avoids widening the `ConfigItem` union (used pervasively in `ConfigCategory.tsx`) for one field.

New `src/config/logo.config.ts` holds the min/max/default/step constants, mirroring `orbit.config.ts`/`particle.config.ts`'s existing bare-constants pattern.

`CONFIG_CATEGORY_ORDER` gains `'logo'`. `CONFIG_WINDOW_COLUMN_ORDER` replaces bare `'particle'`/`'orbit'` with a new combined `'orbit_particle'` key (mirrors the existing `'effects_particle'` combined-column trick already in the file) and adds `'logo'`.

`StoredVideoSection` (used by bundled `presets.ts`) widens to `Pick<VideoConfigSection, 'clips' | 'index'> & { enabled?: CheckboxItem }` — optional, so existing bundled presets keep compiling untouched.

## Config merge / migration — `src/components/config/context/ConfigProvider.tsx`

- `mergeConfigSection` (line 75) is already generic over every key in a section's defaults — `orbit.enabled`/`orbit.opacity` and all of `logo.*` fall out of this for free via its existing "missing key → keep default" fallback (line 82). No change needed there beyond widening `ConfigSectionKey` (line 73) to include `'logo'`.
- `mergeVideo` (line 103) needs one new branch implementing decision #7: if the loaded config has an `enabled.value` boolean, use it; otherwise derive `enabled = clips.length > 0` (legacy inference, preserved as a fallback rather than removed). Same pattern for `opacity` (default 1).
- `normalizeLoadedPreset` (line 117) adds `logo: mergeConfigSection('logo', cfg.logo as ...)` alongside the existing five section merges.
- `updateVideoClips` (line 361) currently dispatches the `videoClipsRestored` event only on the empty↔non-empty transition of `clips` (this is what `hopalong-visualizer.ts` listens for to create/dispose the video plane). Add a new `updateVideoEnabled` action, parallel to `updateVideoClips`, that flips `video.enabled.value` and dispatches the same event with `clips: enabled ? clips : []` — this reuses the create/dispose path that already exists rather than adding a second listener. The Visualizer Layers UI wires the Video tab's enabled checkbox to this new action, not the generic `updateConfigItem` (exactly how clip checkboxes already bypass `updateConfigItem` today).
- A new `updateLogoSprite` action, parallel to `updateParticleSprites` (line 333): same `warmSpriteCache` pattern (comment there already documents the race it's avoiding), sets `logo.sprite.value = [chosen]`.

No server/DB migration needed — presets are merged against `configDefaults` client-side on every load, and bundled presets already freely omit fields (confirmed in `src/config/presets.ts`), relying on exactly this fallback path.

## Renderer changes

**`src/visualization/hopalong-manager.ts`** (`update()`, ~lines 105-129 already drive `glow`/`shockwave` off `audioData.peak.value`/`.energy` — follow this exact convention for Logo's reactive fields rather than inventing a new one):
- Own the Logo sprite directly (it's scene-independent, unlike orbit/video which live inside `HopalongVisualizer`'s scene and get torn down/rebuilt on crossfades). Attach it to the camera itself — `camera.add(logoSprite)` with a small local `position.z` offset — via `CameraManager.getCamera()`, so it always renders nearest-camera regardless of `cameraBound` panning or `scaleFactor`, with no need to track a world-space "nearest z" constant.
- `beatScale`: scale the sprite by `1 + audioData.peak.value * config.logo.beatScale.value` when peak crosses the existing threshold.
- `shake`: perturb sprite position by a small random offset scaled by `config.logo.shake.value`, same peak gate.
- `glowOnBeat`: nudge sprite material opacity/tint using the same `audioData.peak.value * audioData.peak.energy` formula the `glow` effect already uses.
- `spin`/`spinSpeed`: not beat-reactive — constant `rotation.z += spinSpeed.value * deltaTime` per frame, same category as the always-on rotation already applied elsewhere.
- Apply `orbit.opacity`/`video.opacity`/`logo.opacity` each frame via each layer's existing opacity plumbing.

**`src/visualization/hopalong-visualizer.ts`**:
- Gate orbit/particle visibility on `orbit.enabled` by driving particle opacity to 0 when disabled (reuse the existing crossfade opacity plumbing — `setParticleOpacity`-style — rather than tearing down/rebuilding the particle system for a simple visibility toggle).
- Replace the three `clips.length`-only checks (`init()` ~line 139, `nextVideo()` ~lines 227-233) with `video.enabled.value && clips.length` / `!enabled || !clips.length`.
- Video plane material needs `transparent: true` added (currently omitted) for `opacity` to have any visible effect; write `opacity` from `video.opacity.value` at creation and per-frame.

## Sidebar UI

- **New `src/components/config/ConfigVisualizerLayers.tsx`**: owns the accordion row's header/collapse (replacing where `orbit`'s row and `ConfigVideo`'s own header render today), containing a `react-bootstrap` `Tabs`/`Nav` strip (no tab component exists in the codebase yet, but `react-bootstrap` — already a dependency — ships one, so no new library). Three always-present tabs:
  - **Orbit tab**: enabled+opacity row via `ConfigCheckbox`/`ConfigSlider` directly, then the existing orbit a-e sliders, then a visually distinct sub-heading, then the existing `particle` category's items unmodified — satisfying decision #2 (co-located but not merged).
  - **Video tab**: enabled+opacity row, then the existing clip-picker body.
  - **Logo tab**: enabled+opacity row, spin/spinSpeed/beatScale/shake/glowOnBeat controls, plus a sprite-picker sub-component.
- **`ConfigVideo.tsx` refactor**: split its collapse-header ownership from its clip-list body (currently one component owns both) so the body can be reused inside a tab without a redundant nested header. The header wrapper likely becomes unused once both surfaces consume the body directly.
- **New sprite-upload hook** (e.g. `useSpriteUpload`), extracted from `ParticleSpriteHud.tsx`'s existing upload logic (`onFiles`, size/dimension constants), shared between `ParticleSpriteHud` (multi-select, add-to-array) and a new Logo picker (single-select, replace-value) — avoids duplicating the upload plumbing.
- **`ConfigAccordion.tsx`**: widen the existing `category === 'video' ? <ConfigVideo/> : <ConfigCategory/>` special-case into a skip-set for `orbit`/`video`/`particle`/`logo`, rendering `ConfigVisualizerLayers` once in their place.

## Expanded view (`ConfigWindow.tsx` / `ExternalWindowBridge`)

- Add `'orbit_particle'` and `'logo'` branches to the column renderer, mirroring the existing `'effects_particle'` stacked-column pattern (`ConfigCategory name='effects'` + `ParticleSpriteHud` stacked in one column) exactly: `orbit_particle` stacks the Orbit category + Particle category; `logo` gets its own column with the logo sprite picker. All columns stay permanently open (`isOpen=true`, no-op `toggleOpen`) — unchanged from today, since decision #6 rules out tabs here.
- Grayed-out styling: wrap each layer's column content in a conditional class (dimmed via opacity/grayscale) when that layer's `enabled` is false — explicitly *not* `pointer-events: none`, since the view must stay interactive so a disabled layer can be tweaked/re-enabled from it.

## TASKS.md

Add one entry documenting the deferred asset-library modal (uploads, favorites, theme/pack grouping, pagination for video/image assets) as future work, noting that this feature intentionally reuses the flat sprite picker for Logo instead. Also flag in the PR description (not by editing TASKS.md's human-only Decisions section) that this feature resolves the open "should Video split out as its own viz type" question via the Orbit/Video/Logo layer model.

## Implementation order

1. Types (`configDefaults.ts`, new `logo.config.ts`)
2. Merge/migration (`ConfigProvider.tsx`) — land early so config loads never break while UI/renderer work is incremental
3. Renderer plumbing (`hopalong-manager.ts`, `hopalong-visualizer.ts`)
4. Sidebar UI (`ConfigVideo.tsx` split, sprite-upload hook, new Logo picker, `ConfigVisualizerLayers.tsx`, `ConfigAccordion.tsx`)
5. Expanded view (`ConfigWindow.tsx` column branches + CSS)
6. TASKS.md entry

### Critical files
- `src/config/configDefaults.ts`
- `src/config/logo.config.ts` (new)
- `src/components/config/context/ConfigProvider.tsx`
- `src/visualization/hopalong-manager.ts`
- `src/visualization/hopalong-visualizer.ts`
- `src/components/config/ConfigVideo.tsx`
- `src/components/config/ConfigVisualizerLayers.tsx` (new)
- `src/components/config/ConfigAccordion.tsx`
- `src/components/config/ConfigWindow.tsx`
- `src/components/huds/ParticleSpriteHud.tsx` (source of extracted upload hook)

## Verification

- `yarn typecheck` and `yarn lint` after each stage (types stage especially — confirms no `AppConfig` consumer broke).
- `yarn dev`, then manually: toggle each layer's enabled checkbox independently in both the sidebar and the pop-out expanded view (`e` key or the sidebar's expand button) and confirm video/orbit/logo compose visually in the right order (video behind, orbit mid, logo front); confirm a disabled layer's column in the expanded view is visibly dimmed but its controls still respond; confirm opacity sliders visibly fade each layer; confirm loading an old bundled preset (no `enabled`/`logo` keys) doesn't crash and preserves its prior video on/off state.
