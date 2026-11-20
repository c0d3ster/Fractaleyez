import type Stripe from 'stripe'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getStripe, isStripeConfigured } from '../stripe.js'
import { userRepository } from '../repositories/UserRepository.js'
import { userService } from './UserService.js'
import { IUser } from '../models/User.js'
import { BillingError, BillingService, billingService, CHECKOUT_LIFETIME_S, CHECKOUT_REUSE_MIN_LEFT_S, pickSubscription, planFromLookupKey, planFromSubscription } from './BillingService.js'

vi.mock('../stripe.js', () => ({ getStripe: vi.fn(), isStripeConfigured: vi.fn(() => true) }))
vi.mock('../repositories/UserRepository.js', () => ({
  userRepository: {
    findByClerkId: vi.fn(),
    findByStripeCustomerId: vi.fn(),
    linkStripeCustomer: vi.fn(),
    replaceStripeCustomer: vi.fn(),
    syncBilling: vi.fn(),
  },
}))
vi.mock('./UserService.js', () => ({ userService: { getOrCreateUser: vi.fn(), getPrimaryEmail: vi.fn() } }))

const stripeMock = {
  prices: { list: vi.fn() },
  customers: { create: vi.fn(), del: vi.fn(), retrieve: vi.fn(), update: vi.fn() },
  checkout: { sessions: { create: vi.fn(), list: vi.fn(), expire: vi.fn() } },
  billingPortal: { sessions: { create: vi.fn() }, configurations: { list: vi.fn() } },
  subscriptions: { retrieve: vi.fn(), list: vi.fn(), cancel: vi.fn() },
}

const makeSubscription = (overrides: {
  id?: string
  status?: Stripe.Subscription.Status
  lookupKeys?: (string | null)[]
  periodEnds?: number[]
  customer?: string
  metadata?: Record<string, string>
  cancelAtPeriodEnd?: boolean
  created?: number
} = {}): Stripe.Subscription => {
  const lookupKeys = overrides.lookupKeys ?? ['tier1_monthly']
  const periodEnds = overrides.periodEnds ?? [1_800_000_000]
  return {
    id: overrides.id ?? 'sub_1',
    status: overrides.status ?? 'active',
    customer: overrides.customer ?? 'cus_1',
    metadata: overrides.metadata ?? {},
    cancel_at_period_end: overrides.cancelAtPeriodEnd ?? false,
    created: overrides.created ?? 1_700_000_000,
    items: {
      data: lookupKeys.map((lookupKey, i) => ({ price: { lookup_key: lookupKey }, current_period_end: periodEnds[i] ?? periodEnds[0] })),
    },
  } as unknown as Stripe.Subscription
}

const makeUser = (overrides: Partial<IUser> = {}): IUser =>
  ({ clerkId: 'user_1', displayName: 'Ada', plan: 'free', billing: {}, ...overrides }) as unknown as IUser

beforeEach(() => {
  vi.mocked(getStripe).mockReturnValue(stripeMock as unknown as Stripe)
  for (const fn of [
    stripeMock.prices.list, stripeMock.customers.create, stripeMock.customers.del, stripeMock.customers.retrieve, stripeMock.customers.update, stripeMock.checkout.sessions.create,
    stripeMock.checkout.sessions.list, stripeMock.checkout.sessions.expire,
    stripeMock.billingPortal.sessions.create, stripeMock.billingPortal.configurations.list, stripeMock.subscriptions.retrieve, stripeMock.subscriptions.list, stripeMock.subscriptions.cancel,
  ]) fn.mockReset()
  stripeMock.subscriptions.list.mockResolvedValue({ data: [] })
  stripeMock.checkout.sessions.list.mockResolvedValue({ data: [] })
  stripeMock.checkout.sessions.expire.mockResolvedValue({})
  stripeMock.customers.retrieve.mockResolvedValue({ id: 'cus_existing', email: 'ada@example.com' })
  vi.mocked(isStripeConfigured).mockReturnValue(true)
  vi.mocked(userRepository.replaceStripeCustomer).mockReset()
  vi.mocked(userRepository.findByStripeCustomerId).mockReset()
  vi.mocked(userRepository.findByClerkId).mockReset().mockResolvedValue(makeUser())
  vi.mocked(userRepository.linkStripeCustomer).mockReset()
  vi.mocked(userRepository.syncBilling).mockReset().mockResolvedValue(null)
  vi.mocked(userService.getOrCreateUser).mockReset().mockResolvedValue(makeUser())
  vi.mocked(userService.getPrimaryEmail).mockReset().mockResolvedValue('ada@example.com')
})

