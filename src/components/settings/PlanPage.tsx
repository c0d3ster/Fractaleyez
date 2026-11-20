import React, { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import classNames from 'classnames'
import { useAuth } from '@clerk/clerk-react'
import './PlanPage.css'

import {
  BillingStatus,
  PaidPlanId,
  PLAN_LABELS,
  PLAN_ORDER,
  PLAN_PERKS,
  PLAN_PRICE_LABELS,
  PlanId,
} from '../../config/plans.config'

type BillingAction = { action: 'checkout'; plan: PaidPlanId } | { action: 'portal' }

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

const describeStatus = ({ plan, status, currentPeriodEnd, cancelAtPeriodEnd }: BillingStatus): string | null => {
  if (plan === 'free') return null
  if (status === 'past_due') return 'Your last payment failed. Update your card to keep your plan.'
  if (!currentPeriodEnd) return null
  return cancelAtPeriodEnd ? `Ends ${formatDate(currentPeriodEnd)}` : `Renews ${formatDate(currentPeriodEnd)}`
}

const errorMessageOf = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    const message = (err.response?.data as { error?: unknown } | undefined)?.error
    if (typeof message === 'string') return message
  }
  return 'Something went wrong. Try again in a moment.'
}

// A subscriber's button switches the plan on their subscription; a free user's starts one.
const actionLabel = (current: PlanId, target: PaidPlanId): string => {
  if (current === 'free') return `Go ${PLAN_LABELS[target]}`
  return PLAN_ORDER.indexOf(target) > PLAN_ORDER.indexOf(current) ? `Upgrade to ${PLAN_LABELS[target]}` : `Switch to ${PLAN_LABELS[target]}`
}

const isSameAction = (a: BillingAction | null, b: BillingAction): boolean =>
  a !== null && a.action === b.action && (a.action === 'portal' || (b.action === 'checkout' && a.plan === b.plan))

// Rendered as a custom tab inside Clerk's UserButton "Manage account" modal (see TopBar), so the viewer is signed in.
// Subscribing redirects to Stripe Checkout, and a subscriber's plan buttons open the portal's confirm page for that plan.
// Cancelling, the card and invoices go through the full Stripe Customer Portal (Manage billing).
export const PlanPage = (): React.ReactElement => {
  const { getToken } = useAuth()
  const [billing, setBilling] = useState<BillingStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<BillingAction | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<void> => {
      try {
        const token = await getToken()
        if (!token) return
        const { data } = await axios.get<BillingStatus>('/api/billing', { headers: { Authorization: `Bearer ${token}` } })
        if (!cancelled) setBilling(data)
      } catch (err) {
        if (!cancelled) setError(errorMessageOf(err))
      }
    }
    void load()
    return (): void => {
      cancelled = true
    }
  }, [getToken])

  const run = useCallback(async (action: BillingAction): Promise<void> => {
    setPending(action)
    setError(null)
    try {
      const token = await getToken()
      if (!token) throw new Error('Not signed in')
      const { data } = await axios.post<{ url: string }>('/api/billing', action, { headers: { Authorization: `Bearer ${token}` } })
      window.location.assign(data.url)
    } catch (err) {
      setError(errorMessageOf(err))
      setPending(null)
    }
  }, [getToken])

  if (!billing) {
    return (
      <div className='plan-page'>
        {error ? <div className='plan-page__error'>{error}</div> : <div className='plan-page__hint'>Loading your plan...</div>}
      </div>
    )
  }

  const statusLine = describeStatus(billing)
  const isSubscribed = billing.plan !== 'free'
  const portal: BillingAction = { action: 'portal' }

  const renderAction = (plan: PlanId): React.ReactElement | null => {
    if (plan === billing.plan || plan === 'free' || !billing.available) return null
    const checkout: BillingAction = { action: 'checkout', plan }
    return (
      <button type='button' className='plan-page__button' disabled={pending !== null} onClick={() => void run(checkout)}>
        {isSameAction(pending, checkout) ? (isSubscribed ? 'Opening...' : 'Opening checkout...') : actionLabel(billing.plan, plan)}
      </button>
    )
  }

  return (
    <div className='plan-page'>
      <div className='plan-page__section-title'>Plan</div>
      <div className='plan-page__current'>
        <span className='plan-page__current-name'>{PLAN_LABELS[billing.plan]}</span>
        {statusLine ? <span className='plan-page__hint'>{statusLine}</span> : null}
      </div>

      <div className='plan-page__tiers'>
        {PLAN_ORDER.map((plan) => (
          <div key={plan} className={classNames('plan-page__tier', { 'plan-page__tier--current': plan === billing.plan })}>
            <div className='plan-page__tier-header'>
              <span className='plan-page__tier-name'>{PLAN_LABELS[plan]}</span>
              <span className='plan-page__tier-price'>{PLAN_PRICE_LABELS[plan]}</span>
            </div>
            <ul className='plan-page__perks'>
              {PLAN_PERKS[plan].map((perk) => <li key={perk}>{perk}</li>)}
            </ul>
            {plan === billing.plan ? <span className='plan-page__badge'>Current plan</span> : renderAction(plan)}
          </div>
        ))}
      </div>

      {billing.available ? null : <div className='plan-page__hint'>Paid plans are coming soon.</div>}

      {billing.canManageBilling ? (
        <div className='plan-page__row'>
          <button type='button' className='plan-page__button plan-page__button--secondary' disabled={pending !== null} onClick={() => void run(portal)}>
            {isSameAction(pending, portal) ? 'Opening billing...' : 'Manage billing'}
          </button>
          <span className='plan-page__hint'>
            {isSubscribed ? 'Cancel, update your card or see invoices.' : 'Update your card or see past invoices.'}
          </span>
        </div>
      ) : null}

      {error ? <div className='plan-page__error'>{error}</div> : null}

      <div className='plan-page__legal'>
        <a href='/terms' target='_blank' rel='noopener'>Terms</a>
        <a href='/privacy' target='_blank' rel='noopener'>Privacy</a>
      </div>
    </div>
  )
}
