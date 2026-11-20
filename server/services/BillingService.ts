import type Stripe from 'stripe'
import { getStripe, isStripeConfigured } from '../stripe.js'
import { userRepository } from '../repositories/UserRepository.js'
import { userService } from './UserService.js'
import { IUser, PaidPlanId, PlanId, isPaidPlanId } from '../models/User.js'

export const BILLING_INTERVALS = ['monthly', 'yearly'] as const
export type BillingInterval = typeof BILLING_INTERVALS[number]

export const isBillingInterval = (value: unknown): value is BillingInterval =>
  typeof value === 'string' && (BILLING_INTERVALS as readonly string[]).includes(value)

export type BillingErrorCode = 'already_subscribed' | 'no_customer' | 'price_not_found' | 'unavailable'

/** An expected refusal the handler maps to a 4xx, as opposed to a Stripe or database failure. */
export class BillingError extends Error {
  readonly code: BillingErrorCode

  constructor(code: BillingErrorCode, message: string) {
    super(message)
    this.name = 'BillingError'
    this.code = code
  }
}

export type BillingStatus = {
  plan: PlanId
  /** Stripe's subscription status, or null when the user never subscribed. */
  status: string | null
  /** ISO date the current period ends (renewal, or the end date when cancelAtPeriodEnd). */
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  /** Has a Stripe customer, so the Customer Portal can open (invoices, card, resubscribe). */
  canManageBilling: boolean
  /** False while Stripe isn't configured for this deployment: the Plan tab shows the tiers without buttons. */
  available: boolean
}

const assertAvailable = (): void => {
  if (!isStripeConfigured()) throw new BillingError('unavailable', 'Paid plans are not available yet')
}

// past_due keeps the plan while Stripe retries the card (Smart Retries); it ends as canceled or unpaid if every retry fails.
const PLAN_HOLDING_STATUSES: ReadonlySet<string> = new Set<Stripe.Subscription.Status>(['active', 'trialing', 'past_due'])

/** Stripe price lookup keys are `<plan>_<interval>`, e.g. `tier1_monthly`: set on each price in the dashboard. */
export const lookupKeyFor = (plan: PaidPlanId, interval: BillingInterval): string => `${plan}_${interval}`

export const planFromLookupKey = (lookupKey: string | null | undefined): PaidPlanId | null => {
  const prefix = lookupKey?.split('_')[0]
  return isPaidPlanId(prefix) ? prefix : null
}

/** The plan a subscription grants: the highest plan among its items, and free unless the status still holds a plan. */
export const planFromSubscription = (subscription: Stripe.Subscription): PlanId => {
  if (!PLAN_HOLDING_STATUSES.has(subscription.status)) return 'free'
  const plans = subscription.items.data.map((item) => planFromLookupKey(item.price.lookup_key))
  if (plans.includes('tier2')) return 'tier2'
  if (plans.includes('tier1')) return 'tier1'
  return 'free'
}

/** Since API version 2025-03-31 the billing period lives on each item, not on the subscription. */
const currentPeriodEndOf = (subscription: Stripe.Subscription): Date | undefined => {
  const ends = subscription.items.data.map((item) => item.current_period_end)
  return ends.length > 0 ? new Date(Math.max(...ends) * 1000) : undefined
}

/**
 * How long a Checkout Session stays payable (Stripe allows 30 minutes to 24 hours, default 24). An hour is plenty to pay,
 * and an abandoned tab stops being a way into a second subscription soon after.
 */
export const CHECKOUT_LIFETIME_S = 60 * 60
/** An open session with less time left than this is expired and replaced instead of reused, so nobody lands on one that lapses mid-payment. */
export const CHECKOUT_REUSE_MIN_LEFT_S = 10 * 60

/** Tag on the portal configuration the app uses (set in the dashboard, test and live). */
export const PORTAL_METADATA_APP = 'fractaleyez'

const idOf = (value: string | { id: string } | null | undefined): string | null => {
  if (!value) return null
  return typeof value === 'string' ? value : value.id
}

const PLAN_RANK: Record<PlanId, number> = { free: 0, tier1: 1, tier2: 2 }

/**
 * The subscription that should decide a customer's plan when they have several: one that holds the highest plan, newest
 * first; else the newest. Two can be live at once when a second Checkout ran before the first one's webhook landed.
 */
