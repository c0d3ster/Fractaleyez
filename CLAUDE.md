# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
pnpm dev            # run client + server together (webpack-dev-server on :3000, express API on :8080, proxied)
pnpm client-dev      # webpack-dev-server only
pnpm server-dev       # express API only (tsx watch: restarts on save, no build step)
pnpm build            # production webpack build -> public/app.js
pnpm lint             # eslint src --fix
pnpm typecheck        # tsc --noEmit (src/** only, see tsconfig.json)
pnpm seed             # seed `default` (generated from configDefaults) into MongoDB; `pnpm seed --file presets.json` adds presets from a file
pnpm export-presets   # write the global presets from MongoDB to scripts/presets.local.json (git-ignored), for seeding another database
pnpm seed-packs       # seed pack documents, @user presets and pack membership into MongoDB; needs SEED_OWNER_ID (the Clerk user id of that database's admin, different for dev and prod)
```

Scripts that touch the database (`seed`, `seed-packs`, `export-presets`, and the others in `scripts/`) read `.env` (dev). Append `:prod` (`pnpm seed:prod`, `pnpm seed-packs:prod`, `pnpm export-presets:prod`), or pass `--env=production` to a script directly, to layer `.env.production` on top of `.env` instead of swapping values. `.env.production` is git-ignored and only needs what differs (`MONGO_URI` for the `/prod` database, `SEED_OWNER_ID` as the prod admin's Clerk id). `scripts/loadEnv.js` fails if the file is missing or if the database name does not match the mode, so a prod URI in `.env` cannot be seeded by accident.

There is no `test` script yet — vitest, supertest, and mongodb-memory-server are present as devDependencies but no test files or vitest config exist in the repo currently.

`pnpm dev` requires `MONGO_URI` and `CLERK_SECRET_KEY` (server) and `CLERK_PUBLISHABLE_KEY` (client, injected via webpack `EnvironmentPlugin`) in `.env`.

## Architecture

### Two runtimes sharing one route layer

API logic lives once in `server/routes/*Handler.ts` (plain Express `(req, res)` handlers) and is consumed by two different entrypoints:

- **Local dev**: `server/dev.ts` (run by `tsx watch`) boots an Express app, mounts the handlers directly, and serves `public/` as static files. Runs on `:8080`; webpack-dev-server proxies `/api` to it.
- **Production (Vercel)**: each file under `api/*.ts` is a serverless function that imports the same handler from `server/routes` and adapts `VercelRequest`/`VercelResponse` to it (see `api/presets.ts`). `vercel.json` builds with `pnpm build` and serves `public/` as `outputDirectory`.

When adding an API endpoint: write the handler once in `server/routes/`, wire it into `server/dev.ts`, and add a matching thin adapter file in `api/`.

Handlers → `server/services/*Service.ts` (business logic, auth-derived `userId`, validation) → `server/repositories/*Repository.ts` (Mongoose queries) → `server/models/*.ts` (schemas). Keep that layering when touching presets/packs.

### Workspace packages

`packages/*` is a pnpm workspace (`pnpm-workspace.yaml`) for code split out of the app with its own public API. A public package is mirrored to its own GitHub repo with `git subtree` and published to npm from its folder; this repo is the source of truth.

- **sprite-strip** (`packages/sprite-strip`, mirror `c0d3ster/sprite-strip`): background strip and square-pad resize for uploaded sprites, used by `useSpriteUpload.ts` and `clerkPhotoLogo.ts`.
- **beatsense** (`packages/beatsense`, MIT, mirror `c0d3ster/beatsense`, `"private": true` so not published to npm yet): the audio analysis, moving out of `src/` in phases (`docs/implementation-plans/beatsense-package.md`). It has the onset detector, beat monitor, tempo and tempo tracker, beat net and bar grid, section tracker and section log format, drum hits, riser, sweep, rhythm names and the spectrum pooling, with their trained models (JSON next to the code) and tests; `AudioFeed`, the analyser, the Web Audio side, the lag probe and the snare roll are still in the app. It exports classes and creates no instances: the app's set is `audioAnalysis` in `src/audio.ts`. It is MIT, code and trained models, with the training data credited in its `NOTICE`; it stays private until launch (phase L of the plan). `scripts/section-eval` imports its modules by relative path (`../../packages/beatsense/src/...`) and the trainers write the models and test fixtures there; the app imports only `beatsense`. `src/audioanalysis/audio-feed.equivalence.test.ts` pins the analysis output of a synthetic song (hashes in `audio-feed.equivalence.golden.json`), so a refactor of the audio code can show it changed nothing; `UPDATE_GOLDEN=1` rewrites the golden for an intended change.
- **beatsense-ui** (`packages/beatsense-ui`, MIT, `"private": true`, no mirror yet): the React HUDs for beatsense (`BeatHud`, `FrequencyHud`, `SectionHud`), kept out of `beatsense` so that stays React-free and runs in Node. React is a peer dependency. A HUD reads everything through the nearest `HudProvider`: an `AnalysisSource` (getters for the timeline, tempo, grid, section, drum hits and so on), a ticker and a hint for its descriptions; `FrequencyHud` also takes the band toggles as `enabledBands` and `onEnabledBandsChange`. The app shows the Beat HUD with its `drumRow` (a mark per drum hit under the hit strip) and wires the HUDs in `src/components/huds/`: `appAnalysisSource` reads the `window.get*` getters from `main.ts` through `window.opener ?? window`, `AppHudProvider` passes it with `subscribeUiTick` and the info strip's `useInfo`, and `ConnectedFrequencyHud` saves the toggles to the user settings and `window.enabledFreqBands`. Each HUD imports its own CSS: webpack's style-loader in the app, inlined into the JS by tsup (`injectStyle`) in `dist/`. `scripts/section-eval/bench-cpu.mts` times `waveformTrack.ts` by relative path. `pnpm lab` (from the repo root or the package) serves its lab page (`packages/beatsense-ui/lab/`, Vite on :4000, outside the package build): the three HUDs large on a live microphone through `AudioSource` and an in-thread `AnalysisHost`, using only beatsense and beatsense-ui. It also records sessions (Record/Stop, label buttons and hotkeys on the audio clock, exported as a versioned JSON with every `FrameReading`, the drum model's hits, the labels and the section log) and shows strips under the Beat and Section HUDs, on their timelines and zoom, comparing your labels with the model's (the model alone without a recording), and has a review page (`lab/review.html`) that plots a session's timelines and lets labels be moved, deleted and re-exported; the pure logic is in `lab/recording/`, tested in `test/lab/` (see the package README's Recording section).
- The app depends on a package as `workspace:*`. Its `exports` has an `@fractaleyez/source` condition pointing at `src/index.ts`, which webpack (`resolve.conditionNames`), tsc (`customConditions`) and the root vitest config (`ssr.resolve.conditions`) use, so the app compiles the package from source with no build step and edits show up on save. npm consumers ignore the condition and get `dist/`. Import a package only by its name, never a path inside it: `exports` has the one entry.
- Each package keeps its own tooling (eslint, vitest, tsconfig, tsup) so the mirror works standalone. Root `pnpm test` and `pnpm typecheck` also run every package's; root `pnpm lint` covers `src` only, so run `pnpm lint` inside the package.
- Mirroring is automatic: `.github/workflows/mirror-packages.yml` runs `git subtree split` on every push to `main` that touches a package and pushes it to the mirror (deploy keys in the `SPRITE_STRIP_DEPLOY_KEY` and `BEATSENSE_DEPLOY_KEY` secrets; run it by hand from the Actions tab if needed). The mirror only takes fast-forwards, so pull outside contributions in first: `git subtree pull --prefix=packages/sprite-strip https://github.com/c0d3ster/sprite-strip.git main` (no `--squash`, so splits stay fast-forwards). A new public package needs a matrix entry, a write deploy key on its mirror and the matching secret; a private one (beatsense) has no entry.
- Publishing is automatic: `.github/workflows/publish-packages.yml` runs on every push to `main` that touches a package and publishes each package in its matrix whose `version` is not on npm yet, so bump `version` in the package's `package.json` to release (a push that leaves it alone publishes nothing). It typechecks, tests and builds the package first, and publishes with npm trusted publishing (OIDC, no token; npm attaches provenance). A new public package needs a matrix entry there and the workflow added as its trusted publisher on npmjs.com (owner c0d3ster, repository Fractaleyez, workflow `publish-packages.yml`).

### Auth

Clerk is the identity provider. Client: `ClerkProvider` wraps the app in `src/index.tsx`. Server: `server/auth.ts#verifyAuth` verifies the `Authorization: Bearer <token>` header via `@clerk/backend` and returns the Clerk user id (`sub`); it throws `AuthUnauthorizedError` for a missing/invalid token, which handlers map to 401. Read endpoints (e.g. `presetsHandler`) treat auth as optional (`viewerId` may be `null`, used to compute `isOwn`); write endpoints (e.g. `savePresetHandler`, `createPackHandler`) require it.

### Presets and packs

- Presets live in MongoDB; nothing in the repo holds preset data. The default look is `configDefaults` (`src/config/configDefaults.ts`): the client boots from it, `Reset` loads it, and `pnpm seed` generates the `default` preset from it with `toStoredConfig`. A preset's `config` is a `StoredConfig` (`src/config/storedConfig.ts`): bare values only, no labels, ranges, or `defaultValue`. Those come from `configDefaults` at load time, and the loader also accepts the older full-item shape. Out-of-range values are kept on purpose (no clamping). A layer is on when its sections are stored (`presentLayers`/`mergeLayers`), and `layers` stores only a non-default order, opacity or blend mode, and only for layers that are on (a custom blend mode on a layer switched off before saving is lost). Blend modes are listed in `BLEND_MODES` (`configDefaults.ts`), each layer's default is set in `createLayerMeta`, `mergeLayers` falls back to that default for a missing or unknown mode, and the compositor's `BLEND_CODES` (`composite.glsl.ts`) maps each mode to its shader branch. `toStoredConfig` produces the slim shape for `savePreset`.
- Live presets/packs are Mongoose documents (`server/models/Preset.ts`, `server/models/Pack.ts`). A `Preset` has an optional `packId` ref plus a legacy `pack` string field. `Preset` is unique on `(name, userId)`; seeded/global presets have no `userId`.
- `src/components/config/context/ConfigProvider.tsx` is the client-side source of truth for the active config: it fetches the preset and pack lists from the API, merges any loaded preset config against `configDefaults` (`mergeConfigSection`/`mergeVideo`) so older or partial shapes stay valid, and keeps the last lists in localStorage (`src/utils/presetListCache.ts`, per viewer) so a reload with the API unreachable still shows them. Preset configs fetched by id are cached under the `presets` key (`src/utils/presetBodyCache.ts`) with the `updatedAt` they had when fetched. The preset list carries each preset's current `updatedAt` (`Preset` uses Mongoose `timestamps`), and a cached copy whose value differs is fetched again; offline, the cached copy is used. `updatedAt` only changes on a Mongoose write (`pnpm seed`, `savePreset`), so a raw `updateOne` in Mongo needs to set it too, or browsers keep serving the old copy.
- `ConfigProvider` keeps a baseline (the active preset's values at load or last save) that `resetConfigItem` (double-click a slider) and `resetConfigSection` (section header button) restore from.
- See `TASKS.md` for in-flight preset/pack work (e.g. moving pack membership from embedding to many-to-many references).

### Visualization pipeline (`src/main.ts`)

Runs independently of the React tree (`src/index.tsx` mounts the config UI/HUDs; `main.ts` drives the canvas):

```text
AudioSource (mic capture) → AudioStream (FFT, fixed 512 size, five onset band levels) → AudioFeed (AudioAnalyser energy + the beatsense analysers)
                                                                                                  ↓
                                                              LayerPipeline.render(deltaTime, snapshot), and the HUDs through window.get*
```

- `HopalongManager` (`src/visualization/hopalong-manager.ts`) owns the Three.js scene/renderer and the active `HopalongVisualizer`; particle orbits are generated by Barry Martin's Hopalong fractal attractor algorithm, parameterized by the 5 orbit config values (`a`–`e`, described in `README.md`).
- `camera-manager.ts` handles camera movement (arrow keys + mouse).
- Real-time config changes flow from `ConfigProvider` down into the manager; changes to the Particle Config category force a full re-render of the particle system (documented user-facing warning in `README.md` about GPU load).
- `window.getPerfData()` is set up in `main.ts` for the perf HUD (FPS, ping, estimated audio-to-visual lag).
- Audio: `AudioSource`, `AudioStream` (`src/audiostream`) and `AudioFeed`, `AudioAnalyser` (`src/audioanalysis`) are still in the app. `AudioFeed.tick` runs once per drawn frame and pushes it into the app's analysers from the `beatsense` package (`audioAnalysis` in `src/audio.ts`: beat monitor, tempo tracker, bar grid, section tracker, drum hits, riser, sweep) in a fixed order; `main.ts` hangs their getters on `window` for the HUDs (`getBeatTimeline`, `getTempo`, `getBeatGrid`, `getSongSection`, `getDrumHits`, ...) and `post-effects.ts` reads the section, tempo and drums for Auto.

### Quality tiers

`src/config/quality.config.ts` holds the tier table (`QUALITY_PROFILES`: Saver, Balanced, Quality, Ultra) and `quality: 'auto' | tier` is a user setting (`UserSettings.quality`, default `auto`, Settings page dropdown, saved through `PATCH /api/me`). `QualityController` (`src/visualization/quality-controller.ts`, the `qualityController` singleton) owns the active tier: a fixed setting is that tier, and Auto asks `QualityGovernor` (pure, unit tested), which is fed every display frame's time from `main.ts`. Auto starts at the tier it last settled on (localStorage `autoQualityTier`), steps down one tier after about 3s of slow frames, and probes one tier up when the scene's estimated cost (`estimateSceneCost`) falls clearly below where it last stepped down; a probe that goes slow steps back down and waits for another cheaper scene. Auto never picks Ultra.

The perf probe (`src/visualization/perf`, off unless the address has `?perf=1`) records CPU and GPU time per pass (`EXT_disjoint_timer_query_webgl2`), frame gaps, long animation frames of the page and the pop-out window, and three.js resource counts; `window.perfProbe.summary()` returns them. `scripts/bench/hitch.js` runs event scenarios against it (first-use shader compiles, layer toggles, slider drags, tier steps, with the expanded config window open, which is where most main-thread time goes) and `scripts/bench/parity.js` checks that a rendering change leaves the picture identical. See `scripts/bench/README.md`.

A tier change is not one jump: the fractal's and the glow's resolution and the logo's bicubic mix move toward the new tier over a few tenths of a second (`profile-ramp.ts`, applied by the pipeline each frame; the first tier applies at once) and the fractal's iteration cap eases on its own. The Color config's palette, saturation, phase and cycles likewise ease over the user's crossfade time (`config/displayedColor.ts`, an exponential follower stepped once per frame; the config UI still reads the live target through `resolveColorState`).

A tier is a `QualityProfile`; `createLayerPipeline` subscribes to the controller and applies it (fractal target scale and iteration uniform, bloom scale, video upload rate, logo bicubic magnification), `main.ts` applies the frame cap (analysis and drawing skip together), and `uiTicker.ts` reads `uiTickHz` through `window.getQuality` (the pop-out config window reaches it via `window.opener`). To add a lever, add a field to `QualityProfile` and a value per tier, then apply it in the pipeline. `scripts/bench` takes `--quality=<tier>` to compare tiers (see its README).

### Config UI rendering

The config UI must not re-render as a whole when one slider moves (it shares the main thread with the visualizer, and the expanded config window is rendered by the same React). `ConfigProvider` keeps the config in state and mirrors each committed value into `configStore` (`context/configStore.ts`); a component reads the slice it draws with `useConfigSelector((config) => config.user)` (pass `shallowEqual` when the selector builds an object), and gets the actions and lists from `connectConfigActions` or `useConfigContext`. The context value deliberately does not contain `config`, so it only changes with a list or a user setting: do not add the config, or anything derived from it each render, to it. Callbacks that need the config at call time read `window.config` instead of closing over it. `scripts/bench/ui-check.js` replays a scripted session and compares every control's state before and after a change to this layer, and `scripts/bench/popup-cost.js` measures the main-thread cost of a slider move.

### Config system

Config is organized into five categories mirrored across `src/config/*.config.ts` (defaults/schema), `src/components/config/*` (UI: sliders, checkboxes, accordion), and the visualization/audio modules that consume them: User, Audio, Effects, Orbit, Particle (see README for what each controls).

## Code style

`.eslintrc` already enforces the global arrow-functions/single-quotes/no-semicolons/2-space style for this repo (`prefer-arrow`, `semi: never`, `quotes: single`, `indent: 2`, `no-var`) — run `pnpm lint` after changes. TypeScript is strict (`strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noImplicitOverride`, etc. — see `tsconfig.json`); run `pnpm typecheck` before considering `src/**` changes done. Note `tsconfig.json`'s `include` is `src/**/*` only — `pnpm typecheck` does not type-check `server/` or `api/`, which have no dedicated type-check script; rely on your editor's TS server or `tsc --noEmit` against `api/tsconfig.json` for those.

One repo-specific exception to the global named-exports-only rule: files under `api/*.ts` use `export default` because Vercel serverless functions require it (same shape as the Next.js `page.tsx`/`layout.tsx` exception — default export on its own, everything else in the file stays a named export).

## Commits

While the user is actively reviewing (looking at changes and giving feedback as they go), show each change and ask whether it's good before committing, so small adjustments don't pile up as throwaway commits. When they are not actively reviewing, commit work in progress on your own so nothing is lost.
