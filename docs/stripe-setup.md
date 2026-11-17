# Stripe setup

How subscriptions are wired, and the steps outside the code to make them work. The plan and tiers are in `docs/research/monetization.md`.

## How it works

- Tiers: Dream (free), Lucid (`tier1`) and Third Eye (`tier2`). Stored ids are neutral. The names, display prices and perks are in `src/config/plans.config.ts`.
- `GET /api/billing` returns the viewer's plan and subscription state. `POST /api/billing` with `{ action: 'checkout', plan: 'tier1' | 'tier2', interval?: 'monthly' | 'yearly' }` returns a Stripe Checkout URL, and with `{ action: 'portal' }` a Customer Portal URL. Both need auth.
- The Plan tab in the account modal (`src/components/settings/PlanPage.tsx`) calls these. A free user gets a "Go Lucid" or "Go Third Eye" button that redirects to Checkout. A subscriber gets "Manage billing", which opens the Portal to switch plans, cancel, change the card or see invoices.
- `User.plan` and `User.billing` are written only from Stripe's own data, by `BillingService.reconcile`, which reads all of the customer's subscriptions and applies the one that decides the plan (highest plan, then newest). It runs on every webhook event (`POST /api/stripeWebhook`) and on the billing requests themselves (opening the Plan tab, starting a checkout), so redelivered, out-of-order, late or missing events all land on the same state. The success redirect grants nothing.
- A customer has at most one open subscription Checkout. Starting a checkout reuses an open session for the same price and return URL (two tabs on Go Lucid both land on the same session, which can only be paid once), and expires any other open subscription session of that customer (Lucid in one tab, then Third Eye in another: the Lucid tab can no longer be paid). A session lasts an hour (`CHECKOUT_LIFETIME_S`, Stripe's default is 24), and one with under 10 minutes left is replaced rather than reused. Two clicks in the same instant can still both create one; `reconcile` then picks the plan as before.
- Without `STRIPE_SECRET_KEY` the Plan tab shows the tiers with "Paid plans are coming soon" instead of buttons, so a deployment can ship the code before Stripe is set up there.
- Prices are found by lookup key, `<plan>_<interval>`: `tier1_monthly`, `tier2_monthly`, and optionally `tier1_yearly` and `tier2_yearly`. No price ids live in env vars.
- `/api/me` also returns `plan` and `entitlements` (`server/services/entitlements.ts`). They aren't enforced yet (monetization phase 2).

## Stripe dashboard (test mode)

1. Products (done): Lucid at $5/month with lookup key `tier1_monthly`, and Third Eye at $20/month with `tier2_monthly`.
2. Customer Portal: set up in code, not the dashboard form. `pnpm stripe-portal-config` creates or updates a configuration tagged `metadata.app = fractaleyez` (cancel at period end, switching between the plan prices with proration, card updates, invoice history, email updates). `BillingService` finds it by that tag when it opens the portal, and falls back to the dashboard's default config if there's none. Test mode is done (`bpc_1UcKJ1CaVNXxCE3wQ0w1zs2g`). Run it again after adding prices (yearly) so the portal can switch to them. With `APP_URL` set, it also sets the terms and privacy links to `<APP_URL>/terms` and `/privacy` and the return URL.
3. Branding (optional): under Settings, Branding, add the logo, icon and colors. Under Settings, Public details, set the business name to `Fractaleyez` and the statement descriptor to `FRACTALEYEZ`.
4. API key: a restricted test key (`rk_test_...`) is enough, with Customer portal Write, Products Read, Prices Read, Checkout Sessions Write, Customers Write and Subscriptions Read. Use it as `STRIPE_SECRET_KEY`.

## Env vars

| Var | Where | Value |
|---|---|---|
| `STRIPE_SECRET_KEY` | `.env`, Vercel | the restricted `rk_test_...` key (a live one on Vercel Production at launch) |
| `STRIPE_WEBHOOK_SECRET` | `.env`, Vercel | `whsec_...`: locally from `stripe listen`, on Vercel from the dashboard endpoint |
| `APP_URL` | optional | Where Stripe returns the user. Without it, the request's Origin is used (`http://localhost:3000` in dev). |

Without the Stripe vars, every other route still works. Only `/api/billing` and the webhook fail.

## Local testing

1. Install the Stripe CLI and run `stripe login` once.
2. Run `stripe listen --forward-to localhost:8080/api/stripeWebhook`. It prints a `whsec_...`; put that in `.env` as `STRIPE_WEBHOOK_SECRET`. The secret stays the same across runs on the same machine.
3. Run `pnpm dev`. Sign in, open the account menu, Manage account, Plan, and click Go Lucid.
4. Pay with the test card `4242 4242 4242 4242`, any future expiry, any CVC.
5. Back on the app, reopen the Plan tab. It should say Lucid, with a renewal date. The `stripe listen` terminal shows the events with 200s.
6. Try Manage billing: switch to Third Eye, then cancel. The tab follows each change (cancel shows "Ends ...", and the plan stays until the period ends).
7. To check a lapse without waiting a month, cancel the subscription immediately in the dashboard. The plan drops to Dream.

If payments go through but `stripe listen` shows no events, the CLI is logged into a different account or sandbox than the API key (an organization has several). Run `stripe login` again and pick the account the products are in. The app doesn't depend on the webhook alone: opening the Plan tab and starting a checkout both read the customer's subscriptions from Stripe and apply them (`BillingService.reconcile`), so a late or missing webhook can't leave the wrong plan or allow a second subscription.

To set a plan by hand without Stripe (for gating work), run `db.users.updateOne({ clerkId: '<id>' }, { $set: { plan: 'tier1' } })` in Mongo.

## Vercel

1. Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to the Preview and Development environments (test keys).
2. In Stripe, under Developers, Webhooks, add an endpoint at `https://<domain>/api/stripeWebhook` with the events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused` and `customer.subscription.resumed`. Its signing secret is the Vercel `STRIPE_WEBHOOK_SECRET`. Preview deployments behind Vercel Deployment Protection reject Stripe's calls, so point the test endpoint at a deployment Stripe can reach.
3. Databases: Production's `MONGO_URI` points at the `prod` database and Preview and Development at `dev`, so test-mode payments on a preview never touch real users.
4. Plan: the whole API is one Vercel function (`api/index.ts`), so the Hobby plan's function limit no longer matters. Hobby is for non-commercial use only, though, so selling subscriptions needs Pro.

## Going live

- The account is activated. Make a live restricted key with the same permissions, check the live prices kept their lookup keys, run `pnpm stripe-portal-config:prod` with the live key in `.env.production`, and set the live key and a live webhook endpoint on Vercel Production.
- Test and live are separate data in Stripe: a customer id from test mode doesn't exist in live. The dev and prod databases are already separate, so this only matters if test-mode data is copied into prod.
- Revisit tax (Stripe Tax and SaaS taxability per state), terms and privacy pages, and receipt emails (Settings, Emails).
