import { userRepository } from '../repositories/UserRepository.js'
import { presetRepository } from '../repositories/PresetRepository.js'
import { packRepository } from '../repositories/PackRepository.js'
import { uploadRepository } from '../repositories/UploadRepository.js'
import { Entitlements, QUOTA_KEYS, QuotaKey, Usage, getEntitlements, hasRoomFor } from './entitlements.js'

export type Viewer = {
  isAdmin: boolean
  entitlements: Entitlements
}

const QUOTA_NOUNS: Record<QuotaKey, string> = {
  savedPresets: 'saved presets',
  particleUploads: 'particle uploads',
  privatePacks: 'packs',
  publicPacks: 'public packs',
}

/** A create refused by the plan's quota. Handlers answer 403 with `toJSON()`, which the client turns into an upgrade prompt. */
export class QuotaExceededError extends Error {
  readonly status = 403
  readonly quota: QuotaKey
  readonly limit: number
  readonly plan: Entitlements['plan']

  constructor(quota: QuotaKey, limit: number, plan: Entitlements['plan']) {
    super(limit === 0
      ? `Your plan does not include ${QUOTA_NOUNS[quota]}`
      : `Your plan includes ${limit} ${QUOTA_NOUNS[quota]}. Upgrade to make more.`)
    this.name = 'QuotaExceededError'
    this.quota = quota
    this.limit = limit
    this.plan = plan
  }

  toJSON(): { error: string; code: 'quota_exceeded'; quota: QuotaKey; limit: number; plan: Entitlements['plan'] } {
    return { error: this.message, code: 'quota_exceeded', quota: this.quota, limit: this.limit, plan: this.plan }
  }
}

export const isQuotaExceededError = (err: unknown): err is QuotaExceededError => err instanceof QuotaExceededError

/**
 * Plan-derived access for one user. Reads the stored plan only (BillingService.reconcile keeps it in step with Stripe), so a
 * gate costs one user lookup and one count. Usage is counted from what exists, never stored, so it cannot drift.
 */
export class EntitlementService {
  /** A missing user document is a free, non-admin user; never lazy-creates one. */
  async forUser(clerkId: string): Promise<Viewer> {
    const user = await userRepository.findByClerkId(clerkId)
    const isAdmin = user?.isAdmin === true
    return { isAdmin, entitlements: getEntitlements(user?.plan ?? 'free', { isAdmin }) }
  }

  /** Signed out has no entitlements: free packs only, and no writes. */
  async forViewer(viewerId: string | null): Promise<Viewer | null> {
    return viewerId ? this.forUser(viewerId) : null
  }

  async getUsage(clerkId: string): Promise<Usage> {
    const [savedPresets, particleUploads, privatePacks, publicPacks] = await Promise.all(QUOTA_KEYS.map((quota) => this.count(clerkId, quota)))
    return { savedPresets: savedPresets ?? 0, particleUploads: particleUploads ?? 0, privatePacks: privatePacks ?? 0, publicPacks: publicPacks ?? 0 }
  }

  private count(clerkId: string, quota: QuotaKey): Promise<number> {
    switch (quota) {
      case 'savedPresets': return presetRepository.countByUserId(clerkId)
      case 'particleUploads': return uploadRepository.countByUserId(clerkId, 'sprite')
      case 'privatePacks': return packRepository.countByUserId(clerkId)
      // Every user pack is private until packs get a visibility (#19), so there are no public ones to count yet.
      case 'publicPacks': return Promise.resolve(0)
    }
  }

  /**
   * Throws QuotaExceededError when the user has no room for one more. Two creates racing past the check can land one over;
   * that is accepted (it is a soft business limit, and over-limit content is allowed anyway after a downgrade).
   */
  async assertRoomFor(clerkId: string, quota: QuotaKey, viewer?: Viewer): Promise<void> {
    const { entitlements } = viewer ?? await this.forUser(clerkId)
    const limit = entitlements.quotas[quota]
    if (limit === null) return
    const used = await this.count(clerkId, quota)
    if (!hasRoomFor(limit, used)) throw new QuotaExceededError(quota, limit, entitlements.plan)
  }
}

export const entitlementService = new EntitlementService()
