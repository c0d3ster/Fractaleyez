import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { setParticleCrossfadeDurationMs } from '../../config/visualizer.config'
import { KaleidoscopeEffect } from './kaleidoscope-effect'

// The effect only reads the time it is given; the renderer and buffer arguments are never touched.
const advance = (effect: KaleidoscopeEffect, deltaSeconds: number): void => {
  effect.update(null as unknown as THREE.WebGLRenderer, null as unknown as THREE.WebGLRenderTarget, deltaSeconds)
}

describe('KaleidoscopeEffect.isIdle', () => {
  it('is idle before any fold is asked for, so the picture can skip the effect pass', () => {
    expect(new KaleidoscopeEffect().isIdle()).toBe(true)
  })

  it('is not idle from the moment a fold is asked for, and never while the fold is on', () => {
    setParticleCrossfadeDurationMs(1000)
    const effect = new KaleidoscopeEffect()
    effect.setFold(6, 0, 0.5)
    expect(effect.isIdle()).toBe(false)
    advance(effect, 0.5)
    expect(effect.isIdle()).toBe(false)
    advance(effect, 0.6)
    expect(effect.isIdle()).toBe(false)
  })

  it('is not idle while it morphs back to no fold, and idle once that morph ends', () => {
    setParticleCrossfadeDurationMs(1000)
    const effect = new KaleidoscopeEffect()
    effect.setFold(6, 0, 0.5)
    advance(effect, 2)
    expect(effect.isIdle()).toBe(false)
    effect.setFold(1, 0, 0.5)
    expect(effect.isIdle()).toBe(false)
    advance(effect, 0.4)
    expect(effect.isIdle()).toBe(false)
    advance(effect, 0.7)
    expect(effect.isIdle()).toBe(true)
  })

  it('is idle at once when the crossfade is a plain cut and no fold remains', () => {
    setParticleCrossfadeDurationMs(0)
    const effect = new KaleidoscopeEffect()
    effect.setFold(4, 0, 0.5)
    advance(effect, 0.016)
    effect.setFold(1, 0, 0.5)
    advance(effect, 0.016)
    expect(effect.isIdle()).toBe(true)
  })
})