describe('planFromLookupKey', () => {
  it('reads the plan from the lookup key prefix', () => {
    expect(planFromLookupKey('tier1_monthly')).toBe('tier1')
    expect(planFromLookupKey('tier2_yearly')).toBe('tier2')
  })

  it('ignores prices that are not a plan', () => {
    expect(planFromLookupKey('free_monthly')).toBeNull()
    expect(planFromLookupKey('pack_123')).toBeNull()
    expect(planFromLookupKey(null)).toBeNull()
  })
})

describe('planFromSubscription', () => {
  it('grants the plan while active, trialing or past_due', () => {
    expect(planFromSubscription(makeSubscription({ status: 'active' }))).toBe('tier1')
    expect(planFromSubscription(makeSubscription({ status: 'trialing' }))).toBe('tier1')
    expect(planFromSubscription(makeSubscription({ status: 'past_due' }))).toBe('tier1')
  })

  it('falls back to free once the subscription stops holding a plan', () => {
    for (const status of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'] as const) {
      expect(planFromSubscription(makeSubscription({ status }))).toBe('free')
    }
  })

  it('takes the highest plan among the items', () => {
    expect(planFromSubscription(makeSubscription({ lookupKeys: ['tier1_monthly', 'tier2_monthly'] }))).toBe('tier2')
  })

  it('is free when no item is a known plan', () => {
    expect(planFromSubscription(makeSubscription({ lookupKeys: [null] }))).toBe('free')
  })
})

describe('pickSubscription', () => {
  it('prefers the highest plan, then the newest', () => {
    const olderTier2 = makeSubscription({ id: 'sub_t2', lookupKeys: ['tier2_monthly'], created: 1 })
    const newerTier1 = makeSubscription({ id: 'sub_t1', lookupKeys: ['tier1_monthly'], created: 2 })
    const newestTier1 = makeSubscription({ id: 'sub_t1b', lookupKeys: ['tier1_monthly'], created: 3 })
    expect(pickSubscription([newerTier1, olderTier2])?.id).toBe('sub_t2')
    expect(pickSubscription([newerTier1, newestTier1])?.id).toBe('sub_t1b')
  })

  it('takes the newest when none holds a plan, and null for none', () => {
    const a = makeSubscription({ id: 'sub_a', status: 'canceled', created: 1 })
    const b = makeSubscription({ id: 'sub_b', status: 'canceled', created: 2 })
    expect(pickSubscription([a, b])?.id).toBe('sub_b')
    expect(pickSubscription([])).toBeNull()
  })
})

