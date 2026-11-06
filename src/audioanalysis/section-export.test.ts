import { describe, expect, it } from 'vitest'

import { buildSectionLog } from './section-export'
import { SectionTracker } from './sections'

describe('section log', () => {
  it('keeps every slot of a session, with the section shown for it', () => {
    const tracker = new SectionTracker()
    for (let t = 0; t <= 60000; t += 16) tracker.push({ t, levels: [10, 6, 3, 4, 2], beat: Math.round(t / 16) % 31 === 0 })
    const recording = tracker.getRecording()
    expect(recording.length).toBeGreaterThan(230)
    // The tracker's own history is only the last two minutes; the recording is the whole session.
    const log = buildSectionLog(recording, new Date('2026-01-01T00:00:00Z'))
    expect(log.version).toBe(1)
    expect(log.slotMs).toBe(250)
    expect(log.savedAt).toBe('2026-01-01T00:00:00.000Z')
    expect(log.slots.every((slot) => typeof slot.section === 'string')).toBe(true)
  })

  it('does not grow without bound', () => {
    const tracker = new SectionTracker()
    for (let t = 0; t <= 45 * 60 * 1000; t += 250) tracker.push({ t, levels: [10, 6, 3, 4, 2], beat: false })
    expect(tracker.getRecording().length).toBeLessThanOrEqual(9600)
  })
})
