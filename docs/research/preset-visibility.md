# Preset and pack visibility and publishing model (task #234)

Research and proposal only. No code or data changed. Everything under "Proposed model" is a recommendation, not a decision.

## Summary

Today every preset and pack is returned to every viewer: the list endpoints apply no viewer filter, and `userId` only drives the `isOwn` flag. There is also no way to mark something as public, so "public" and "private" do not exist as states. Recommended: add one explicit `visibility` field (`private | public`) on both `Preset` and `Pack`, keep "built-in" as an origin concept (`userId` absent on presets, `Pack.origin` from the monetization plan), and add an admin-only publish action that flips `visibility` with a small audit record.

## Findings

### Current behavior

- `PresetService.listPresetsForViewer(viewerId)` calls `PresetRepository.findAll()` (`Preset.find({})`) and returns every preset row, pinning the global `default` first. `viewerId` is used only for `isOwn: !!viewerId && !!p.userId && p.userId === viewerId`. A guest sees every signed-in user's presets (name, pack, sprite, id, updatedAt).
- `PackService.listPacks(viewerId)` calls `PackRepository.findAll()` (`Pack.find({})`) and returns every pack, with `isOwn` computed the same way. `listMyPacks(userId)` is the only filtered read (`findByUserId`).
- `presetHandler` / `getPresetById` fetches a preset by id with no ownership or visibility check. Anyone with an id can read its full `config`. The list endpoints leak ids to everyone, so this is not protected by obscurity either.
- Representation today:
  - `Preset.userId` is optional. Absent means seeded/global (this is how `isGlobalDefault` and the unique index comment treat it). Present means user-saved.
  - `Pack.userId` is required, so there is no "global pack" shape. Built-in packs are owned by the admin account's id, indistinguishable from a user pack except by who that user is.
  - `Pack.isPremium` / `price` are the only other classification. `User.isAdmin` exists (top-level, only settable in Mongo), and `PresetService.savePreset` already uses it to gate `@user` presets.
- Uniqueness: presets are unique on `(name, userId)`; packs are globally unique on `slug`.
- Practical effect: a user's "private" preset is visible and loadable by everyone. The monetization plan (`docs/research/monetization.md`) already assumes private and public packs exist as tiers, which the code cannot express.

### Gaps

1. No private state: nothing can be hidden from other viewers.
2. No public state distinct from "exists": nothing can be promoted deliberately.
3. No built-in marker on presets other than `userId` absent, and none on packs other than the owner being the admin.
4. Detail endpoint ignores visibility.
5. `#39` name conflicts need a definition of "visible to this user", which currently equals "everything".

## Proposed model

### Three classes of content

| Class | Preset representation | Pack representation | Who sees it |
|---|---|---|---|
| Built-in | `userId` absent (as today) | `origin: 'builtIn'` (from the monetization plan) | Everyone |
| Public | `userId` set, `visibility: 'public'` | `visibility: 'public'` | Everyone |
| Private | `userId` set, `visibility: 'private'` (default) | `visibility: 'private'` (default) | Owner only (and admins for moderation) |

Built-in content is always visible, so it needs no `visibility` value to be correct. Still, give it `visibility: 'public'` in the migration so a single filter works: `visibility = 'public' OR userId = viewer`. This avoids a three-way `$or` with an `$exists: false` clause in every query.

### Representation: explicit field over `userId` absent

Options considered:

- **`userId` absent = public.** Already true for seeded presets, no schema change. Rejected for user content: publishing would erase authorship, breaking ownership, `isOwn`, the `(name, userId)` unique index, and any future creator payout. It also cannot work for packs where `userId` is required.
- **`isPublic: boolean`.** Simple, but closes the door on a moderation state and forces a second flag later.
- **`visibility` enum (recommended).** `'private' | 'public'` now. Leaves room to add `'unlisted'` (link-only) or a moderation state without another migration. Keep authorship in `userId`.

Add `publishedAt?: Date` and `publishedBy?: string` (admin id) next to it. They give moderation an audit trail and a sort key for a future "new in community" list, at near-zero cost.

### Read rules (single source of truth in the repository)

