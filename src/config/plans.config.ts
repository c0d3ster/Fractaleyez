/** Mirrors server/models/User.ts's PLAN_IDS. Stored ids are neutral; these are the names people see. */
export type PlanId = 'free' | 'tier1' | 'tier2'
export type PaidPlanId = Exclude<PlanId, 'free'>

export const PLAN_ORDER: readonly PlanId[] = ['free', 'tier1', 'tier2']

export const PLAN_LABELS: Record<PlanId, string> = {
  free: 'Dream',
  tier1: 'Lucid',
  tier2: 'Third Eye',
}

/** Display only: Checkout charges whatever the Stripe price says, so keep these in step with the dashboard. */
export const PLAN_PRICE_LABELS: Record<PlanId, string> = {
  free: 'Free',
  tier1: '$5/mo',
  tier2: '$20/mo',
}

/** The tier table in docs/research/monetization.md, in words. */
export const PLAN_PERKS: Record<PlanId, readonly string[]> = {
  free: ['3 saved presets', '3 particle uploads', '1 private pack'],
  tier1: ['10 saved presets', '10 particle uploads', 'Private and public packs', 'Every built-in premium pack', 'Custom fractal path'],
  tier2: ['Unlimited presets and uploads', 'Unlimited packs', 'Every pack included', 'Custom fractal path'],
}

/** GET /api/billing (server/services/BillingService.ts's BillingStatus). */
export type BillingStatus = {
  plan: PlanId
  status: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  canManageBilling: boolean
  /** False while Stripe isn't set up for this deployment: the tiers show without buttons. */
  available: boolean
}
