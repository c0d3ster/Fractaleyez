# Stack: user-reference

## #45 Add an `isAdmin` flag to User records and gate authoring of `@user` presets behind it

Branch: overnight/2026-10-11/r1-01-t45-admin-gate-user-presets

- `isAdmin: { type: Boolean, default: false }` lives top-level on `userSchema` and `IUser` (not in `settings`, which is user-writable). Only settable directly in Mongo; no API writes it, and `updateMeHandler` ignores it.
- `UserRepository.findByClerkId(clerkId)` added (plain read, no upsert). `UserService.isAdmin(clerkId): Promise<boolean>` uses it; a missing user doc is non-admin and is not created.
- `PresetService.savePreset` throws `serviceError('Only admins can create presets that use @user', 403)` when `config.particle.sprites` (either stored shape) contains `@user` and the saver is not an admin. Gates both the create and `force` upsert paths. The admin lookup is skipped when there is no sentinel.
- `PresetService` holds its own server-side `USER_REFERENCE = '@user'` mirroring `src/utils/userReference.ts`; new private helper `spriteList(config)` (also used by `firstSprite`).
- `savePresetHandler` maps `status === 403` to `403 { error: <message> }`; the existing SavePreset UI already shows `data.error`.
- Decision: a non-admin who loads an `@user` preset and saves it gets the 403 (rejected, not silently rewritten to their own logo).
- Not done (out of scope): admin UI, a `GET /api/me` `isAdmin` field, publish-publicly model. No deviations from acceptance criteria.

## #46 Extend the `@user` reference to the logo layer's sprite (`logo.sprite`)

Branch: overnight/2026-10-11/r1-02-t46-user-reference-logo-sprite

- `ConfigProvider.tsx`: `activeUserReferenceRef` is now `Partial<Record<'particle' | 'logo', ActiveUserReference>>`. New module helpers `slotSprites(cfg, slot)`, `withSlotSprites(cfg, slot, value)` and `USER_REFERENCE_SLOTS` drive `resolveUserReferenceIn` (its `active` is now that record), `withUserReference` (save) and the re-resolve effect, each walking both slots.
- The logo slot reuses `resolveUserSprites`/`swapUserReference`/`restoreUserReference` unchanged. Its single-item list has no sibling, so `presetFallback` is undefined and the chain ends at the app default `fractaleye.png`. Only the particle slot is re-normalized after resolving.
- `normalizeLoadedPreset` unchanged; resolve runs after it. `updateLogoSprite` untouched: picking a sprite replaces the stand-in, and restore/swap then no-op for that slot.
- Server: `PresetService.spriteList(config, section = 'particle')` also reads `logo.sprite` (bare array or `{ value }`); new `usesUserReference(config)` feeds the existing `#45` 403 gate on both create and `force` paths.
- Tests: logo-list gate cases added to `PresetService.test.ts`. `userReference.test.ts` unchanged (shared helpers unchanged). No provider-level client tests (none exist for it).
- No deviations from acceptance criteria.
