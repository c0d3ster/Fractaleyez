import Stripe from 'stripe'
import { env, requireEnv } from './env.js'

let stripeClient: Stripe | null = null

/** Lazy so a deployment without Stripe keys still serves every non-billing route. */
export const getStripe = (): Stripe => {
  stripeClient ??= new Stripe(requireEnv.STRIPE_SECRET_KEY())
  return stripeClient
}

/** Whether this deployment has a Stripe key at all: billing answers "not available yet" instead of failing when it doesn't. */
export const isStripeConfigured = (): boolean => typeof env.STRIPE_SECRET_KEY === 'string' && env.STRIPE_SECRET_KEY.length > 0

/** STRIPE_AUTOMATIC_TAX=true (or 1): Checkout collects the billing address and adds tax through Stripe Tax. Anything else is off. */
export const isAutomaticTaxEnabled = (): boolean => ['true', '1'].includes(env.STRIPE_AUTOMATIC_TAX?.trim().toLowerCase() ?? '')
