# Monetization plan (task #11)

Research and plan. Subscriptions (phase 5, test mode) are implemented: see `docs/stripe-setup.md`. Quota enforcement (phase 2) and the client gating with upgrade prompts (phase 3) are implemented too, with the placeholder numbers below; see Enforcement points for what is and isn't covered. Decisions marked **Decided** came from the owner; everything else is a proposal.

## Current state

- `Pack` has `isPremium` and an optional `price`. `User` has only `isAdmin`. There is no per-user plan or entitlement.
- Nothing enforces quotas server-side. `Preset` is unique on `(name, userId)` and that is the only limit.
- The client previews premium packs through `usePremiumTrial` / `PremiumTrialModal`: 15s, once per preset per local day, config controls locked.
- `#20` (upload gating), `#19` (visibility model), and `#6` (pack references) all depend on the entitlement model below.

## Core model

Two independent concepts:

1. **Plan** (subscription): `guest | free | tier1 | tier2`, shown as Dream (free), Lucid and Third Eye. Sets quotas and which pack groups are included.
2. **Pack ownership** (one-time purchase): a user can load a preset if any pack they are entitled to contains it. Entitled means included by plan, or purchased. This is the rule already written in `#6`.

A single server function, `getEntitlements(userId)`, derives everything from stored plan and purchases. Gates ask it questions (`canSavePreset`, `canUploadSprite`, `canCreatePack`, `canLoadPack`). `/api/me` returns a read-only copy for UI. The client never decides access.

Stripe only writes to storage (via webhook). Gating reads storage. That decoupling means all gating can ship first with the plan set manually by an admin, and Stripe is added last.

## Pack origin: built-in vs creator

**Decided:** distinguish built-in packs from creator-made packs, and let the admin account create both.

Add `Pack.origin: 'builtIn' | 'creator'`:

- `builtIn`: made by the owner. Includes admin-authored packs and the `@user` custom-build packs.
- `creator`: made by a user. Does not exist yet. The paid creator market is future work.

Setting `origin: 'builtIn'` or marking a pack premium is admin-only, enforced in the service layer (not just hidden in the UI), the same way the `#45` admin gate works.

## Tiers

**Decided:** the tiers are named Dream (free), Lucid and Third Eye. The stored ids stay neutral (`free`, `tier1`, `tier2`, with Stripe price lookup keys `tier1_monthly` and `tier2_monthly`) and the display names live in one client-side map, so a rename never touches the database, Stripe or the webhook.

| | Guest | Dream (free) | Lucid (~$5/mo) | Third Eye (~$20/mo) |
|---|---|---|---|---|
| Saved presets | 0 (local only) | 3 | 15 | unlimited |
| Particle uploads | 0 | 3 | 15 | unlimited |
| Private packs | 0 | 1 | 3 | unlimited |
| Public packs | 0 | 0 | 3 | unlimited |
| Built-in packs (admin + `@user`) | free ones | free ones | all included | all included |
| Creator packs | n/a | purchase | purchase | see below |

**Decided:** Lucid includes the built-in premium packs (the `@user` builds and admin-made packs). Third Eye includes all packs.

**Open, later:** once a creator market exists, "Third Eye includes all" would undercut creator sales. Plan for it now: tier inclusion is driven by `origin`, not by `isPremium` alone. Today Third Eye = all packs. When creators launch, change the rule to Third Eye = all `builtIn` packs, and creator packs are purchase-only (or a Third Eye discount). No data migration needed if `origin` exists from the start.

Numbers are placeholders from the task. Tune them after seeing real usage.

## Feature gating

The numbers above are quotas. This section is the other half: features that are locked or open per tier. It is a living inventory. Add a row whenever a new feature ships, and decide its tier at the same time.

Legend: yes = available, locked = visible but disabled with an upgrade prompt, n/a = does not apply.

