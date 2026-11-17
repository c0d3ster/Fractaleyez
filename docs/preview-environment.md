# Preview environment

How to make Vercel preview deployments (`*.vercel.app`) sign in and load presets. The owner does these steps: key values can't be read or set from a Claude session.

## The problem

Previews are built with the production Clerk publishable key (`pk_live_...`). A Clerk production instance only answers on its own domain (`fractaleyez.com`), so on a `*.vercel.app` preview Clerk refuses to load: no sign-in button, no session, and every authed call fails. The fix is to give the Preview environment the Clerk **development** instance's keys. A development instance accepts any origin, `localhost` and `*.vercel.app` included.

## Current state

From the Vercel API (names and targets only, values not read), as of 2026-11-17:

| Var | Production | Preview | Development |
|---|---|---|---|
| `CLERK_PUBLISHABLE_KEY` | own value | shared value | shared value |
| `CLERK_SECRET_KEY` | own value | shared value | shared value |
| `CLERK_WEBHOOK_SECRET` | set | not set | not set |
| `MONGO_URI` | `prod` database | `dev` database (shared) | `dev` database (shared) |
| `R2_*` | set | set | some |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | not set | not set | not set |
| `APP_URL` | not set | not set | not set |

So Preview already has its own Clerk entries, separate from Production. Previews still fail, which means the Preview values are the live keys. Replacing those two values is the whole fix; no new variable is needed for sign-in.

The project also has Vercel Authentication on for every deployment except custom domains (`ssoProtection: all_except_custom_domains`). Only people signed in to the Vercel team can open a preview. That is fine for testing by hand, but it blocks server-to-server calls (Stripe and Clerk webhooks) to a preview URL.

## Steps

1. In the Clerk dashboard, switch to the **Development** instance of the Fractaleyez application and open API keys. Copy the publishable key (`pk_test_...`) and the secret key (`sk_test_...`). These are the keys a local `.env` should use too.
2. In Vercel, open the project, Settings, Environment Variables. Edit `CLERK_PUBLISHABLE_KEY` (the entry for Preview and Development) and paste the `pk_test_...` value. Edit `CLERK_SECRET_KEY` (Preview and Development) and paste the `sk_test_...` value. Leave the Production entries alone.

   Or with the CLI, from the repo:

   ```sh
   vercel env rm CLERK_PUBLISHABLE_KEY preview
   vercel env add CLERK_PUBLISHABLE_KEY preview   # paste pk_test_...
   vercel env rm CLERK_SECRET_KEY preview
   vercel env add CLERK_SECRET_KEY preview        # paste sk_test_...
   ```

   The two entries are shared with Development; repeat with `development` if the CLI splits them.
3. Redeploy a preview. `CLERK_PUBLISHABLE_KEY` is baked into `public/app.js` at build time (webpack `EnvironmentPlugin`), so an existing preview keeps the old key. Push a commit to any branch, or Redeploy a preview from the Deployments tab with the build cache off.

`src/index.tsx` accepts either `pk_test_` or `pk_live_`, so no code change is needed.

## Verify

1. Open the preview URL (sign in to Vercel first, because of Vercel Authentication).
2. The Sign In button appears in the top bar. Clerk shows a "Development mode" badge on its sign-in modal: that is expected.
3. Sign in, then open the preset list. Presets and packs load from the `dev` database.
4. Manage account opens, with the Visualizer and Plan tabs.

## Users on previews

The development instance has its own users, separate from production. Someone who signs in on a preview is a different Clerk user (a different `clerkId`) from their production account, and starts with a new user document in the `dev` database. That matches local dev when the local `.env` uses the same development keys, so local dev and previews share one set of test users and one database. Admin flags (`isAdmin`) and plans set by hand in `dev` apply to the development `clerkId`, and `SEED_OWNER_ID` in `.env` is the development admin's id (see `CLAUDE.md`).

## Clerk webhook on previews

`/api/clerkWebhook` needs `CLERK_WEBHOOK_SECRET`, which only Production has. Previews don't need it: `/api/me` creates the user document on first sign-in and fills the display name from Clerk. If you want the webhook on a preview anyway, add an endpoint in the development instance's Webhooks page and set its `whsec_...` as `CLERK_WEBHOOK_SECRET` for Preview. Vercel Authentication blocks the call unless the endpoint URL includes a protection bypass token (Settings, Deployment Protection, Protection Bypass for Automation), so it is usually simpler to test webhooks locally.

## Stripe on previews

Billing on a preview needs the Stripe **test** keys on Preview: `STRIPE_SECRET_KEY` (`rk_test_...`) and `STRIPE_WEBHOOK_SECRET`. Without them the Plan tab shows "Paid plans are coming soon", which is safe. The same Vercel Authentication caveat applies to Stripe's webhook calls: see the Vercel section of `docs/stripe-setup.md`. Without a reachable webhook, opening the Plan tab still reconciles the plan from Stripe (`BillingService.reconcile`), so checkout can be tested on a preview with only `STRIPE_SECRET_KEY` set. Never put a live Stripe key on Preview.

## Open questions for the owner

- Should Preview and Development keep sharing one set of Clerk keys (simplest), or should Development get its own entries?
- Stripe test keys on Preview: wanted now, or only once billing work needs preview testing?