export const pickSubscription = (subscriptions: Stripe.Subscription[]): Stripe.Subscription | null => {
  const ranked = [...subscriptions].sort((a, b) =>
    PLAN_RANK[planFromSubscription(b)] - PLAN_RANK[planFromSubscription(a)] || b.created - a.created)
  return ranked[0] ?? null
}

const holdsPlan = (user: IUser): boolean =>
  user.plan !== 'free' && typeof user.billing?.status === 'string' && PLAN_HOLDING_STATUSES.has(user.billing.status)

type CheckoutRequest = {
  clerkId: string
  plan: PaidPlanId
  interval: BillingInterval
  /** Absolute URL Stripe sends the user back to, with `?billing=success` or `?billing=cancel` appended. */
  returnUrl: string
}

/**
 * Checkout and the Customer Portal for subscriptions. The webhook (handleEvent) is the only writer of `plan`: a success
 * redirect never grants anything, it only brings the user back while the webhook lands.
 */
export class BillingService {
  private portalConfigurationId: Promise<string | null> | null = null
  /** Reconciles with Stripe first, so the plan is right even when a webhook is late or never arrived. */
  async getStatus(clerkId: string): Promise<BillingStatus> {
    let user = await userService.getOrCreateUser(clerkId)
    try {
      if (isStripeConfigured()) user = await this.reconcile(user)
    } catch (err) {
      console.error('Failed to reconcile billing with Stripe; showing the stored plan', err)
    }
    return {
      plan: user.plan ?? 'free',
      status: user.billing?.status ?? null,
      currentPeriodEnd: user.billing?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: user.billing?.cancelAtPeriodEnd === true,
      canManageBilling: isStripeConfigured() && typeof user.billing?.customerId === 'string',
      available: isStripeConfigured(),
    }
  }

