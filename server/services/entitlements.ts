import { PlanId } from '../models/User.js'

/** null means unlimited. */
export type Quota = number | null

export type Entitlements = {
  plan: PlanId
  quotas: {
    savedPresets: Quota
    particleUploads: Quota
    privatePacks: Quota
    publicPacks: Quota
  }
  features: {
    /** Built-in premium packs (admin-made and the `@user` builds). */
    builtInPremiumPacks: boolean
    /** Every pack, creator packs included (see docs/research/monetization.md, "Open, later"). */
    allPacks: boolean
    customFractalPath: boolean
  }
}

type PlanEntitlements = Omit<Entitlements, 'plan'>

// The tier table in docs/research/monetization.md. Placeholders until real usage says otherwise. Not enforced yet (phase 2).
const PLAN_ENTITLEMENTS: Record<PlanId, PlanEntitlements> = {
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

export const getEntitlements = (plan: PlanId): Entitlements => ({ plan, ...PLAN_ENTITLEMENTS[plan] })
