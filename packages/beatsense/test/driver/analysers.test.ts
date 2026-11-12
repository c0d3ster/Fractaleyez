import { describe, expect, it } from 'vitest'
import { createAnalysers, loadSectionModel, SectionTracker } from '../../src'

const FRAME_MS = 1000 / 60

describe('createAnalysers', () => {
  it('starts the section tracker idle and loads the lazy model into it', async () => {
    const analysers = createAnalysers()
    // Before the model arrives, pushes are ignored and the state stays quiet.
    analysers.sectionTracker.push({ t: 0, levels: [10, 6, 3, 4, 2], beat: true })
    expect(analysers.sectionTracker.getRecording()).toHaveLength(0)
    await analysers.sectionModelReady
    for (let f = 0; f < 600; f++) analysers.sectionTracker.push({ t: f * FRAME_MS, levels: [10, 6, 3, 4, 2], beat: f % 30 === 0 })
    expect(analysers.sectionTracker.getRecording().length).toBeGreaterThan(100)
  })

  it('gives each caller its own set', () => {
    expect(createAnalysers().tempoTracker).not.toBe(createAnalysers().tempoTracker)
  })
})

describe('loadSectionModel', () => {
  it('caches one load and the model passes the feature check', async () => {
    const [first, second] = await Promise.all([loadSectionModel(), loadSectionModel()])
    expect(second).toBe(first)
    expect(() => new SectionTracker(first)).not.toThrow()
  })

  it('a tracker given no model ignores frames until setModel', async () => {
    const tracker = new SectionTracker()
    tracker.push({ t: 0, levels: [1, 1, 1, 1, 1], beat: false })
    expect(tracker.getRecording()).toHaveLength(0)
    tracker.setModel(await loadSectionModel())
    for (let f = 0; f < 120; f++) tracker.push({ t: f * FRAME_MS, levels: [1, 1, 1, 1, 1], beat: false })
    expect(tracker.getRecording().length).toBeGreaterThan(0)
  })
})
