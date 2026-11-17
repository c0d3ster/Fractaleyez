import { describe, it, expect } from 'vitest'
import { Entitlements, Usage, hasRoomFor, isQuotaExceeded, nextPlanFor, quotaMessage } from './plans.config'

const dream: Entitlements = {
  plan: 'free',
  quotas: { savedPresets: 3, particleUploads: 3, privatePacks: 1, publicPacks: 0 },
  features: { builtInPremiumPacks: false, allPacks: false, customFractalPath: false },
}
const usage = (savedPresets: number): Usage => ({ savedPresets, particleUploads: 0, privatePacks: 0, publicPacks: 0 })

describe('hasRoomFor', () => {
  it('has room below the limit and none at or over it', () => {
    expect(hasRoomFor(dream, usage(2), 'savedPresets')).toBe(true)
    expect(hasRoomFor(dream, usage(3), 'savedPresets')).toBe(false)
    expect(hasRoomFor(dream, usage(5), 'savedPresets')).toBe(false)
  })

  it('has no room for a quota of zero', () => {
    expect(hasRoomFor(dream, usage(0), 'publicPacks')).toBe(false)
  })

  it('always has room when unlimited or not loaded yet, leaving the last word to the server', () => {
    expect(hasRoomFor({ ...dream, quotas: { ...dream.quotas, savedPresets: null } }, usage(99), 'savedPresets')).toBe(true)
    expect(hasRoomFor(null, null, 'savedPresets')).toBe(true)
    expect(hasRoomFor(dream, null, 'savedPresets')).toBe(true)
  })
})

describe('quota refusals', () => {
  it('recognizes the server\'s quota 403 body and words it with the plan name', () => {
    const body = { error: 'x', code: 'quota_exceeded', quota: 'savedPresets', limit: 3, plan: 'free' }
    expect(isQuotaExceeded(body)).toBe(true)
    expect(isQuotaExceeded({ error: 'Only admins can create presets that use @user' })).toBe(false)
    expect(quotaMessage({ quota: 'savedPresets', limit: 3, plan: 'free' })).toBe('Dream includes 3 saved presets, and you\'ve used them all.')
    expect(quotaMessage({ quota: 'publicPacks', limit: 0, plan: 'free' })).toBe('Dream doesn\'t include public packs.')
  })

  it('points each plan at the next one up', () => {
    expect([nextPlanFor('free'), nextPlanFor('tier1'), nextPlanFor('tier2')]).toEqual(['tier1', 'tier2', null])
  })
})
