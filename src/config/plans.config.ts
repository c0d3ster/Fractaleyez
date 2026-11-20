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
  tier1: ['10 saved presets', '15 particle uploads', 'Private and public packs', 'Every built-in premium pack', 'Custom fractal path'],
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

/** Mirrors server/services/entitlements.ts. null means unlimited. */
export type Quota = number | null
export type QuotaKey = 'savedPresets' | 'particleUploads' | 'privatePacks' | 'publicPacks'

/** `/api/me`'s `entitlements`: the server enforces these on every create, the client only draws the locks from them. */
export type Entitlements = {
  plan: PlanId
  quotas: Record<QuotaKey, Quota>
  features: {
    builtInPremiumPacks: boolean
    allPacks: boolean
    customFractalPath: boolean
  }
}

/** `/api/me`'s `usage`: what the user has made, counted against the quotas. */
export type Usage = Record<QuotaKey, number>

/** How the client words each quota in a lock or an upgrade prompt. */
export const QUOTA_LABELS: Record<QuotaKey, string> = {
  savedPresets: 'saved presets',
  particleUploads: 'particle uploads',
  privatePacks: 'packs',
  publicPacks: 'public packs',
}

/**
 * Room for one more. Unknown (not loaded yet, or signed out) counts as room: the server has the final say, and a refused
 * create still lands on the upgrade prompt through its 403.
 */
export const hasRoomFor = (entitlements: Entitlements | null, usage: Usage | null, quota: QuotaKey): boolean => {
  const limit = entitlements?.quotas[quota]
  if (limit === undefined || limit === null || !usage) return true
  return usage[quota] < limit
}

/** The next plan up that has room for `quota`, or null on the top plan. */
export const nextPlanFor = (plan: PlanId): PaidPlanId | null => {
  if (plan === 'free') return 'tier1'
  if (plan === 'tier1') return 'tier2'
  return null
}

/** The body of a 403 a create was refused with because of the plan (server/services/EntitlementService.ts's QuotaExceededError). */
export type QuotaExceeded = { error: string; code: 'quota_exceeded'; quota: QuotaKey; limit: number; plan: PlanId }

export const isQuotaExceeded = (value: unknown): value is QuotaExceeded =>
  typeof value === 'object' && value !== null && (value as { code?: unknown }).code === 'quota_exceeded'

export const quotaMessage = ({ quota, limit, plan }: Pick<QuotaExceeded, 'quota' | 'limit' | 'plan'>): string =>
  limit === 0
    ? `${PLAN_LABELS[plan]} doesn't include ${QUOTA_LABELS[quota]}.`
    : `${PLAN_LABELS[plan]} includes ${limit} ${QUOTA_LABELS[quota]}, and you've used them all.`

/** The body of a 403 for a save from a premium preview (server/services/EntitlementService.ts's PremiumPreviewError). */
export type PremiumPreviewRefusal = { error: string; code: 'premium_preview' }

export const isPremiumPreviewRefusal = (value: unknown): value is PremiumPreviewRefusal =>
  typeof value === 'object' && value !== null && (value as { code?: unknown }).code === 'premium_preview'

export const PREMIUM_PREVIEW_MESSAGE = 'Premium presets are preview only. Lucid and Third Eye include every built-in premium pack, ready to tweak and save.'
