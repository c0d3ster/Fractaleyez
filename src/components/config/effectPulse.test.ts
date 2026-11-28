import { describe, expect, it } from 'vitest'

import { BEAT_DRIVEN, pulsingEffects } from './effectPulse'
import type { MotionEffects } from './useGalaxyMotion'

const ALL: MotionEffects = { cyclone: true, wobWob: true, switcheroo: true, colorShift: true, shockwave: true, glow: true }
const KEYS = ['cyclone', 'wobWob', 'switcheroo', 'colorShift', 'glow', 'shockwave'] as const

describe('pulsingEffects', () => {
  it('flashes every beat-driven effect that is on, never Cyclone', () => {
    expect(pulsingEffects(ALL, KEYS)).toEqual(['wobWob', 'switcheroo', 'colorShift', 'glow', 'shockwave'])
    expect(BEAT_DRIVEN.has('cyclone')).toBe(false)
  })

  it('skips effects that are off', () => {
    expect(pulsingEffects({ ...ALL, glow: false, wobWob: false }, KEYS)).toEqual(['switcheroo', 'colorShift', 'shockwave'])
  })

  it('keeps the order of the keys given', () => {
    expect(pulsingEffects(ALL, ['shockwave', 'glow'])).toEqual(['shockwave', 'glow'])
  })
})