  async createCheckoutSession({ clerkId, plan, interval, returnUrl }: CheckoutRequest): Promise<string> {
    assertAvailable()
    // Asks Stripe, not just the stored plan: a subscription whose webhook hasn't landed yet still counts.
    const user = await this.reconcile(await userService.getOrCreateUser(clerkId))

    const stripe = getStripe()
    const lookupKey = lookupKeyFor(plan, interval)
    const { data: prices } = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 })
    const price = prices[0]
    if (!price) throw new BillingError('price_not_found', `No active Stripe price with lookup key ${lookupKey}`)

    // A subscriber changes the price on their subscription (prorated by the portal); a second Checkout would start a second subscription.
    if (holdsPlan(user)) return this.createPlanChangeSession(user, price.id, returnUrl)

    const customerId = await this.ensureCustomer(user)
    const successUrl = withBillingParam(returnUrl, 'success')
    const reusable = await this.settleOpenCheckouts(customerId, price.id, successUrl)
    if (reusable) return reusable

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: clerkId,
      line_items: [{ price: price.id, quantity: 1 }],
      subscription_data: { metadata: { clerkId } },
      allow_promotion_codes: true,
      success_url: successUrl,
      cancel_url: withBillingParam(returnUrl, 'cancel'),
      expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_LIFETIME_S,
    })
    if (!session.url) throw new Error('Stripe returned a Checkout Session without a URL')
    return session.url
  }

  /**
   * Keeps at most one open subscription Checkout per customer, so two tabs can't end in two subscriptions. Returns the URL of
   * an open session for the same price and return URL with time left on it; every other open subscription session of the
   * customer (another plan, another interval, nearly expired) is expired, so its tab can no longer be paid. Two requests in
   * the same instant can still both create one; reconcile's pickSubscription then decides the plan, as before.
   */
  private async settleOpenCheckouts(customerId: string, priceId: string, successUrl: string): Promise<string | null> {
    const stripe = getStripe()
    const { data: open } = await stripe.checkout.sessions.list({
      customer: customerId,
      status: 'open',
      limit: 10,
      expand: ['data.line_items'],
    })
    const minExpiresAt = Math.floor(Date.now() / 1000) + CHECKOUT_REUSE_MIN_LEFT_S
    let reusable: string | null = null
    for (const session of open) {
      if (session.mode !== 'subscription') continue
      const matches = session.url && session.success_url === successUrl && session.expires_at >= minExpiresAt &&
        session.line_items?.data.length === 1 && session.line_items.data[0]?.price?.id === priceId
      if (matches && !reusable) {
        reusable = session.url
        continue
      }
      await stripe.checkout.sessions.expire(session.id)
    }
    return reusable
  }

  /**
   * A portal session that opens straight on the confirm page for switching the subscription to `priceId`, so the Plan tab's
   * button changes the plan in one step instead of through the portal's menus. Back on the app, `?billing=success` reconciles.
   * A subscription set to cancel opens the portal home instead, where it can be renewed and switched.
   */
  private async createPlanChangeSession(user: IUser, priceId: string, returnUrl: string): Promise<string> {
    const customerId = user.billing?.customerId
    const subscriptionId = user.billing?.subscriptionId
    if (!customerId || !subscriptionId) throw new BillingError('no_customer', 'No subscription to change yet')

    const stripe = getStripe()
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    const [item, ...rest] = subscription.items.data
    if (!item || rest.length > 0) throw new Error(`Stripe subscription ${subscription.id} does not have exactly one item`)
    if (item.price.id === priceId) throw new BillingError('already_subscribed', 'You are already on this plan')

    const flowData: Stripe.BillingPortal.SessionCreateParams.FlowData = {
      type: 'subscription_update_confirm',
      subscription_update_confirm: { subscription: subscription.id, items: [{ id: item.id, price: priceId, quantity: 1 }] },
      after_completion: { type: 'redirect', redirect: { return_url: withBillingParam(returnUrl, 'success') } },
    }
    const configuration = await this.resolvePortalConfiguration()
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
      ...(configuration ? { configuration } : {}),
      ...(subscription.cancel_at_period_end ? {} : { flow_data: flowData }),
    })
    return session.url
  }

  async createPortalSession(clerkId: string, returnUrl: string): Promise<string> {
    assertAvailable()
    const user = await userService.getOrCreateUser(clerkId)
    const customerId = user.billing?.customerId
    if (!customerId) throw new BillingError('no_customer', 'No billing account yet: subscribe first')
    const configuration = await this.resolvePortalConfiguration()
    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
      ...(configuration ? { configuration } : {}),
    })
    return session.url
  }

  /**
   * The configuration tagged with PORTAL_METADATA_APP, found by its metadata and kept for the life of the process. Without
   * one, Stripe uses the dashboard's default configuration. A failed lookup is not kept, so the next call tries again.
   */
  private resolvePortalConfiguration(): Promise<string | null> {
    this.portalConfigurationId ??= getStripe().billingPortal.configurations.list({ active: true, limit: 100 })
      .then(({ data }) => data.find((c) => c.metadata?.app === PORTAL_METADATA_APP)?.id ?? null)
      .catch((err: unknown) => {
        this.portalConfigurationId = null
        throw err
      })
    return this.portalConfigurationId
  }

  /** Every event re-reads the subscription from Stripe, so redelivered and out-of-order events converge on the same state. */
  async handleEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        if (session.mode !== 'subscription') return
        const subscriptionId = idOf(session.subscription)
        if (subscriptionId) await this.syncSubscription(subscriptionId)
        return
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed':
        await this.syncSubscription(event.data.object.id)
        return
      default:
        return
    }
  }

  /**
   * The webhook path. The event's subscription only says which customer changed: the plan comes from reconcile, which
   * reads all of that customer's subscriptions, so the webhook and request-time paths always pick the same one.
   */
  async syncSubscription(subscriptionId: string): Promise<void> {
    const subscription = await getStripe().subscriptions.retrieve(subscriptionId)
    const customerId = idOf(subscription.customer)
    if (!customerId) return
    const user = await this.findSubscriber(customerId, subscription)
    if (!user) {
      console.warn(`Stripe subscription ${subscription.id} has no matching user (customer ${customerId})`)
      return
    }
    await this.reconcile(user)
  }

  /**
   * Reads the customer's subscriptions from Stripe and applies the one that decides the plan (pickSubscription), the same
   * write the webhook makes. Returns the user as stored afterwards. A user with no Stripe customer is returned as is.
   */
  private async reconcile(user: IUser): Promise<IUser> {
    const customerId = user.billing?.customerId
    if (!customerId) return user
    const { data } = await getStripe().subscriptions.list({ customer: customerId, status: 'all', limit: 20 })
    const picked = pickSubscription(data)
    if (!picked) return user
    // Nothing holds a plan any more: apply the ended subscription we stored, or the stale-subscription guard would skip it.
    const stored = data.find((s) => s.id === user.billing?.subscriptionId)
    const subscription = planFromSubscription(picked) === 'free' && stored ? stored : picked
    await this.applySubscription(subscription)
    return (await userRepository.findByStripeCustomerId(customerId)) ?? user
  }

  private async applySubscription(subscription: Stripe.Subscription): Promise<void> {
    const customerId = idOf(subscription.customer)
    if (!customerId) return

    const user = await this.findSubscriber(customerId, subscription)
    if (!user) {
      console.warn(`Stripe subscription ${subscription.id} has no matching user (customer ${customerId})`)
      return
    }

    const plan = planFromSubscription(subscription)
    // An older subscription ending must not cancel a newer one that already holds the plan.
    const storedSubscriptionId = user.billing?.subscriptionId
    if (storedSubscriptionId && storedSubscriptionId !== subscription.id && plan === 'free' && holdsPlan(user)) return

    await userRepository.syncBilling(customerId, {
      plan,
      billing: {
        subscriptionId: subscription.id,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        currentPeriodEnd: currentPeriodEndOf(subscription),
      },
    })
  }

  /** By the linked customer, else by the clerkId Checkout stamped on the subscription (customer created outside ensureCustomer). */
  private async findSubscriber(customerId: string, subscription: Stripe.Subscription): Promise<IUser | null> {
    const byCustomer = await userRepository.findByStripeCustomerId(customerId)
    if (byCustomer) return byCustomer
    const clerkId = subscription.metadata.clerkId
    if (!clerkId) return null
    await userService.getOrCreateUser(clerkId)
    const linkedCustomerId = await userRepository.linkStripeCustomer(clerkId, customerId)
    if (linkedCustomerId !== customerId) return null
    return userRepository.findByStripeCustomerId(customerId)
  }

  /**
   * The user's Stripe customer, created on first checkout with the Clerk account's email so Checkout fills it in. An
   * existing customer without an email gets one; one that has an email keeps it (the portal lets people change it).
   */
  private async ensureCustomer(user: IUser): Promise<string> {
    const stripe = getStripe()
    const existing = user.billing?.customerId
    if (existing) {
      const customer = await stripe.customers.retrieve(existing)
      if (!customer.deleted) {
        if (!customer.email) await this.fillMissingEmail(existing, user.clerkId)
        return existing
      }
      // Deleted in Stripe (by hand, or a test cleanup): its subscriptions are gone too, so start over with a new customer.
      const replacement = await this.createCustomer(user)
      const linkedCustomerId = await userRepository.replaceStripeCustomer(user.clerkId, existing, replacement)
      if (linkedCustomerId !== replacement) await this.deleteDuplicateCustomer(replacement)
      return linkedCustomerId
    }
    const customerId = await this.createCustomer(user)
    // No idempotency key: Stripe would replay the first customer for 24h even after it was deleted or the link was lost
    // (a reset dev database). A double click can create two; the first link wins and the other is deleted.
    const linkedCustomerId = await userRepository.linkStripeCustomer(user.clerkId, customerId)
    if (linkedCustomerId !== customerId) await this.deleteDuplicateCustomer(customerId)
    return linkedCustomerId
  }

  private async createCustomer(user: IUser): Promise<string> {
    const email = await userService.getPrimaryEmail(user.clerkId)
    const customer = await getStripe().customers.create({
      metadata: { clerkId: user.clerkId },
      ...(email ? { email } : {}),
      ...(user.displayName ? { name: user.displayName } : {}),
    })
    return customer.id
  }

  private async deleteDuplicateCustomer(customerId: string): Promise<void> {
    await getStripe().customers.del(customerId)
      .catch((err: unknown) => console.error(`Failed to delete duplicate Stripe customer ${customerId}`, err instanceof Error ? err.message : err))
  }

  private async fillMissingEmail(customerId: string, clerkId: string): Promise<void> {
    const stripe = getStripe()
    const email = await userService.getPrimaryEmail(clerkId)
    if (email) await stripe.customers.update(customerId, { email })
  }
}

const withBillingParam = (returnUrl: string, outcome: 'success' | 'cancel'): string => {
  const url = new URL(returnUrl)
  url.searchParams.set('billing', outcome)
  return url.toString()
}

export const billingService = new BillingService()