describe('getStatus', () => {
  it('syncs from Stripe when the webhook has not landed yet', async () => {
    vi.mocked(userService.getOrCreateUser).mockResolvedValue(makeUser({ billing: { customerId: 'cus_1' } }))
    stripeMock.subscriptions.list.mockResolvedValue({ data: [makeSubscription({ lookupKeys: ['tier1_monthly'] })] })
    vi.mocked(userRepository.findByStripeCustomerId).mockResolvedValue(makeUser({ plan: 'tier1', billing: { customerId: 'cus_1', subscriptionId: 'sub_1', status: 'active' } }))
    const status = await billingService.getStatus('user_1')
    expect(stripeMock.subscriptions.list).toHaveBeenCalledWith({ customer: 'cus_1', status: 'all', limit: 20 })
    expect(userRepository.syncBilling).toHaveBeenCalledWith('cus_1', expect.objectContaining({ plan: 'tier1' }))
    expect(status).toMatchObject({ plan: 'tier1', status: 'active', canManageBilling: true })
  })

  it('shows the stored plan when Stripe cannot be reached', async () => {
    vi.mocked(userService.getOrCreateUser).mockResolvedValue(makeUser({ plan: 'tier1', billing: { customerId: 'cus_1', status: 'active' } }))
    stripeMock.subscriptions.list.mockRejectedValue(new Error('stripe down'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect((await billingService.getStatus('user_1')).plan).toBe('tier1')
    error.mockRestore()
  })

  it('does not call Stripe for a user who never checked out', async () => {
    await billingService.getStatus('user_1')
    expect(stripeMock.subscriptions.list).not.toHaveBeenCalled()
  })

  it('drops the plan when every subscription has ended, even if a newer one than the stored one ended too', async () => {
    const user = makeUser({ plan: 'tier1', billing: { customerId: 'cus_1', subscriptionId: 'sub_a', status: 'active' } })
    vi.mocked(userService.getOrCreateUser).mockResolvedValue(user)
    vi.mocked(userRepository.findByStripeCustomerId).mockResolvedValue(user)
    stripeMock.subscriptions.list.mockResolvedValue({ data: [
      makeSubscription({ id: 'sub_b', status: 'canceled', created: 2 }),
      makeSubscription({ id: 'sub_a', status: 'canceled', created: 1 }),
    ] })
    await billingService.getStatus('user_1')
    expect(userRepository.syncBilling).toHaveBeenCalledWith('cus_1', expect.objectContaining({ plan: 'free', billing: expect.objectContaining({ subscriptionId: 'sub_a' }) }))
  })
})

describe('createCheckoutSession', () => {
  const request = { clerkId: 'user_1', plan: 'tier1' as const, interval: 'monthly' as const, returnUrl: 'http://localhost:3000/' }

  beforeEach(() => {
    stripeMock.prices.list.mockResolvedValue({ data: [{ id: 'price_tier1' }] })
    stripeMock.customers.create.mockResolvedValue({ id: 'cus_new' })
    vi.mocked(userRepository.linkStripeCustomer).mockResolvedValue('cus_new')
    stripeMock.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs_test' })
  })

  it('creates a customer once, then a subscription Checkout for the looked-up price', async () => {
    const url = await billingService.createCheckoutSession(request)
    expect(url).toBe('https://checkout.stripe.com/c/pay/cs_test')
    expect(stripeMock.prices.list).toHaveBeenCalledWith(expect.objectContaining({ lookup_keys: ['tier1_monthly'], active: true }))
    expect(stripeMock.customers.create).toHaveBeenCalledWith({ metadata: { clerkId: 'user_1' }, email: 'ada@example.com', name: 'Ada' })
    expect(stripeMock.customers.del).not.toHaveBeenCalled()
    expect(userRepository.linkStripeCustomer).toHaveBeenCalledWith('user_1', 'cus_new')
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'subscription',
      customer: 'cus_new',
      client_reference_id: 'user_1',
      line_items: [{ price: 'price_tier1', quantity: 1 }],
      subscription_data: { metadata: { clerkId: 'user_1' } },
      success_url: 'http://localhost:3000/?billing=success',
      cancel_url: 'http://localhost:3000/?billing=cancel',
    }))
  })

  it('deletes its own customer when a concurrent checkout linked another first', async () => {
    vi.mocked(userRepository.linkStripeCustomer).mockResolvedValue('cus_winner')
    stripeMock.customers.del.mockResolvedValue({ id: 'cus_new', deleted: true })
    await billingService.createCheckoutSession(request)
    expect(stripeMock.customers.del).toHaveBeenCalledWith('cus_new')
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_winner' }))
  })

  it('creates the customer without an email when Clerk has none', async () => {
    vi.mocked(userService.getPrimaryEmail).mockResolvedValue(null)
    await billingService.createCheckoutSession(request)
    expect(stripeMock.customers.create).toHaveBeenCalledWith({ metadata: { clerkId: 'user_1' }, name: 'Ada' })
  })

  it('fills in the email on a linked customer that has none, and leaves one that has an email alone', async () => {
    vi.mocked(userService.getOrCreateUser).mockResolvedValue(makeUser({ billing: { customerId: 'cus_existing' } }))
    stripeMock.customers.retrieve.mockResolvedValueOnce({ id: 'cus_existing', email: null })
    await billingService.createCheckoutSession(request)
    expect(stripeMock.customers.update).toHaveBeenCalledWith('cus_existing', { email: 'ada@example.com' })

    stripeMock.customers.update.mockClear()
    stripeMock.customers.retrieve.mockResolvedValueOnce({ id: 'cus_existing', email: 'changed-in-portal@example.com' })
    await billingService.createCheckoutSession(request)
    expect(stripeMock.customers.update).not.toHaveBeenCalled()
  })

  it('replaces a customer that was deleted in Stripe', async () => {
    vi.mocked(userService.getOrCreateUser).mockResolvedValue(makeUser({ billing: { customerId: 'cus_deleted' } }))
    stripeMock.customers.retrieve.mockResolvedValue({ id: 'cus_deleted', deleted: true })
    vi.mocked(userRepository.replaceStripeCustomer).mockResolvedValue('cus_new')
    await billingService.createCheckoutSession(request)
    expect(userRepository.replaceStripeCustomer).toHaveBeenCalledWith('user_1', 'cus_deleted', 'cus_new')
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_new' }))
  })

  it('reuses the linked customer', async () => {
    vi.mocked(userService.getOrCreateUser).mockResolvedValue(makeUser({ billing: { customerId: 'cus_existing', status: 'canceled' } }))
    stripeMock.customers.retrieve.mockResolvedValue({ id: 'cus_existing', email: 'ada@example.com' })
    await billingService.createCheckoutSession(request)
    expect(stripeMock.customers.create).not.toHaveBeenCalled()
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_existing' }))
  })

  describe('for a subscriber', () => {
    const subscriber = makeUser({ plan: 'tier1', billing: { customerId: 'cus_1', subscriptionId: 'sub_1', status: 'active' } })
    const upgrade = { ...request, plan: 'tier2' as const }
    const subscription = (cancelAtPeriodEnd = false): unknown => ({
      id: 'sub_1',
      cancel_at_period_end: cancelAtPeriodEnd,
      items: { data: [{ id: 'si_1', price: { id: 'price_tier1' } }] },
    })

    beforeEach(() => {
      vi.mocked(userService.getOrCreateUser).mockResolvedValue(subscriber)
      stripeMock.prices.list.mockResolvedValue({ data: [{ id: 'price_tier2' }] })
      stripeMock.subscriptions.retrieve.mockResolvedValue(subscription())
      stripeMock.billingPortal.configurations.list.mockResolvedValue({ data: [{ id: 'bpc_app', metadata: { app: 'fractaleyez' } }] })
      stripeMock.billingPortal.sessions.create.mockResolvedValue({ url: 'https://billing.stripe.com/p/session/change' })
    })

    it('opens the portal confirm page for the new plan instead of a second Checkout', async () => {
      const url = await new BillingService().createCheckoutSession(upgrade)
      expect(url).toBe('https://billing.stripe.com/p/session/change')
      expect(stripeMock.prices.list).toHaveBeenCalledWith(expect.objectContaining({ lookup_keys: ['tier2_monthly'] }))
      expect(stripeMock.subscriptions.retrieve).toHaveBeenCalledWith('sub_1')
      expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith({
        customer: 'cus_1',
        return_url: 'http://localhost:3000/',
        configuration: 'bpc_app',
        flow_data: {
          type: 'subscription_update_confirm',
          subscription_update_confirm: { subscription: 'sub_1', items: [{ id: 'si_1', price: 'price_tier2', quantity: 1 }] },
          after_completion: { type: 'redirect', redirect: { return_url: 'http://localhost:3000/?billing=success' } },
        },
      })
      expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled()
      expect(stripeMock.customers.create).not.toHaveBeenCalled()
    })

    it('treats a subscription Stripe knows about before its webhook landed the same way', async () => {
      vi.mocked(userService.getOrCreateUser).mockResolvedValue(makeUser({ billing: { customerId: 'cus_1' } }))
      stripeMock.subscriptions.list.mockResolvedValue({ data: [makeSubscription()] })
      vi.mocked(userRepository.findByStripeCustomerId).mockResolvedValue(subscriber)
      await expect(new BillingService().createCheckoutSession(upgrade)).resolves.toBe('https://billing.stripe.com/p/session/change')
      expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled()
    })

    it('refuses the plan the subscription already has', async () => {
      stripeMock.prices.list.mockResolvedValue({ data: [{ id: 'price_tier1' }] })
      await expect(new BillingService().createCheckoutSession(request)).rejects.toMatchObject({ code: 'already_subscribed' })
      expect(stripeMock.billingPortal.sessions.create).not.toHaveBeenCalled()
      expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled()
    })

    it('opens the portal home for a subscription set to cancel, where it can be renewed first', async () => {
      stripeMock.subscriptions.retrieve.mockResolvedValue(subscription(true))
      await new BillingService().createCheckoutSession(upgrade)
      expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith({ customer: 'cus_1', return_url: 'http://localhost:3000/', configuration: 'bpc_app' })
    })
  })

  describe('open sessions', () => {
    const now = (): number => Math.floor(Date.now() / 1000)
    const openSession = (overrides: { id?: string; price?: string; successUrl?: string; expiresAt?: number; mode?: string } = {}): unknown => ({
      id: overrides.id ?? 'cs_open',
      mode: overrides.mode ?? 'subscription',
      url: `https://checkout.stripe.com/c/pay/${overrides.id ?? 'cs_open'}`,
      success_url: overrides.successUrl ?? 'http://localhost:3000/?billing=success',
      expires_at: overrides.expiresAt ?? now() + 50 * 60,
      line_items: { data: [{ price: { id: overrides.price ?? 'price_tier1' } }] },
    })

    it('creates a session that expires in an hour when none is open', async () => {
      await billingService.createCheckoutSession(request)
      expect(stripeMock.checkout.sessions.list).toHaveBeenCalledWith({ customer: 'cus_new', status: 'open', limit: 10, expand: ['data.line_items'] })
      const params = stripeMock.checkout.sessions.create.mock.calls[0]?.[0] as { expires_at: number }
      expect(params.expires_at).toBeGreaterThanOrEqual(now() + CHECKOUT_LIFETIME_S - 5)
      expect(params.expires_at).toBeLessThanOrEqual(now() + CHECKOUT_LIFETIME_S)
      expect(stripeMock.checkout.sessions.expire).not.toHaveBeenCalled()
    })

    it('reuses an open session for the same price, so a second tab pays the same one', async () => {
      stripeMock.checkout.sessions.list.mockResolvedValue({ data: [openSession({ id: 'cs_tab1' })] })
      expect(await billingService.createCheckoutSession(request)).toBe('https://checkout.stripe.com/c/pay/cs_tab1')
      expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled()
      expect(stripeMock.checkout.sessions.expire).not.toHaveBeenCalled()
    })

    it('expires an open session for another plan and creates a new one', async () => {
      stripeMock.checkout.sessions.list.mockResolvedValue({ data: [openSession({ id: 'cs_tier2', price: 'price_tier2' })] })
      expect(await billingService.createCheckoutSession(request)).toBe('https://checkout.stripe.com/c/pay/cs_test')
      expect(stripeMock.checkout.sessions.expire).toHaveBeenCalledWith('cs_tier2')
      expect(stripeMock.checkout.sessions.create).toHaveBeenCalled()
    })

    it('keeps one matching session and expires the rest', async () => {
      stripeMock.checkout.sessions.list.mockResolvedValue({ data: [
        openSession({ id: 'cs_a' }),
        openSession({ id: 'cs_b' }),
        openSession({ id: 'cs_other_origin', successUrl: 'https://www.fractaleyez.com/?billing=success' }),
      ] })
      expect(await billingService.createCheckoutSession(request)).toBe('https://checkout.stripe.com/c/pay/cs_a')
      expect(stripeMock.checkout.sessions.expire.mock.calls.map((c) => c[0])).toEqual(['cs_b', 'cs_other_origin'])
    })

    it('replaces a matching session that is about to lapse', async () => {
      stripeMock.checkout.sessions.list.mockResolvedValue({ data: [openSession({ id: 'cs_old', expiresAt: now() + CHECKOUT_REUSE_MIN_LEFT_S - 60 })] })
      expect(await billingService.createCheckoutSession(request)).toBe('https://checkout.stripe.com/c/pay/cs_test')
      expect(stripeMock.checkout.sessions.expire).toHaveBeenCalledWith('cs_old')
    })

    it('leaves open sessions that are not subscriptions alone (a future pack purchase)', async () => {
      stripeMock.checkout.sessions.list.mockResolvedValue({ data: [openSession({ id: 'cs_pack', mode: 'payment', price: 'price_pack' })] })
      await billingService.createCheckoutSession(request)
      expect(stripeMock.checkout.sessions.expire).not.toHaveBeenCalled()
      expect(stripeMock.checkout.sessions.create).toHaveBeenCalled()
    })
  })

  it('reports a missing price instead of creating a session', async () => {
    stripeMock.prices.list.mockResolvedValue({ data: [] })
    await expect(billingService.createCheckoutSession(request)).rejects.toBeInstanceOf(BillingError)
    expect(stripeMock.customers.create).not.toHaveBeenCalled()
  })
})

