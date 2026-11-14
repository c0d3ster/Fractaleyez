import { describe, expect, it } from 'vitest'

import { DrumHitWatcher, type LastDrumHits } from '../../lab/recording/drumHitWatcher'
import { RecentHistory } from '../../lab/recording/recentHistory'
import { FRAME_MS, syntheticReadings } from './syntheticFrames'

const NO_HITS: LastDrumHits = { kick: null, hat: null, snare: null, clap: null }

describe('DrumHitWatcher', () => {
  it('reports each hit once, and none from before a reset', () => {
    const watcher = new DrumHitWatcher()
    expect(watcher.newHits({ ...NO_HITS, kick: 100 })).toEqual([{ kind: 'kick', t: 100 }])
    expect(watcher.newHits({ ...NO_HITS, kick: 100 })).toEqual([])
    expect(watcher.newHits({ ...NO_HITS, kick: 100, snare: 140 })).toEqual([{ kind: 'snare', t: 140 }])
    watcher.reset(500)
    expect(watcher.newHits({ ...NO_HITS, kick: 400 })).toEqual([])
    expect(watcher.newHits({ ...NO_HITS, kick: 600 })).toEqual([{ kind: 'kick', t: 600 }])
  })
})

describe('RecentHistory', () => {
  it('keeps the frames and hits of the last keepMs, dropping older ones in batches', () => {
    const history = new RecentHistory(2000)
    const readings = syntheticReadings(600)
    readings.forEach((reading, i) => history.push(reading, { ...NO_HITS, kick: readings[i - (i % 30)]!.t }))
    const newest = readings[599]!.t
    expect(history.newestMs()).toBe(newest)
    // Never older than keepMs plus one batch of two seconds.
    expect(history.framesSince(-Infinity)[0]!.t).toBeGreaterThanOrEqual(newest - 2000 - 120 * FRAME_MS - 1)
    expect(history.size()).toBeLessThan(600)
    expect(history.framesSince(newest - 1000)).toHaveLength(61)
    const hits = history.getDrumHits()
    expect(new Set(hits.map(({ t }) => t)).size).toBe(hits.length)
    expect(hits[hits.length - 1]).toEqual({ kind: 'kick', t: readings[570]!.t })
  })

  it('copies each reading', () => {
    const history = new RecentHistory()
    const [reading] = syntheticReadings(1)
    history.push(reading!)
    reading!.levels[0] = -1
    expect(history.framesSince(-Infinity)[0]!.levels[0]).not.toBe(-1)
  })
})
