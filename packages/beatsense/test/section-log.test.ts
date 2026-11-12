import { describe, expect, it } from 'vitest'

import { buildSectionLog } from '../src/section-log'
import { SectionTracker } from '../src/sections'

describe('section log', () => {
  it('keeps every tick of a session', () => {
    const tracker = new SectionTracker()
    for (let t = 0; t <= 60000; t += 16) tracker.push({ t, levels: [10, 6, 3, 4, 2], beat: Math.round(t / 16) % 31 === 0 })
    const recording = tracker.getRecording()
    // One tick per 50 ms (a frame of 16 ms closes a tick every 4 frames, 64 ms), well beyond the two minutes of history.
    expect(recording.length).toBeGreaterThan(900)
    const log = buildSectionLog(recording, new Date('2026-01-01T00:00:00Z'))
    expect(log.version).toBe(2)
    expect(log.tickMs).toBe(50)
    expect(log.savedAt).toBe('2026-01-01T00:00:00.000Z')
    expect(log.ticks.every((tick) => tick.power.length === 5)).toBe(true)
  })

  it('does not grow without bound', () => {
    const tracker = new SectionTracker()
    for (let t = 0; t <= 45 * 60 * 1000; t += 50) tracker.push({ t, levels: [10, 6, 3, 4, 2], beat: false })
    expect(tracker.getRecording().length).toBeLessThanOrEqual(48000)
  })
})
