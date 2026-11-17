// Creates or updates the Stripe Customer Portal configuration Fractaleyez uses, so the portal is set up in code instead of the
// dashboard form. Safe to run again: it finds its own configuration by metadata and updates it.
//
//   pnpm stripe-portal-config          test mode, from STRIPE_SECRET_KEY in .env
//   pnpm stripe-portal-config:prod     .env.production on top (live key)
//
// The products come from the plan prices' lookup keys (tier1_monthly, tier2_monthly, and the yearly ones when they exist).
// With APP_URL set, the terms and privacy links point at <APP_URL>/terms and /privacy and the return URL at <APP_URL>/.
// BillingService finds this configuration by the same metadata when it opens the portal.
import './loadEnv.js'
import Stripe from 'stripe'

const PORTAL_METADATA_APP = 'fractaleyez'
const LOOKUP_KEYS = ['tier1_monthly', 'tier2_monthly', 'tier1_yearly', 'tier2_yearly']
// Same flag and parsing as server/stripe.ts's isAutomaticTaxEnabled.
const AUTOMATIC_TAX = ['true', '1'].includes(process.env.STRIPE_AUTOMATIC_TAX?.trim().toLowerCase() ?? '')

const main = async () => {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is required')
  // The fetch client honors HTTPS_PROXY (with NODE_USE_ENV_PROXY=1), which Node's https module does not.
  const stripe = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() })

  const { data: prices } = await stripe.prices.list({ lookup_keys: LOOKUP_KEYS, active: true, limit: 100 })
  if (prices.length === 0) throw new Error(`No active prices with lookup keys ${LOOKUP_KEYS.join(', ')}`)
  const pricesByProduct = new Map()
  for (const price of prices) {
    const product = typeof price.product === 'string' ? price.product : price.product.id
    pricesByProduct.set(product, [...(pricesByProduct.get(product) ?? []), price.id])
  }
  console.info(`Mode: ${prices[0].livemode ? 'LIVE' : 'test'}. Prices: ${prices.map((p) => p.lookup_key).join(', ')}`)

  const appUrl = process.env.APP_URL ? new URL(process.env.APP_URL) : null
  const params = {
    business_profile: {
      headline: 'Manage your Fractaleyez plan',
      ...(appUrl ? {
        privacy_policy_url: new URL('/privacy', appUrl).toString(),
        terms_of_service_url: new URL('/terms', appUrl).toString(),
      } : {}),
    },
    ...(appUrl ? { default_return_url: new URL('/', appUrl).toString() } : {}),
    features: {
      // With Stripe Tax on, renewals are taxed from the customer's address, so people can correct it here too.
      customer_update: { enabled: true, allowed_updates: AUTOMATIC_TAX ? ['email', 'address'] : ['email'] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      // At period end, so a cancelled plan keeps working until what was paid for runs out.
      subscription_cancel: {
        enabled: true,
        mode: 'at_period_end',
        cancellation_reason: { enabled: true, options: ['too_expensive', 'missing_features', 'unused', 'other'] },
      },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ['price'],
        proration_behavior: 'create_prorations',
        products: [...pricesByProduct].map(([product, productPrices]) => ({ product, prices: productPrices })),
      },
    },
    metadata: { app: PORTAL_METADATA_APP },
  }

  const { data: configurations } = await stripe.billingPortal.configurations.list({ active: true, limit: 100 })
  const existing = configurations.find((c) => c.metadata?.app === PORTAL_METADATA_APP)
  const configuration = existing
    ? await stripe.billingPortal.configurations.update(existing.id, params)
    : await stripe.billingPortal.configurations.create(params)
  console.info(`${existing ? 'Updated' : 'Created'} portal configuration ${configuration.id}`)
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
