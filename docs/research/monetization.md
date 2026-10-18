# Monetization plan (task #11)

Research and plan only. No billing is implemented. Decisions marked **Decided** came from the owner; everything else is a proposal.

## Current state

- `Pack` has `isPremium` and an optional `price`. `User` has only `isAdmin`. There is no per-user plan or entitlement.
- Nothing enforces quotas server-side. `Preset` is unique on `(name, userId)` and that is the only limit.
- The client previews premium packs through `usePremiumTrial` / `PremiumTrialModal`.
- `#20` (upload gating), `#19` (visibility model), and `#6` (pack references) all depend on the entitlement model below.

## Core model

Two independent concepts:

1. **Plan** (subscription): `guest | free | plus | premium`. Sets quotas and which pack groups are included.
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

| | Guest | Free | Plus (~$5/mo) | Premium (~$20/mo) |
|---|---|---|---|---|
| Saved presets | 0 (local only) | 3 | 10 | unlimited |
| Particle uploads | 0 | 3 | 10 | unlimited |
| Private packs | 0 | 1 | 3 | unlimited |
| Public packs | 0 | 0 | 3 | unlimited |
| Built-in packs (admin + `@user`) | free ones | free ones | all included | all included |
| Creator packs | n/a | purchase | purchase | see below |

**Decided:** Plus includes the built-in premium packs (the `@user` builds and admin-made packs). Premium includes all packs.

**Open, later:** once a creator market exists, "Premium includes all" would undercut creator sales. Plan for it now: tier inclusion is driven by `origin`, not by `isPremium` alone. Today Premium = all packs. When creators launch, change the rule to Premium = all `builtIn` packs, and creator packs are purchase-only (or a Premium discount). No data migration needed if `origin` exists from the start.

Numbers are placeholders from the task. Tune them after seeing real usage.

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
- Edge: a lapsed Plus user's private packs beyond the Free limit stay visible to them, but publishing or creating more is blocked.
- Purchased packs are unaffected by plan changes.

## Enforcement points

Server-side, in the service layer (matching the existing handler to service to repository layering):

- `PresetService.savePreset`: count the user's presets against the plan limit (update of an existing preset is always allowed).
- Sprite upload path (`StorageService` caller): count against the upload limit.
- `PackService.createPack`: private/public limits, and admin-only for `origin` and premium flags.
- Pack and preset reads: filter or flag by entitlement so a non-entitled client cannot fetch premium preset configs directly.

Client-side (UI only): `ParticleSpriteHud` (`#20`), preset list and pack tabs (existing `.pack-tab--premium` styling), and upgrade prompts. These read the entitlement payload from `/api/me`.

## Data model changes

- `User`: add `plan: 'free' | 'plus' | 'premium'` (default `free`), `stripeCustomerId?`, `planRenewsAt?`. Top-level and server-written only, like `isAdmin` (never inside user-writable `settings`).
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
- Local testing: Stripe CLI `stripe listen --forward-to localhost:8080/api/stripe-webhook`.
- Alternative considered: Clerk Billing. Less code, but extra fees and fewer features, and it does not cover one-time pack purchases well. Not recommended.

## Phased breakdown

This is a rough sketch. The real ordering, file-level detail, and task split belong in `docs/implementation-plans/monetization.md`.

1. **Entitlement foundation (no money).** `User.plan`, `Pack.origin`, `getEntitlements`, `/api/me` payload, admin-only guards. Admin can set a user's plan manually.
2. **Quota enforcement.** Preset save, upload, and pack creation limits, with read-only-over-limit behavior. Resolves `#20`'s "premium means per-user plan" question.
3. **Client gating UX.** Wire entitlements into `ParticleSpriteHud`, preset list, pack tabs, and upgrade prompts. Replace the trial-only premium preview with real entitlement checks, keeping the trial as a try-before-you-buy.
4. **Pack ownership.** `PackPurchase` model and the many-to-many entitlement lookup (depends on `#6`).
5. **Stripe, test mode.** Checkout, portal, webhooks, idempotency, refunds.
6. **Go live.** Live keys, tax settings, DBA, terms and privacy pages, receipt emails.
7. **Creator market (later).** Seller records, Connect payouts, revisit what Premium includes, moderation (ties to `#19`).

## Open questions

- Final tier prices and limits (the table is a starting point).
- Premium preview. **Decided:** the preview stays but becomes one-shot per preset. Today it is a fixed 30s that restarts on every click, so re-clicking gives unlimited viewing. Shorten to 15s and record each previewed preset in localStorage (soft nudge, not security; server entitlements protect real content). A previewed preset opens the upgrade modal directly, and the record resets each local day so every locked preset can be previewed once per day.
- Annual pricing and any launch discount.
- Pack updates and new releases. **Decided:** inclusion is dynamic, so Plus keeps access to built-in packs released after they subscribe.
- Whether guests get any server-side presence (analytics, rate limits) beyond local-only use.
