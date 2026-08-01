# Fractaleyez Tasks

Instructions for agent: This file is the task inventory only. Workflow rules (branching, PRs, testing, archival, NEEDS HUMAN annotations) live in CLAUDE.md under "Overnight Agent Workflow". Work through Agent-Ready tasks in order. Do not attempt Decisions items; those require human input.

## Agent-Ready

- [ ] Move particle storage into R2 instead of the public directory.
  - Maintain backwards compatibility for existing particle references, or write a migration if compatibility isn't feasible (document which path was taken and why in the PR).
  - Handle offline functionality for live shows: investigate long signed URL validity; if impractical, implement an option to download/cache images in advance.
  - Acceptance: particles load from R2, existing presets still render, offline strategy is implemented or documented.
- [ ] Add crossfade for preset switching. Transitions should never abruptly reset the scene.
  - Acceptance: switching presets visually crossfades; no frame where the scene hard-resets.
- [ ] Create a `users` collection in Mongo keyed by `clerkId`. Clerk remains the source of truth for identity; this collection holds app data (settings, logo particle reference, display name cache, future entitlements).
  - Creation: lazy-create on first authenticated request, plus Clerk `user.created`/`user.updated` webhook to sync display name and connected providers.
  - Investigate and document how the current Spotify and Google sign-ins surface display names in Clerk (native vs custom OAuth provider) and which field to cache.
  - Acceptance: signing in creates/fetches a users document; display name synced; existing Clerk-only flows unaffected.
- [ ] Add configuration gear for per-user settings, stored on the users collection.
  - Settings to include: crossfade duration, user logo, HUD options (frequency visualization toggle).
  - Acceptance: settings persist per user and apply on load.
- [ ] Add "red zone" warning in particle config when particle count surpasses a performance threshold.
  - Acceptance: exceeding the threshold shows a visible warning; threshold is a named constant, easy to tune.
- [ ] Recreate the Shlump pack presets as `@user` variants: `@userSpin`, `@userSalad`, `Hyper@user`, and `@user`, each referencing the `@user` particle instead of a hardcoded artist particle. Copy the existing Shlump preset particle configs verbatim; they are already tuned and require no visual judgment or adjustment. One-off creation; do not modify or remove any existing presets or packs.
  - Pack structure: create a premium pack named `@user` containing all four. Essentials additionally includes `@userSpin` for free.
  - Membership model: presets are standalone entities; packs hold references to preset IDs (many-to-many). `@userSpin` exists once and is referenced by both Essentials and the `@user` pack. If packs currently embed presets, refactor to references as part of this task. Entitlement: a user can load a preset if any pack they're entitled to includes it.
  - Acceptance: all four presets render per the `@user` fallback chain for any user; `@userSpin` loads for free users via Essentials; the other three require the premium pack; no preset data duplicated; all pre-existing packs untouched.

- [ ] Implement reserved particle reference `@user` (sigil syntax; disallow `@` in user-created particle names so collisions are impossible). Presets referencing `@user` resolve at load time to the current user's logo particle. Resolution order: current user's logo from per-user settings → user's display name rendered as text (Spotify profile name preferred, else Clerk name from other providers) → preset-defined fallback particle → app default.
  - Context: presets like ShlumpSpin and BeatzMeSpin are identical except the particle is the artist's logo; this makes that customization automatic per user. Pre-existing presets must not change; `@user` is for new presets only.
  - Depends on the users collection task for logo and display name storage; if that task is blocked, build the resolver against the lower rungs (preset fallback, app default) behind the same interface.
  - Acceptance: a preset referencing `@user` renders the logged-in user's logo; falls back to rendered display name when no logo is set; full fallback chain works signed out; creating a particle named with `@` is rejected; existing presets render unchanged.
- [ ] Extend the `@user` resolver to display-name templating in preset and pack names: `@userSpin` displays as "BeatzMeSpin" for user BeatzMe, a pack named `@user` displays as "BeatzMe". Build as one utility with two consumers: particle references resolve to a renderable, name strings resolve to display text.
  - Acceptance: preset and pack names containing `@user` render with the current user's display name everywhere names appear; falls back sensibly when signed out.

## Verify (may already be done)

- [ ] Verify automated background removal and resize for particle uploads (256x256 vs 512x512 target). If done, confirm output dimensions and check off. If not, implement.

## Research (agent can draft findings, human decides)

- [ ] Research Spotify Web SDK integration scope: direct playback, user/artist track access, playlist access, top songs. Document auth flow, API limits, and premium-account requirements in `docs/research/spotify-sdk.md`. Do not implement yet.
- [ ] Draft Stripe integration plan: premium subscription plus per-pack purchases. Document proposed guest vs free vs premium tiers (e.g. free: 3 presets, 3 particle uploads, 1 private pack; ~$5/mo: 10 presets, 10 particles, 3 pub/private packs; ~$20/mo premium+/unlimited) in `docs/research/monetization.md`. Do not implement billing.

## Decisions (human only, do not attempt)

- [ ] Decide fate of the original Shlump pack: remove, or keep as a specific-artist example. (Placement is decided: `@userSpin` free in Essentials, full `@user` pack premium.)
- [ ] New visualization types as multiselect (new Three.js scene?). "Logo" viz type = audio-responsive 3D logo in center of screen, consuming the same `@user` resolver. Should "Video" split out as its own viz type (currently part of orbit/fractal/tunnel)?
- [ ] Camera position macros (cross, circle, square, horizontal, vertical): timed vs audio/beat responsive? Double-click to add waypoints on pad or screen? (Pad is already click-to-interact.)
- [ ] User acquisition strategy: IG account for Meta ads (Bassyndicate audience or promoter lookalike), target market definition (artists, VJs, music lovers) and how to reach them.