- `PresetRepository.findVisibleTo(viewerId | null)`: `{ $or: [{ visibility: 'public' }, { userId: viewerId }] }`, with the `userId` clause omitted for guests. `findAll()` is then removed from the list path.
- `PackRepository.findVisibleTo(viewerId | null)`: same shape.
- `getPresetById` applies the same predicate. A hidden preset returns 404, not 403, so it does not confirm the id exists.
- Admin reads use a separate explicit method (`findAllForModeration`), never a flag on the normal one.

### Who can publish and how

- **Phase 1 (admin-only).** Only `User.isAdmin` can publish. A new endpoint, for example `POST /api/publish` with `{ kind: 'preset' | 'pack', id, visibility }`, checks `userService.isAdmin`, sets `visibility`, `publishedAt`, `publishedBy`. Unpublishing is the same call with `private`. This matches the existing admin gating pattern in `savePreset` and keeps `isAdmin` out of user-writable `settings`.
- An admin publishing someone else's content keeps `userId` as the author. Admin publishing their own content is how "built-in" content could be created without data surgery, but built-in stays a separate concept (`origin`), set only by admin tooling or seed scripts.
- **Later (user-initiated publish).** Per the monetization table, public packs are a paid quota (Plus: 3, Premium: unlimited). Then publishing becomes: owner requests, entitlement check (`canCreatePack` style, public quota), and either goes live immediately or enters a review state. This is the same endpoint with the authorization rule widened, not a new mechanism.

### Moderation

- Admin can force any item back to private (takedown) and should be able to list all public user content (`findAllForModeration`).
- If user-initiated publishing is added, introduce `visibility: 'pending'` (visible to owner and admins only) so review does not need another field. Do not build this in phase 1.
- Reports, abuse flow, and takedown notification are out of scope until user publishing exists. Note it as an open question.
- Presets contain arbitrary `config` JSON including sprite references, so public user content needs the same sprite checks as the upload gating work before it is shown to others.

## Interactions

### Private pack tier (`#11`)

`monetization.md` defines Private packs (Free 1, Plus 3, Premium unlimited) and Public packs (Plus 3, Premium unlimited, Free and Guest none). With this model:

- "Private pack" is `Pack.visibility = 'private'`. Quota counts are `count({ userId, visibility: 'private' })`, enforced in `PackService.createPack`.
- "Public pack" quota counts `visibility = 'public'` and `origin = 'creator'`. Built-in packs never count against a user.
- A lapsed Plus user keeps packs beyond the Free limit visible to themselves (existing rule). Publishing more is blocked. If a lapse should unpublish, that is a visibility flip to `private`, which this model supports without data loss.
- Visibility and entitlement are separate checks. Visible does not mean loadable: premium and purchased packs still go through `getEntitlements` (the rule from `#6`). Order: visibility filter first (can I see it exists), entitlement second (can I load it).

### `Pack.presetIds` (`#6`)

`#6` moves membership to `Pack.presetIds: ObjectId[]` and removes `Preset.packId`. A preset can then be in several packs, so visibility has to compose:

- A preset's own `visibility` controls whether it can be listed or fetched on its own. A pack's `visibility` controls whether the pack is listed.
- Rule: a viewer sees a preset through a pack only if they can see the pack **and** the preset. A private preset inside a public pack is silently omitted for non-owners. Resolve in the repository by filtering `presetIds` with the same predicate, not in the client.
- **Publishing a pack should require every member preset to be public (or owned by the publisher and published in the same action).** Otherwise a public pack shows holes, or worse, publishing a pack silently exposes private presets. Recommended: publish pack = validate members, then publish members and pack in one operation, listing what will become public in the confirmation. Reject if a member belongs to another user and is private.
- Unpublishing a preset that sits in a public pack: either block, or leave it in the pack list but hidden. Recommend block with a clear error, since hidden holes are confusing. Admin takedown is the exception and uses the omit behavior.
- `#6` gives the `@user` variants as presets in built-in packs. They are built-in and public by the migration default, nothing extra needed.
- Add `visibility` in the same schema pass as `presetIds` if `#6` has not shipped yet, to avoid two migrations touching the same models. If `#6` ships first, this is an additive follow-up.

### Name conflicts (`#39`)

`#39` rejects a save whose `toLabel()` matches a preset "visible to that user (global plus own, as `listPresetsForViewer` returns today)" and adds `PresetRepository.findVisibleTo(userId)` returning names and userIds only.

