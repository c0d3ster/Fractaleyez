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
pnpm seed-packs       # seed pack documents into MongoDB
```

There is no `test` script yet — vitest, supertest, and mongodb-memory-server are present as devDependencies but no test files or vitest config exist in the repo currently.

`pnpm dev` requires `MONGO_URI` and `CLERK_SECRET_KEY` (server) and `CLERK_PUBLISHABLE_KEY` (client, injected via webpack `EnvironmentPlugin`) in `.env`.

## Architecture

### Two runtimes sharing one route layer

API logic lives once in `server/routes/*Handler.ts` (plain Express `(req, res)` handlers) and is consumed by two different entrypoints:

- **Local dev**: `server/dev.ts` (run by `tsx watch`) boots an Express app, mounts the handlers directly, and serves `public/` as static files. Runs on `:8080`; webpack-dev-server proxies `/api` to it.
- **Production (Vercel)**: each file under `api/*.ts` is a serverless function that imports the same handler from `server/routes` and adapts `VercelRequest`/`VercelResponse` to it (see `api/presets.ts`). `vercel.json` builds with `pnpm build` and serves `public/` as `outputDirectory`.

When adding an API endpoint: write the handler once in `server/routes/`, wire it into `server/dev.ts`, and add a matching thin adapter file in `api/`.

Handlers → `server/services/*Service.ts` (business logic, auth-derived `userId`, validation) → `server/repositories/*Repository.ts` (Mongoose queries) → `server/models/*.ts` (schemas). Keep that layering when touching presets/packs.

### Auth

Clerk is the identity provider. Client: `ClerkProvider` wraps the app in `src/index.tsx`. Server: `server/auth.ts#verifyAuth` verifies the `Authorization: Bearer <token>` header via `@clerk/backend` and returns the Clerk user id (`sub`); it throws `AuthUnauthorizedError` for a missing/invalid token, which handlers map to 401. Read endpoints (e.g. `presetsHandler`) treat auth as optional (`viewerId` may be `null`, used to compute `isOwn`); write endpoints (e.g. `savePresetHandler`, `createPackHandler`) require it.

### Presets and packs

- Presets live in MongoDB; nothing in the repo holds preset data. The default look is `configDefaults` (`src/config/configDefaults.ts`): the client boots from it, `Reset` loads it, and `pnpm seed` generates the `default` preset from it with `toStoredConfig`. A preset's `config` is a `StoredConfig` (`src/config/storedConfig.ts`): bare values only, no labels, ranges, or `defaultValue`. Those come from `configDefaults` at load time, and the loader also accepts the older full-item shape. Out-of-range values are kept on purpose (no clamping). A layer is on when its sections are stored (`presentLayers`/`mergeLayers`), and `layers` stores only a non-default order, opacity or blend mode. `toStoredConfig` produces the slim shape for `savePreset`.
- Live presets/packs are Mongoose documents (`server/models/Preset.ts`, `server/models/Pack.ts`). A `Preset` has an optional `packId` ref plus a legacy `pack` string field. `Preset` is unique on `(name, userId)`; seeded/global presets have no `userId`.
- `src/components/config/context/ConfigProvider.tsx` is the client-side source of truth for the active config: it fetches the preset and pack lists from the API, merges any loaded preset config against `configDefaults` (`mergeConfigSection`/`mergeVideo`) so older or partial shapes stay valid, and keeps the last lists in localStorage (`src/utils/presetListCache.ts`, per viewer) so a reload with the API unreachable still shows them. Preset configs fetched by id are cached under the `presets` key (`src/utils/presetBodyCache.ts`) with the `updatedAt` they had when fetched. The preset list carries each preset's current `updatedAt` (`Preset` uses Mongoose `timestamps`), and a cached copy whose value differs is fetched again; offline, the cached copy is used. `updatedAt` only changes on a Mongoose write (`pnpm seed`, `savePreset`), so a raw `updateOne` in Mongo needs to set it too, or browsers keep serving the old copy.
- `ConfigProvider` keeps a baseline (the active preset's values at load or last save) that `resetConfigItem` (double-click a slider) and `resetConfigSection` (section header button) restore from.
- See `TASKS.md` for in-flight preset/pack work (e.g. moving pack membership from embedding to many-to-many references).

### Visualization pipeline (`src/main.ts`)

Runs independently of the React tree (`src/index.tsx` mounts the config UI/HUDs; `main.ts` drives the canvas):

```text
AudioSource (mic capture) → AudioStream (FFT, fixed 512 size) → AudioAnalyser (beat/energy detection)
                                                                        ↓
                                                          HopalongManager.update(deltaTime, analysedData)
```

- `HopalongManager` (`src/visualization/hopalong-manager.ts`) owns the Three.js scene/renderer and the active `HopalongVisualizer`; particle orbits are generated by Barry Martin's Hopalong fractal attractor algorithm, parameterized by the 5 orbit config values (`a`–`e`, described in `README.md`).
- `camera-manager.ts` handles camera movement (arrow keys + mouse).
- Real-time config changes flow from `ConfigProvider` down into the manager; changes to the Particle Config category force a full re-render of the particle system (documented user-facing warning in `README.md` about GPU load).
- `window.getPerfData()` is set up in `main.ts` for the perf HUD (FPS, ping, estimated audio-to-visual lag).

### Config system

Config is organized into five categories mirrored across `src/config/*.config.ts` (defaults/schema), `src/components/config/*` (UI: sliders, checkboxes, accordion), and the visualization/audio modules that consume them: User, Audio, Effects, Orbit, Particle (see README for what each controls).

## Code style

`.eslintrc` already enforces the global arrow-functions/single-quotes/no-semicolons/2-space style for this repo (`prefer-arrow`, `semi: never`, `quotes: single`, `indent: 2`, `no-var`) — run `pnpm lint` after changes. TypeScript is strict (`strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noImplicitOverride`, etc. — see `tsconfig.json`); run `pnpm typecheck` before considering `src/**` changes done. Note `tsconfig.json`'s `include` is `src/**/*` only — `pnpm typecheck` does not type-check `server/` or `api/`, which have no dedicated type-check script; rely on your editor's TS server or `tsc --noEmit` against `api/tsconfig.json` for those.

One repo-specific exception to the global named-exports-only rule: files under `api/*.ts` use `export default` because Vercel serverless functions require it (same shape as the Next.js `page.tsx`/`layout.tsx` exception — default export on its own, everything else in the file stays a named export).