describe('createPortalSession', () => {
  it('opens the portal for the linked customer with the configuration tagged for the app', async () => {
    const service = new BillingService()
    vi.mocked(userService.getOrCreateUser).mockResolvedValue(makeUser({ billing: { customerId: 'cus_1' } }))
    stripeMock.billingPortal.configurations.list.mockResolvedValue({
      data: [{ id: 'bpc_other', metadata: {} }, { id: 'bpc_app', metadata: { app: 'fractaleyez' } }],
    })
    stripeMock.billingPortal.sessions.create.mockResolvedValue({ url: 'https://billing.stripe.com/p/session/test' })
    const url = await service.createPortalSession('user_1', 'http://localhost:3000/')
    expect(url).toBe('https://billing.stripe.com/p/session/test')
    expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith({ customer: 'cus_1', return_url: 'http://localhost:3000/', configuration: 'bpc_app' })

    await service.createPortalSession('user_1', 'http://localhost:3000/')
    expect(stripeMock.billingPortal.configurations.list).toHaveBeenCalledTimes(1)
  })

  it('falls back to the dashboard default configuration when none is tagged', async () => {
    const service = new BillingService()
    vi.mocked(userService.getOrCreateUser).mockResolvedValue(makeUser({ billing: { customerId: 'cus_1' } }))
    stripeMock.billingPortal.configurations.list.mockResolvedValue({ data: [] })
    stripeMock.billingPortal.sessions.create.mockResolvedValue({ url: 'https://billing.stripe.com/p/session/test' })
    await service.createPortalSession('user_1', 'http://localhost:3000/')
    expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith({ customer: 'cus_1', return_url: 'http://localhost:3000/' })
  })

  it('refuses without a customer', async () => {
    await expect(billingService.createPortalSession('user_1', 'http://localhost:3000/')).rejects.toMatchObject({ code: 'no_customer' })
  })
})