| Feature | Guest | Dream | Lucid | Third Eye | Status |
|---|---|---|---|---|---|
| Load existing presets | yes | yes | yes | yes | proposed |
| Edit from the default configuration | yes | yes | yes | yes | **Decided** |
| Modify a premium preset during the preview | locked | locked | n/a | n/a | **Decided**, implemented |
| Edit a free built-in preset | yes | yes | yes | yes | **Decided** |
| Save a modified copy of a free built-in preset | locked | quota | quota | unlimited | **Decided** |
| Custom path for the fractal (Shape pad's Manual mode) | locked | locked | yes | yes | **Decided**, implemented (client lock only) |
| Save presets | locked | quota | quota | unlimited | proposed |
| Custom particle sprite upload | locked | quota | quota | unlimited | proposed |
| Create private packs | locked | quota | quota | unlimited | proposed |
| Create public packs | locked | locked | quota | unlimited | proposed |
| Built-in premium packs | preview | preview | yes | yes | **Decided**, implemented |
| Creator packs | n/a | purchase | purchase | TBD | open |

Notes:

- **Premium presets in the preview.** **Decided:** no modification at all for Guest and Dream during the 15s preview. The controls are locked (visible, disabled, rainbow outline), so there is nothing to save. This also removes the need for a derived-from marker for premium content: the server only has to refuse saves from a session that is in preview. **Implemented:** `usePremiumTrial` runs a 15s preview once per preset per local day (`previewRecord.ts`, localStorage key `premiumPreviews`); a preset already previewed today opens the upgrade prompt. `PreviewLockFrame` makes the config controls inert inside the rainbow outline (in the sidebar the section headers still open and close, so the config can be looked through but not changed), and the config hotkeys in `main.ts` stand down (`previewLock`). The client sends the active preset's id as `sourcePresetId` with every save, and `PresetService.savePreset` refuses with 403 `{ code: 'premium_preview' }` when every pack that preset is in fails `canUsePack`.
- **Free built-in presets.** **Decided:** everyone can edit them, and Dream users can save a modified copy within their quota. Premium content is fully protected by the preview lock, so the extra save restriction would add little. Guests can edit but never save.
- **Custom fractal path.** Locked for Guest and Dream, open for Lucid and up (`features.customFractalPath`; Lucid and up get every premium feature, only quotas differ by tier). The Shape pad has a Tour | Manual switch under its title. Tour stays free. For Guest and Dream, Manual shows the rainbow outline, and picking it, dragging the pad or a named-shape chip opens the upgrade prompt. The shape is not stored in a preset, so there is no write for the server to refuse.
- **Locked means visible.** Controls stay on screen, disabled, with the existing rainbow premium outline and an upgrade message. Hiding them would hide what the paid tiers offer.
- **Enforcement.** Locked controls are a client display. The server must also refuse the matching writes (for example, a saved preset whose settings differ from the original for a Dream user), or the lock is cosmetic. `getEntitlements` should expose a feature set (`features: { editLoadedPreset, customFractalPath, ... }`) next to the quotas, so a new gated feature is one config entry.
- **Open inventory.** Other candidates to place: external config window, video layer, logo layer, camera macros, extra layer slots beyond a cap, high-resolution or recording features. These need a tier each.

## Purchases

**Decided:** per-pack purchases are one-time payments (permanent ownership, no churn handling).

- Stripe Checkout in `payment` mode for packs, `subscription` mode for plans.
- A `PackPurchase` record: `userId`, `packId`, `stripeSessionId`, `createdAt`. Entitlement check is a lookup.
- Refunds: the webhook handles `charge.refunded` by removing the purchase.
- Creator payouts (future) would use Stripe Connect. Out of scope here, but keep `PackPurchase` shaped so a `sellerId` and fee can be added.

## Downgrade and lapse

**Decided:** keep content, read-only over the limit.

- Existing presets, uploads, and packs stay and still load.
- Creating new ones is blocked until the user is under the limit again.
- Over-limit content is never deleted or locked.
- Edge: a lapsed Lucid user's private packs beyond the Dream limit stay visible to them, but publishing or creating more is blocked.
- Purchased packs are unaffected by plan changes.

## Enforcement points

Server-side, in the service layer (matching the existing handler to service to repository layering):

- `PresetService.savePreset`: count the user's presets against the plan limit (update of an existing preset is always allowed).
- Sprite upload path (`StorageService` caller): count against the upload limit.
- `PackService.createPack`: private/public limits, and admin-only for `origin` and premium flags.
- Pack and preset reads: filter or flag by entitlement so a non-entitled client cannot fetch premium preset configs directly.

Implemented (`server/services/EntitlementService.ts`, numbers in `server/services/entitlements.ts`):

- Preset save: a new preset counts, overwriting an own preset never does.
- Uploads: each R2 upload is recorded in an `Upload` collection and counted. The one copy of the Clerk profile photo (`?kind=avatar`) is free; a second one counts. Uploads made before the collection existed are not counted until backfilled.
- Packs: every user pack counts against `privatePacks`, since packs have no visibility yet (#19), so `publicPacks` is not enforced. Premium or priced packs are admin-only, and `origin` is set on create (`builtIn` for admins, `creator` otherwise).
- Pack access: `canUsePack`. A pack stored without `origin` reads as `builtIn`.
- Admins have no limits.
- Preview saves: `savePreset` takes the source preset's id (`sourcePresetId`) and refuses with 403 `{ code: 'premium_preview' }` when every pack it is in is premium and closed to the user (`canUsePack`). Pack membership is read like the preset list (the packs that reference it, else the legacy `pack` name). The user's own presets and a source in no pack pass.
- Not yet: premium preset configs are still served by id to anyone (the client preview needs them), and a client that leaves out `sourcePresetId` is not refused (the preview lock is the main guard).

Client-side (UI only): `ParticleSpriteHud` (`#20`), preset list and pack tabs (existing `.pack-tab--premium` styling), and upgrade prompts. These read the entitlement payload from `/api/me`.

## Data model changes

- `User`: add `plan: 'free' | 'tier1' | 'tier2'` (default `free`), `stripeCustomerId?`, `planRenewsAt?`. Top-level and server-written only, like `isAdmin` (never inside user-writable `settings`).
- `Pack`: add `origin`. `isPremium` stays. Revisit `price` once purchases exist.
- New `PackPurchase` collection (see Purchases).
- Guests are unauthenticated, so they have no record. Their limits are enforced by simply not allowing server writes.

## Stripe integration

Business setup: use the existing c0d3ster LLC and EIN. Prefer a second Stripe account under the same login for Fractaleyez (separate keys, webhooks, branding, statement descriptor). Check the DBA filing for the Fractaleyez name and sales tax on SaaS in the states that matter. This is not legal or tax advice.

Technical (follows the "write once in `server/routes`, wire in `dev.ts`, thin adapter in `api/`" rule):

- `billingHandler`: create Checkout session (plan or pack), create Customer Portal session. Auth required.
- `stripeWebhookHandler`: needs the raw body for signature verification. Disable body parsing in the Vercel function, mount `express.raw` before `express.json` in `dev.ts`.
- Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`.
- Webhook handlers must be idempotent (store processed event ids or make writes idempotent).
- The webhook is the only writer of `plan` and `PackPurchase`. Success redirects never grant access.
- Local testing: Stripe CLI `stripe listen --forward-to localhost:8080/api/stripeWebhook`. Setup steps and env vars are in `docs/stripe-setup.md`.
- Alternative considered: Clerk Billing. Less code, but extra fees and fewer features, and it does not cover one-time pack purchases well. Not recommended.

## Phased breakdown

This is a rough sketch. The real ordering, file-level detail, and task split belong in `docs/implementation-plans/monetization.md`.

1. **Entitlement foundation (no money).** `User.plan`, `Pack.origin`, `getEntitlements`, `/api/me` payload, admin-only guards. Admin can set a user's plan manually.
2. **Quota enforcement.** Preset save, upload, and pack creation limits, with read-only-over-limit behavior. Resolves `#20`'s "premium means per-user plan" question.
3. **Client gating UX.** Wire entitlements into `ParticleSpriteHud`, preset list, pack tabs, and upgrade prompts. Replace the trial-only premium preview with real entitlement checks, keeping the trial as a try-before-you-buy.
4. **Pack ownership.** `PackPurchase` model and the many-to-many entitlement lookup (depends on `#6`).
5. **Stripe, test mode.** Checkout, portal, webhooks, idempotency, refunds.
6. **Go live.** Live keys, tax settings, DBA, terms and privacy pages, receipt emails.
7. **Creator market (later).** Seller records, Connect payouts, revisit what Third Eye includes, moderation (ties to `#19`).

## Open questions

- Feature gating inventory: which tier gets each unplaced feature (see Feature gating).

- Final tier prices and limits (the table is a starting point).
- Premium preview. **Decided:** the preview stays but becomes one-shot per preset. It was a fixed 30s that restarted on every click, so re-clicking gave unlimited viewing. Shortened to 15s and record each previewed preset in localStorage (soft nudge, not security; server entitlements protect real content). A previewed preset opens the upgrade modal directly, and the record resets each local day so every locked preset can be previewed once per day. Implemented (see Feature gating).
- Annual pricing and any launch discount.
- Pack updates and new releases. **Decided:** inclusion is dynamic, so Lucid keeps access to built-in packs released after they subscribe.
- Whether guests get any server-side presence (analytics, rate limits) beyond local-only use.
