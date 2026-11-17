import { PlanId } from '../models/User.js'
import type { PackOrigin } from '../models/Pack.js'

/** null means unlimited. */
export type Quota = number | null

export const QUOTA_KEYS = ['savedPresets', 'particleUploads', 'privatePacks', 'publicPacks'] as const
export type QuotaKey = typeof QUOTA_KEYS[number]

/** What the user has made so far, counted against `quotas`. */
export type Usage = Record<QuotaKey, number>

export type Entitlements = {
  plan: PlanId
  quotas: Record<QuotaKey, Quota>
  features: {
    /** Built-in premium packs (admin-made and the `@user` builds). */
    builtInPremiumPacks: boolean
    /** Every pack, creator packs included (see docs/research/monetization.md, "Open, later"). */
    allPacks: boolean
    customFractalPath: boolean
  }
}

type PlanEntitlements = Omit<Entitlements, 'plan'>

/**
 * The tier table in docs/research/monetization.md, and the one place its numbers live: the server enforces these
 * (EntitlementService) and `/api/me` hands the same object to the client for its locks and upgrade prompts.
 * The numbers are placeholders until real usage says otherwise.
 */
export const PLAN_ENTITLEMENTS: Record<PlanId, PlanEntitlements> = {
  free: {
    quotas: { savedPresets: 3, particleUploads: 3, privatePacks: 1, publicPacks: 0 },
    features: { builtInPremiumPacks: false, allPacks: false, customFractalPath: false },
  },
  tier1: {
    quotas: { savedPresets: 10, particleUploads: 10, privatePacks: 3, publicPacks: 3 },
    features: { builtInPremiumPacks: true, allPacks: false, customFractalPath: true },
  },
  tier2: {
    quotas: { savedPresets: null, particleUploads: null, privatePacks: null, publicPacks: null },
    features: { builtInPremiumPacks: true, allPacks: true, customFractalPath: true },
  },
}

// The owner's account makes the built-in content, so it is never held to a plan.
const ADMIN_ENTITLEMENTS: PlanEntitlements = {
  quotas: { savedPresets: null, particleUploads: null, privatePacks: null, publicPacks: null },
  features: { builtInPremiumPacks: true, allPacks: true, customFractalPath: true },
}

type EntitlementOptions = { isAdmin?: boolean }

export const getEntitlements = (plan: PlanId, { isAdmin = false }: EntitlementOptions = {}): Entitlements => ({
  plan,
  ...(isAdmin ? ADMIN_ENTITLEMENTS : PLAN_ENTITLEMENTS[plan]),
})

/** Room for one more. Over the limit (after a downgrade) is not an error: existing content stays, only new content is refused. */
export const hasRoomFor = (quota: Quota, used: number): boolean => quota === null || used < quota

type PackAccess = { isPremium: boolean; origin?: PackOrigin; userId: string }

/**
 * Whether a viewer with these entitlements may use a pack's presets. Signed out (null) only gets free packs. Tier inclusion
 * follows `origin` (monetization doc, "Pack origin"): packs stored before it existed were all owner-made, so they read as builtIn.
 */
export const canUsePack = (pack: PackAccess, viewerId: string | null, entitlements: Entitlements | null): boolean => {
  if (!pack.isPremium) return true
  if (!viewerId || !entitlements) return false
  if (pack.userId === viewerId) return true
  if (entitlements.features.allPacks) return true
  return entitlements.features.builtInPremiumPacks && (pack.origin ?? 'builtIn') === 'builtIn'
}
