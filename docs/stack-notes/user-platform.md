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

## #3 Create a `users` collection in Mongo keyed by `clerkId`

Branch: overnight/2026-09-19/03-users-collection

### Note on branch/session history

A prior overnight run had already created and checked out this branch (correctly
based on `overnight/2026-08-07/02-particle-crossfade`, the stack's latest tip) and run
`yarn add svix`, but left no commits — `package.json`/`yarn.lock` had the uncommitted
`svix` addition and nothing else. This session continued on that same branch rather
than re-branching, since it was already positioned correctly.

### Schema and atomic upsert

`server/models/User.ts`: `clerkId` (unique index, DB-enforced), `displayName`,
`settings` (`crossfadeDurationMs`, `logoParticle`, `hud`), Mongoose `timestamps`.
`logoParticle` is the field the config-gear task is expected to write and the
`@user` resolver task is expected to read (per this task's own description) —
no other code references it yet.

`server/repositories/UserRepository.ts#upsertByClerkId(clerkId, fields)` is the one
write path both callers below share: `findOneAndUpdate({ clerkId }, update, { upsert:
true, new: true, setDefaultsOnInsert: true })` with `$setOnInsert` for `clerkId`/
`settings` and (only when `fields` is non-empty) `$set` for the rest. This is
deliberately *not* the "replace whole document" style `PresetRepository.upsert` uses
(that's fine there since `savePreset(force: true)` intends a full overwrite) — a full
replace here would wipe `settings`/`displayName` every time `getOrCreateUser` runs
with only a `clerkId` and no other fields. `$setOnInsert`-only (no `$set` key at all,
since MongoDB rejects an empty `$set: {}`) is what makes a plain lazy-create a pure
fetch-or-create with zero side effects on an existing document, and what makes a
redelivered webhook's `$set: { displayName }` idempotent rather than a second insert.
Verified under `mongodb-memory-server`: 10 concurrent `upsertByClerkId` calls for a
fresh `clerkId` converge on exactly one document (`UserRepository.test.ts`).

`server/services/UserService.ts`: `getOrCreateUser(clerkId)` = `upsertByClerkId(clerkId,
{})`; `syncFromClerk(userJson)` = `upsertByClerkId(userJson.id, { displayName:
resolveDisplayName(userJson) })`.

### `/api/me` (sub-task 3)

`server/routes/meHandler.ts` + `api/me.ts`, mounted as `GET /api/me` in `server/dev.ts`
(kept a GET, matching the read-endpoint convention `presetsHandler`/`packsHandler`
already use, since it's an idempotent fetch-or-create from the caller's perspective).
Only calls `getOrCreateUser(clerkId)` — no Clerk API call, no display-name write; that
sync is the webhook's job (see below), since `user.created`/`user.updated` payloads
already carry the full profile with no extra fetch needed.

`ConfigProvider.tsx` calls it in its own `useEffect` (only when `isSignedIn`), with its
own try/catch that only `console.error`s — it doesn't touch `presetList`/`packList`
state or share a promise with those effects, so a timeout/5xx here structurally cannot
block preset/pack loading or the bundled-preset fallback (acceptance criterion).
Response isn't consumed yet (no context field added) — the config-gear/`@user`-resolver
tasks that need `logoParticle`/`settings` client-side land later in this stack.

### Clerk webhook (sub-task 4)

`server/routes/clerkWebhookHandler.ts` + `api/clerkWebhook.ts`, mounted as `POST
/api/clerkWebhook`. Verifies via `svix`'s `Webhook.verify()` (new dep, already present
on this branch from the prior session's `yarn add`) against `CLERK_WEBHOOK_SECRET`.
Needs the *raw* body, which conflicts with `dev.ts`'s global `express.json()` — solved
by registering this route with its own `express.raw({ type: 'application/json' })`
*before* `app.use(express.json())`/`express.urlencoded()` are mounted, mirroring the
existing `uploadParticleHandler` pattern for `express.raw`. The Vercel adapter
(`api/clerkWebhook.ts`) disables `bodyParser` and reads the raw stream itself, same
shape as `api/uploadParticle.ts`, with an added `MAX_WEBHOOK_BYTES` (1MB) ceiling since
this route has no auth check before the body is fully read (the signature check *is*
the auth check, and it needs the whole body first).

`verify()`'s return type is `unknown` (svix has no generic overload); narrowed with two
hand-written type guards (`isClerkEventEnvelope`, `isUserPayload`) rather than a cast,
per the "unknown at a true external boundary, narrowed before use" rule — this is
exactly that boundary. Non-`user.created`/`user.updated` events (e.g. `user.deleted`,
`session.*`) are acked 200 without action; a payload that verifies but is missing the
minimal expected shape is rejected 400. `syncFromClerk` reuses the same
`upsertByClerkId` as `getOrCreateUser`, so a redelivered event is a no-op re-application
of the same `$set`, not a duplicate insert or a stale overwrite of a since-changed name.

### Investigation: Google vs Spotify display name (sub-task 5)

From `@clerk/backend`'s own type shapes (`UserJSON`, `ExternalAccountJSON`), not a live
dashboard session:
- **Google** is one of Clerk's built-in social connections, so Clerk maps its profile
  fields into the top-level `User`/`UserJSON` payload directly: `first_name`,
  `last_name`, `image_url` are populated from the Google account with no extra work.
- **Spotify** is not one of Clerk's built-in providers (no Clerk-native "Sign in with
  Spotify" — Clerk's supported social connection list doesn't include it as of this
  session's `@clerk/backend` version), so it's necessarily configured as a *custom*
  OAuth provider in the dashboard. Custom OAuth providers don't get the same automatic
  field mapping into `first_name`/`last_name`; whatever the userinfo endpoint returns
  either goes unset on those top-level fields, or is captured on the corresponding
  `external_accounts[]` entry's own `username`/`public_metadata` (the same JSON shape
  Google's entry also has, it's just that Google's is redundant with the top-level
  fields while a custom provider's may be the *only* place the data lands). Spotify's
  own `/v1/me` API field for a user's display name is literally called `display_name`,
  which is why `resolveDisplayName()` checks `external_accounts[].public_metadata
  .display_name` as a fallback after `username`.
- `resolveDisplayName()` (`UserService.ts`) order: native `first_name`/`last_name` →
  first external account with a name/username/`public_metadata.display_name` → Clerk
  `username` → primary email local-part → `''`.
- **NEEDS HUMAN**: this is inferred from the type shapes and Clerk's public docs on
  custom OAuth providers, not confirmed against this app's actual Clerk dashboard
  config. Whoever has dashboard access should confirm (a) Spotify is in fact configured
  as a custom OAuth connection (vs. e.g. SAML/OIDC or a since-added native option), and
  (b) which of `username` / `public_metadata.display_name` / some other custom-mapped
  field it actually populates, then adjust `resolveDisplayName()` if the real shape
  differs. See TASKS.md NEEDS HUMAN note.

### Verified

- `yarn typecheck` (src only, per this repo's own script), `yarn lint` (src only, same),
  and `tsc --noEmit -p api/tsconfig.json --ignoreDeprecations 6.0` (covers `server/`/
  `api/` transitively via imports, since neither has its own lint/typecheck script) all
  pass with no new errors — one pre-existing unrelated error in `api/ping.ts` predates
  this task and wasn't touched.
- `yarn test`: 35 tests pass across 6 files, including a real `mongodb-memory-server`
  concurrency test for the upsert (`UserRepository.test.ts`), pure-logic coverage for
  `resolveDisplayName` (`UserService.test.ts`), and mocked-dependency coverage for both
  handlers (`meHandler.test.ts`, `clerkWebhookHandler.test.ts`).

### Known deviation / limitation

- No context/state on the client consumes the `/api/me` response yet — this task's
  acceptance criteria only require the call to happen and not block anything, not that
  anything downstream reacts to it. `settings.logoParticle` exists in the schema for a
  later task to read/write, per this task's own description of the field's purpose.
- `CLERK_WEBHOOK_SECRET` registration (Clerk dashboard endpoint URL + signing secret
  into Vercel/`.env`) and the Spotify provider-config confirmation above are both
  NEEDS HUMAN — code side is otherwise complete and tested.

## #4 Add configuration gear for per-user settings

Branch: overnight/2026-09-20/04-config-gear-user-settings

### Note on a concurrent duplicate dispatch

Partway through this session, a second overnight subprocess (`nightlight-75`) also picked up
task #4 on this same branch/working tree -- apparently the Ctrl+C-orphaned-process issue noted
elsewhere in this run (an interrupted earlier dispatch kept running and collided with the
fresh one). It found this session's work already in place, deleted the one duplicate file it
had started (`src/components/topbar/UserSettingsGear.tsx`) and its one edit to `TopBar.tsx`,
messaged this session to say so, and stepped back without committing. `git status` was checked
against that message and confirmed clean -- no stray files, `TopBar.tsx` matched what this
session wrote. That other session should self-report `status=blocked` so housekeeping doesn't
expect a second PR for #4.

### `/api/me` PATCH (sub-task 1)

Extended the existing `/api/me` resource (GET, from #3) with `updateMeHandler` (PATCH) in the
same `meHandler.ts`, rather than a new `/api/userSettings` route -- one resource, two verbs,
matches how `server/dev.ts` already mounts routes. Wired into `server/dev.ts`
(`app.patch('/api/me', ...)`) and `api/me.ts` (dispatches on `req.method`, since a Vercel
serverless function is one file per path, unlike Express's per-verb routing).

Validates each field present in the body independently (`crossfadeDurationMs` in
`[200, 2000]`, `logoParticle` a non-empty non-`data:` URL string up to 2048 chars, `hud`
either absent or `{ enabledFreqBands?: boolean[] }` up to 16 entries) and 400s on the first
bad one; an empty/absent patch is also a 400. `CROSSFADE_DURATION_MIN_MS`/`MAX_MS` are
duplicated as local consts in `meHandler.ts` with a comment pointing at
`visualizer.config.ts`'s copy -- server code never imports from `src/` (confirmed no existing
precedent for it), so this mirrors the existing client/server constant-duplication pattern
`uploadParticleHandler.ts` already uses for `MAX_UPLOAD_BYTES`.

`UserRepository.updateSettings(clerkId, patch)`: dot-notated `$set` (`settings.crossfadeDurationMs`,
etc.) so a partial patch can't clobber sibling settings fields. Deliberately *not* folded into
`upsertByClerkId`'s single-update style -- `$setOnInsert: { settings: {} }` and
`$set: { 'settings.x': ... }` target overlapping paths, which MongoDB rejects as a conflict.
Instead: try a plain `$set`-only `findOneAndUpdate` first (the common case, doc already exists
from the sign-in lazy-create in #3); if it returns null, call the existing tested
`upsertByClerkId(clerkId, {})` to create the doc, then retry the same `$set`. Verified under
`mongodb-memory-server`: partial patches merge correctly, hud settings survive alongside
crossfade settings, doc-doesn't-exist-yet is idempotent (`UserRepository.test.ts`).

### Crossfade duration became a runtime-mutable value (sub-task 4, crossfade wiring)

`PARTICLE_CROSSFADE_DURATION_MS` (from #2, `visualizer.config.ts`) was a plain `const` read
directly by `hopalong-manager.ts`/`hopalong-visualizer.ts` at ~7 call sites. Made it
user-configurable by turning it into a module-private mutable variable with
`getParticleCrossfadeDurationMs()`/`setParticleCrossfadeDurationMs(ms)` (clamped to
`[PARTICLE_CROSSFADE_DURATION_MIN_MS, PARTICLE_CROSSFADE_DURATION_MAX_MS]` = `[200, 2000]`) --
same "poll a live value" shape `HopalongManager`/`HopalongVisualizer` already use for
`window.config` every frame, so every call site just swapped the constant reference for a
getter call. `ConfigProvider` calls the setter once on `/api/me` load and again on every
`updateUserSettings({ crossfadeDurationMs })` call, so a mid-session slider drag takes effect
on the *next* crossfade this triggers (in-flight fades keep whatever duration they already
captured into their own `durationMs` field, unaffected -- same as a preset switch mid-fade
already worked before this task).

Known limitation carried over from #2's tuning: `MAX_CROSSFADE_GENERATIONS` (4) and
`updateOrbit()`'s 250ms poll interval were tuned assuming the *default* 750ms duration
(3 outgoing slots x 250ms = 750ms, no truncation gap). A user who sets a longer duration
(e.g. 2000ms) can still hit the generation cap under rapid successive changes, which force-
finishes the oldest still-fading generation early -- this was already documented/accepted
behavior in #2 for exactly this scenario, just now reachable via a user setting instead of
only via rapid preset switching.

### HUD (frequency band) persistence (sub-task 4, HUD wiring)

`FrequencyHud.tsx` previously owned `enabledBands` as pure local state seeded once from
`window.enabledFreqBands` (a global `HopalongManager`/`hopalong-manager.ts` already polls for
frequency masking) with no persistence. Wrapped it with `connectConfig` (same HOC
`ParticleSpriteHud` already uses) so it reads `userSettings.hud.enabledFreqBands` and calls
`updateUserSettings({ hud: { enabledFreqBands } })` on every band toggle, alongside its
existing direct write to `window.enabledFreqBands` (kept as-is since that's the only thing
`hopalong-manager.ts` actually reads live). A one-time-apply ref guards against the
persisted setting (arrives async after mount) overwriting a toggle the user made before it
loaded.

`FrequencyHud` is only ever rendered inside `ConfigWindow.tsx`'s `ExternalWindowBridge` (the
popped-out config window has its own separate React root/`ConfigContext.Provider`, manually
re-provided from an explicit prop whitelist -- it does not inherit context by nesting alone
since it's a different window/document). `userSettings`/`updateUserSettings` had to be added
to that whitelist (both the `ExternalWindowBridge` props/JSX and `ConfigWindowInner`'s
render-effect dependency array) or the popout's `FrequencyHud` would silently see
`userSettings: undefined` forever.

### Config gear UI (sub-tasks 2-3)

`src/components/settings/UserSettingsPanel.tsx` -- gear button (⚙) placed in `TopBar.tsx`
next to `UserButton`, inside the same `isSignedIn` conditional branch that already guards
`UserButton` itself (satisfies "hidden when signed out" for free, no separate guard needed
at the call site; the component also self-guards with its own `isSignedIn` check as
defense-in-depth for any future call site). Panel contents: the existing `ConfigSlider`
component (reused as-is, same one `ConfigCategory` sliders use) for crossfade duration, and a
file-upload control for the logo that reuses the *existing* `/api/uploadParticle` R2 endpoint
from #3's sibling R2 task -- not a new endpoint, and not the old inline `data:` URL path
(`updateMeHandler` explicitly rejects `data:` URLs for `logoParticle`, enforcing this at the
API boundary too, not just client-side).

Extracted `prepareImageDataUrl`/`dataUrlToBlob` out of `ParticleSpriteHud.tsx` into
`src/utils/imageUpload.ts` since both it and the new logo upload need identical
resize-before-upload logic -- real duplication now that a second call site exists, not
speculative reuse.

Both the slider and the upload funnel through `ConfigProvider`'s single
`updateUserSettings(patch)`: applies local state + the live side effects (crossfade setter /
`window.enabledFreqBands`) immediately for responsive UI, then debounces the actual `/api/me`
PATCH by `USER_SETTINGS_SAVE_DEBOUNCE_MS` (500ms) so a slider drag or rapid HUD clicks
collapse into one request. Per the task's own "missing acceptance criteria" note, there's no
explicit Save button -- auto-save on change (debounced) was the assumption, applied here.
`updateUserSettings` skips the network write entirely when signed out (no user doc to write
to) but still applies local/side-effect state, so the same controls keep working
client-only for a signed-out visitor, consistent with how every other config control in
`ConfigProvider.tsx` already behaves.

### Verified

- `yarn typecheck`, `yarn lint`, `yarn test` (48 tests across 6 files, including 4 new
  `UserRepository.updateSettings` cases and 9 new `updateMeHandler` cases) all pass.
- `tsc --noEmit -p api/tsconfig.json --ignoreDeprecations 6.0` shows only the same
  pre-existing unrelated `api/ping.ts` error noted in #3's own verification.
- `yarn build` (production webpack) succeeds.
- No live-browser verification this session -- `.env` (Clerk/Mongo credentials needed for
  `yarn dev`) was inaccessible to this sandboxed session (blocked by a deny rule), so the gear
  panel, upload flow, and persisted-HUD-toggle round trip are unverified beyond
  typecheck/lint/unit tests and a successful production build.

### Known deviation / limitation

- `logoParticle` is written and persisted but not yet consumed anywhere in the visualization
  -- per #3's own stack-notes entry, that's the `@user resolver task`'s job, not this one's.
- No "remove logo" affordance -- `updateMeHandler` requires `logoParticle` to be a non-empty
  URL, so clearing it isn't supported by the current API; only upload/replace is exposed.
  Out of scope for this task's sub-tasks as written; a future task can add a clear/delete path
  if wanted.