- Under this model, "visible" = built-in + public + own. `#39`'s `findVisibleTo` should be the same method as above, so the list view and the conflict check can never disagree. Build it once (coordinate: whichever task lands first defines it).
- Conflict with a **public** preset by another user is a real conflict and its name is already public, so returning `NAME_CONFLICT` does not leak anything new.
- Conflict with another user's **private** preset must not be reported (it is invisible to the saver), so the saver can create a same-named preset. That means two public presets could later clash at publish time. Check at publish: publishing runs the same label-conflict check against built-in and already-public presets and returns `NAME_CONFLICT` to the admin.
- The `(name, userId)` unique index stays correct for storage. Public-namespace uniqueness is enforced at publish time, not by the index. A partial unique index on `{ labelKey }` where `visibility = 'public'` would enforce it in the database; this needs a stored normalized label (`#39` computes it in app code), so mark it as an option for when `#39` has landed.
- Packs: `slug` is already globally unique across all visibilities, so a private pack can already block a name. That leaks existence via 409 on create. Acceptable for now (slug collisions are low-risk), but if private packs become a quota tier, consider scoping slug uniqueness to `(userId, slug)` for private and global for public, and revisit alongside `#39`.

## Recommendation

Adopt `visibility: 'private' | 'public'` on `Preset` and `Pack`, with `publishedAt` / `publishedBy`, default `private` for new user content and `public` for existing rows. Keep built-in as `userId` absent on presets and `Pack.origin` on packs. Make the repository the only place the read predicate lives. Ship admin-only publishing first.

### Phased implementation

1. **Schema and backfill.** Add `visibility`, `publishedAt`, `publishedBy` to both models. Migration sets all existing documents to `public` (preserves today's behavior exactly, so nothing disappears). Add an index on `{ visibility: 1, userId: 1 }`. No behavior change yet.
2. **Read-path filtering.** Add `findVisibleTo` on both repositories, switch `listPresetsForViewer`, `listPacks`, and `getPresetById` to it (404 for hidden). Default new saves to `private`. Tests: guest, owner, other user, admin. This is the phase that changes behavior, so ship it after the backfill is verified. Coordinate with `#39` (same method) and `#6` (membership filtering).
3. **Admin publish and unpublish.** `POST /api/publish` for presets and packs, admin-only, with the pack-member validation and the publish-time name-conflict check. Minimal admin UI (or admin-only buttons in `Presets.tsx`), plus a moderation listing.
4. **Entitlement and quotas.** Wire private/public pack quotas from `#11` into `PackService.createPack` and a `canPublishPack` entitlement. Still no user-initiated publish.
5. **User-initiated publish (later).** Open the endpoint to entitled users, add `pending` review state, takedown and report flow, notifications. Depends on the creator market work in `monetization.md`.

Phases 1 and 2 are the minimum to make "private" real. Phase 3 delivers the requested "publish publicly" capability.

## Open Questions

- Should new user saves default to `private`? This makes presets stop appearing for others, which is a visible product change for existing community-style use. The backfill keeps old content public, but is it intended that new ones are not?
- Should guests see public user presets at all, or only built-in? (Model above says all public.)
- Is `unlisted` (link-only sharing) wanted? It would be a third enum value and a share-URL feature.
- Block or hide-with-holes when unpublishing a preset that is in a public pack?
- Pack slug uniqueness across private packs (see Name conflicts).
- Is a derived-from/credit marker needed when an admin publishes a user's preset?
- Moderation policy for user-published content (review before live, or report after).

## Sources

All from this repository at the time of writing:

- `server/services/PresetService.ts` (`listPresetsForViewer`, `savePreset`, `defaultFirst`)
- `server/services/PackService.ts` (`listPacks`, `listMyPacks`, `createPack`)
- `server/repositories/PresetRepository.ts`, `PackRepository.ts` (`findAll`, `findByUserId`)
- `server/models/Preset.ts`, `Pack.ts`, `User.ts`
- `server/routes/presetsHandler.ts`, `packsHandler.ts`, `presetHandler.ts`, `createPackHandler.ts`
- `docs/research/monetization.md` (tiers, `Pack.origin`, entitlements)
- `TASKS.md` entries `#6`, `#11`, `#39` (read for scope only)

No external sources were consulted.