describe('handleEvent', () => {
  const subscriptionEvent = (type: string, id = 'sub_1'): Stripe.Event =>
    ({ id: 'evt_1', type, data: { object: { id } } }) as unknown as Stripe.Event

  // The event's subscription only names the customer; the plan comes from all of that customer's subscriptions.
  const givenStripe = (eventSubscription: Stripe.Subscription, customerSubscriptions: Stripe.Subscription[] = [eventSubscription]): void => {
    stripeMock.subscriptions.retrieve.mockResolvedValue(eventSubscription)
    stripeMock.subscriptions.list.mockResolvedValue({ data: customerSubscriptions })
  }

  it('syncs the plan from what Stripe returns, not from the event payload', async () => {
    givenStripe(makeSubscription({ lookupKeys: ['tier2_monthly'], periodEnds: [1_800_000_000] }))
    vi.mocked(userRepository.findByStripeCustomerId).mockResolvedValue(makeUser({ billing: { customerId: 'cus_1' } }))
    await billingService.handleEvent(subscriptionEvent('customer.subscription.updated'))
    expect(stripeMock.subscriptions.retrieve).toHaveBeenCalledWith('sub_1')
    expect(stripeMock.subscriptions.list).toHaveBeenCalledWith({ customer: 'cus_1', status: 'all', limit: 20 })
    expect(userRepository.syncBilling).toHaveBeenCalledWith('cus_1', {
      plan: 'tier2',
      billing: { subscriptionId: 'sub_1', status: 'active', cancelAtPeriodEnd: false, currentPeriodEnd: new Date(1_800_000_000_000) },
    })
  })

  it('drops the plan to free when the subscription is deleted', async () => {
    givenStripe(makeSubscription({ status: 'canceled' }))
    vi.mocked(userRepository.findByStripeCustomerId).mockResolvedValue(makeUser({ plan: 'tier1', billing: { customerId: 'cus_1', subscriptionId: 'sub_1', status: 'active' } }))
    await billingService.handleEvent(subscriptionEvent('customer.subscription.deleted'))
    expect(userRepository.syncBilling).toHaveBeenCalledWith('cus_1', expect.objectContaining({ plan: 'free' }))
  })

  it('keeps the newer active subscription when an old one ends', async () => {
    const oldEnded = makeSubscription({ id: 'sub_old', status: 'canceled', created: 1 })
    const newer = makeSubscription({ id: 'sub_new', lookupKeys: ['tier2_monthly'], created: 2 })
    givenStripe(oldEnded, [oldEnded, newer])
    vi.mocked(userRepository.findByStripeCustomerId).mockResolvedValue(makeUser({ plan: 'tier2', billing: { customerId: 'cus_1', subscriptionId: 'sub_new', status: 'active' } }))
    await billingService.handleEvent(subscriptionEvent('customer.subscription.deleted', 'sub_old'))
    expect(userRepository.syncBilling).toHaveBeenCalledWith('cus_1', expect.objectContaining({ plan: 'tier2', billing: expect.objectContaining({ subscriptionId: 'sub_new' }) }))
  })

  it('does not downgrade when a lower plan updates while a higher one is live', async () => {
    const lower = makeSubscription({ id: 'sub_t1', lookupKeys: ['tier1_monthly'], created: 2 })
    const higher = makeSubscription({ id: 'sub_t2', lookupKeys: ['tier2_monthly'], created: 1 })
    givenStripe(lower, [lower, higher])
    vi.mocked(userRepository.findByStripeCustomerId).mockResolvedValue(makeUser({ plan: 'tier2', billing: { customerId: 'cus_1', subscriptionId: 'sub_t2', status: 'active' } }))
    await billingService.handleEvent(subscriptionEvent('customer.subscription.updated', 'sub_t1'))
    expect(userRepository.syncBilling).toHaveBeenCalledWith('cus_1', expect.objectContaining({ plan: 'tier2' }))
  })

  it('syncs the subscription a completed subscription Checkout created', async () => {
    givenStripe(makeSubscription())
    vi.mocked(userRepository.findByStripeCustomerId).mockResolvedValue(makeUser({ billing: { customerId: 'cus_1' } }))
    await billingService.handleEvent({
      id: 'evt_2', type: 'checkout.session.completed', data: { object: { mode: 'subscription', subscription: 'sub_1' } },
    } as unknown as Stripe.Event)
    expect(userRepository.syncBilling).toHaveBeenCalledWith('cus_1', expect.objectContaining({ plan: 'tier1' }))
  })

  it('ignores one-time payment Checkouts and unrelated events', async () => {
    await billingService.handleEvent({ id: 'evt_3', type: 'checkout.session.completed', data: { object: { mode: 'payment' } } } as unknown as Stripe.Event)
    await billingService.handleEvent({ id: 'evt_4', type: 'invoice.paid', data: { object: {} } } as unknown as Stripe.Event)
    expect(stripeMock.subscriptions.retrieve).not.toHaveBeenCalled()
  })

  it('links the customer from the subscription metadata when no user has it yet', async () => {
    givenStripe(makeSubscription({ metadata: { clerkId: 'user_1' } }))
    vi.mocked(userRepository.findByStripeCustomerId)
      .mockResolvedValueOnce(null)
      .mockResolvedValue(makeUser({ billing: { customerId: 'cus_1' } }))
    vi.mocked(userRepository.linkStripeCustomer).mockResolvedValue('cus_1')
    await billingService.handleEvent(subscriptionEvent('customer.subscription.created'))
    expect(userRepository.linkStripeCustomer).toHaveBeenCalledWith('user_1', 'cus_1')
    expect(userRepository.syncBilling).toHaveBeenCalledWith('cus_1', expect.objectContaining({ plan: 'tier1' }))
  })

  it('does not bring back a deleted account for the subscription its deletion canceled', async () => {
    givenStripe(makeSubscription({ status: 'canceled', metadata: { clerkId: 'user_1' } }))
    vi.mocked(userRepository.findByStripeCustomerId).mockResolvedValue(null)
    vi.mocked(userRepository.findByClerkId).mockResolvedValue(null)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await billingService.handleEvent(subscriptionEvent('customer.subscription.deleted'))
    expect(userService.getOrCreateUser).not.toHaveBeenCalled()
    expect(userRepository.linkStripeCustomer).not.toHaveBeenCalled()
    expect(userRepository.syncBilling).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('skips a subscription no user can be matched to', async () => {
    givenStripe(makeSubscription())
    vi.mocked(userRepository.findByStripeCustomerId).mockResolvedValue(null)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await billingService.handleEvent(subscriptionEvent('customer.subscription.updated'))
    expect(userRepository.syncBilling).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('cancelSubscriptionsNow', () => {
  it('cancels every live subscription of the customer at once and leaves ended ones and the customer alone', async () => {
    stripeMock.subscriptions.list.mockResolvedValue({ data: [
      makeSubscription({ id: 'sub_active' }),
      makeSubscription({ id: 'sub_past_due', status: 'past_due' }),
      makeSubscription({ id: 'sub_trial', status: 'trialing', cancelAtPeriodEnd: true }),
      makeSubscription({ id: 'sub_done', status: 'canceled' }),
      makeSubscription({ id: 'sub_expired', status: 'incomplete_expired' }),
    ] })
    stripeMock.subscriptions.cancel.mockResolvedValue({})

    expect(await billingService.cancelSubscriptionsNow('cus_1')).toEqual(['sub_active', 'sub_past_due', 'sub_trial'])
    expect(stripeMock.subscriptions.list).toHaveBeenCalledWith({ customer: 'cus_1', status: 'all', limit: 100 })
    expect(stripeMock.subscriptions.cancel.mock.calls).toEqual([['sub_active'], ['sub_past_due'], ['sub_trial']])
    expect(stripeMock.customers.del).not.toHaveBeenCalled()
  })

  it('cancels nothing when every subscription already ended', async () => {
    stripeMock.subscriptions.list.mockResolvedValue({ data: [makeSubscription({ status: 'canceled' })] })
    expect(await billingService.cancelSubscriptionsNow('cus_1')).toEqual([])
    expect(stripeMock.subscriptions.cancel).not.toHaveBeenCalled()
  })
})

describe('when Stripe is not configured', () => {
  beforeEach(() => {
    vi.mocked(isStripeConfigured).mockReturnValue(false)
  })

  it('reports billing unavailable without calling Stripe', async () => {
    vi.mocked(userService.getOrCreateUser).mockResolvedValue(makeUser({ billing: { customerId: 'cus_1' } }))
    const status = await billingService.getStatus('user_1')
    expect(status).toMatchObject({ plan: 'free', available: false, canManageBilling: false })
    expect(stripeMock.subscriptions.list).not.toHaveBeenCalled()
  })

  it('refuses checkout and the portal as unavailable', async () => {
    await expect(billingService.createCheckoutSession({ clerkId: 'user_1', plan: 'tier1', interval: 'monthly', returnUrl: 'http://localhost:3000/' }))
      .rejects.toMatchObject({ code: 'unavailable' })
    await expect(billingService.createPortalSession('user_1', 'http://localhost:3000/')).rejects.toMatchObject({ code: 'unavailable' })
  })
})
