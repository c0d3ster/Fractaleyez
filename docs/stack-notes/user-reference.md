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
