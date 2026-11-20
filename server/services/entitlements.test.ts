import { describe, it, expect } from 'vitest'
import { PLAN_ENTITLEMENTS, canUsePack, getEntitlements, hasRoomFor } from './entitlements.js'
import { PLAN_PERKS } from '../../src/config/plans.config'

describe('getEntitlements', () => {
  it('gives each plan its row of the tier table', () => {
    expect(getEntitlements('free').quotas).toEqual({ savedPresets: 3, particleUploads: 3, privatePacks: 1, publicPacks: 0 })
    expect(getEntitlements('tier1').quotas).toEqual({ savedPresets: 15, particleUploads: 15, privatePacks: 3, publicPacks: 3 })
    expect(Object.values(getEntitlements('tier2').quotas)).toEqual([null, null, null, null])
  })

  it('holds an admin to no plan, whatever is stored', () => {
    const admin = getEntitlements('free', { isAdmin: true })
    expect(admin.plan).toBe('free')
    expect(Object.values(admin.quotas)).toEqual([null, null, null, null])
    expect(admin.features.allPacks).toBe(true)
  })
})

describe('hasRoomFor', () => {
  it('allows below the limit, refuses at and over it, and never refuses unlimited', () => {
    expect(hasRoomFor(3, 2)).toBe(true)
    expect(hasRoomFor(3, 3)).toBe(false)
    expect(hasRoomFor(3, 7)).toBe(false)
    expect(hasRoomFor(0, 0)).toBe(false)
    expect(hasRoomFor(null, 1000)).toBe(true)
  })
})

describe('canUsePack', () => {
  const lucid = getEntitlements('tier1')
  it('opens free packs to everyone and premium ones to the owner, Lucid (built-in only) and Third Eye', () => {
    expect(canUsePack({ isPremium: false, userId: 'o' }, null, null)).toBe(true)
    expect(canUsePack({ isPremium: true, userId: 'o' }, null, null)).toBe(false)
    expect(canUsePack({ isPremium: true, userId: 'me' }, 'me', getEntitlements('free'))).toBe(true)
    expect(canUsePack({ isPremium: true, userId: 'o' }, 'me', getEntitlements('free'))).toBe(false)
    expect(canUsePack({ isPremium: true, userId: 'o' }, 'me', lucid)).toBe(true)
    expect(canUsePack({ isPremium: true, userId: 'o', origin: 'creator' }, 'me', lucid)).toBe(false)
    expect(canUsePack({ isPremium: true, userId: 'o', origin: 'creator' }, 'me', getEntitlements('tier2'))).toBe(true)
  })
})

// The Plan tab words the quotas by hand; this keeps its numbers in step with the ones the server enforces.
describe('the Plan tab perks', () => {
  it('quote the same saved preset and upload numbers as the config', () => {
    for (const plan of ['free', 'tier1'] as const) {
      const { savedPresets, particleUploads } = PLAN_ENTITLEMENTS[plan].quotas
      const perks = PLAN_PERKS[plan].join(' | ')
      expect(perks).toContain(`${savedPresets} saved presets`)
      expect(perks).toContain(`${particleUploads} particle uploads`)
    }
    expect(PLAN_PERKS.free.join(' | ')).toContain(`${PLAN_ENTITLEMENTS.free.quotas.privatePacks} private pack`)
  })
})
