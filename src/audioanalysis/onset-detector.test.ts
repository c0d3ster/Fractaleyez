import { describe, expect, it } from 'vitest'

import { OnsetDetector } from './onset-detector'

const KICK_GAP_MS = 60000 / 128
const FRAME_MS = 1000 / 120

// A kick on the bass band: a fast attack, then a decay of about 60 ms.
const kick = (sinceMs: number, peak: number): number => (sinceMs < 8 ? (sinceMs / 8) * peak : peak * Math.exp(-(sinceMs - 8) / 60))

// Feeds the bass band a level for each frame and counts the beats that fire after `fromMs`.
const countBeats = (seconds: number, fromMs: number, bassLevel: (timeMs: number, kickIndex: number, sinceMs: number) => number): number => {
  const detector = new OnsetDetector(5)
  let beats = 0
  for (let time = 0; time < seconds * 1000; time += FRAME_MS) {
    const kickIndex = Math.floor(time / KICK_GAP_MS)
    const level = bassLevel(time, kickIndex, time - kickIndex * KICK_GAP_MS)
    const { beat } = detector.update([level, 0, 0, 0, 0], FRAME_MS, level, { enabledBands: [true, false, false, false, false], sensitivity: 2, ignoreMs: 250, decayMs: 300 })
    if (beat.fresh && time >= fromMs) beats++
  }
  return beats
}

const kicksAfter = (seconds: number, fromMs: number): number => Math.floor((seconds * 1000 - fromMs) / KICK_GAP_MS)

describe('OnsetDetector', () => {
  it('catches every kick of a steady beat', () => {
    expect(countBeats(30, 2000, (_, __, since) => 1 + kick(since, 40))).toBe(kicksAfter(30, 2000))
  })

  it('catches the softer kicks of a beat whose kicks differ in strength', () => {
    expect(countBeats(30, 2000, (_, index, since) => 1 + kick(since, index % 2 === 0 ? 40 : 10))).toBe(kicksAfter(30, 2000))
    expect(countBeats(30, 2000, (_, index, since) => 1 + kick(since, index % 4 === 3 ? 10 : 40))).toBe(kicksAfter(30, 2000))
  })

  it('catches kicks that are a third as loud as one loud hit a while ago', () => {
    const loudHitThenKicks = (time: number, _: number, since: number): number => 1 + kick(since, 35) + (time > 5000 && time < 5300 ? 65 : 0)
    expect(countBeats(40, 2000, loudHitThenKicks)).toBeGreaterThanOrEqual(kicksAfter(40, 2000) - 1)
  })

  it('does not fire on small wobbles in a quiet passage after loud kicks', () => {
    let seed = 7
    const wobble = (): number => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    expect(countBeats(40, 21000, (time, _, since) => (time < 20000 ? 1 + kick(since, 40) : 1 + 2 * wobble()))).toBe(0)
  })
})
