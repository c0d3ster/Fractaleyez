import { describe, expect, it } from 'vitest'

import { SectionTracker, SongSection } from './sections'

const FRAME_MS = 16

// Deterministic noise so a failure reproduces.
const makeRandom = (seed: number): (() => number) => {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

type Frame = { levels: number[]; beat: boolean }

const run = (script: (s: number) => Frame, seconds: number, gain = 1, noise = 0): Array<{ section: SongSection; at: number }> => {
  const tracker = new SectionTracker()
  const random = makeRandom(7)
  const seen: Array<{ section: SongSection; at: number }> = []
  let lastBeatAt = -Infinity
  for (let t = 0; t <= seconds * 1000; t += FRAME_MS) {
    const frame = script(t / 1000)
    const levels = frame.levels.map((level) => Math.max(0, level * gain * (1 + (random() - 0.5) * 2 * noise)))
    const beat = frame.beat && t - lastBeatAt > 60
    if (beat) lastBeatAt = t
    tracker.push({ t, levels, beat })
    const { section } = tracker.getState()
    if (seen[seen.length - 1]?.section !== section) seen.push({ section, at: t / 1000 })
  }
  return seen
}

const beatEvery = (periodMs: number, s: number): boolean => {
  const step = Math.max(1, Math.round(periodMs / FRAME_MS))
  return Math.round((s * 1000) / FRAME_MS) % step === 0
}

const groove = (s: number): Frame => ({ levels: [10, 6, 3, 4, 2], beat: beatEvery(500, s) })

const buildScript = (buildStart: number, dropAt: number): ((s: number) => Frame) => (s) => {
  if (s < buildStart || s >= dropAt) return groove(s)
  const p = (s - buildStart) / (dropAt - buildStart)
  return { levels: [2, 2, 3, 4 + 12 * p, 2 + 12 * p], beat: beatEvery(500 - 375 * p, s) }
}

describe('SectionTracker under realistic conditions', () => {
  it('finds the buildup and drop with noisy levels', () => {
    const seen = run(buildScript(40, 52), 62, 1, 0.25)
    const names = seen.map(({ section }) => section)
    expect(names).toContain('buildup')
    expect(names).toContain('drop')
    expect(names.filter((n) => n === 'drop')).toHaveLength(1)
  })

  it('gives the same labels at a tenth of the level (quiet mic)', () => {
    const loud = run(buildScript(40, 52), 62).map(({ section }) => section)
    const quiet = run(buildScript(40, 52), 62, 0.1).map(({ section }) => section)
    expect(quiet).toEqual(loud)
  })

  it('stays groove with noise and no structure', () => {
    const names = run(groove, 90, 1, 0.3).map(({ section }) => section)
    expect(names).toEqual(['groove'])
  })

  it('finds a short, 6 second buildup', () => {
    const names = run(buildScript(40, 46), 56).map(({ section }) => section)
    expect(names).toContain('buildup')
    expect(names).toContain('drop')
  })

  it('finds a second buildup and drop in the same song', () => {
    const script = (s: number): Frame => (s < 70 ? buildScript(40, 52)(s) : buildScript(80, 92)(s))
    const names = run(script, 105).map(({ section }) => section)
    expect(names.filter((n) => n === 'buildup').length).toBeGreaterThanOrEqual(2)
    expect(names.filter((n) => n === 'drop').length).toBeGreaterThanOrEqual(2)
  })

  it('does not call a drop without a buildup or break before it', () => {
    const script = (s: number): Frame => (s < 40 ? { levels: [4, 3, 3, 4, 2], beat: beatEvery(500, s) } : { levels: [14, 9, 4, 4, 2], beat: beatEvery(500, s) })
    const names = run(script, 55).map(({ section }) => section)
    expect(names).not.toContain('drop')
  })

  it('treats a long gap in samples (tab in the background) as a fresh start', () => {
    const tracker = new SectionTracker()
    for (let t = 0; t <= 40000; t += FRAME_MS) tracker.push({ t, levels: [10, 6, 3, 4, 2], beat: beatEvery(500, t / 1000) })
    for (let t = 400000; t <= 405000; t += FRAME_MS) tracker.push({ t, levels: [0.1, 0.1, 0.1, 0.1, 0.1], beat: false })
    expect(tracker.getState().section).toBe('groove')
    expect(tracker.getHistory().every((slot) => slot.t >= 400000)).toBe(true)
  })

  it('keeps a bounded history and stays fast', () => {
    const tracker = new SectionTracker()
    const start = performance.now()
    for (let t = 0; t <= 600000; t += FRAME_MS) tracker.push({ t, levels: [10, 6, 3, 4, 2], beat: beatEvery(500, t / 1000) })
    const elapsed = performance.now() - start
    expect(tracker.getHistory().length).toBeLessThanOrEqual(481)
    // Ten minutes of 60fps audio frames should cost a tiny fraction of a second.
    expect(elapsed).toBeLessThan(1500)
  })
})

describe('SectionTracker drop accuracy', () => {
  // A kick that thumps on every beat: its peaks are several dB over its own average.
  const kickGroove = (s: number, bassBase = 3): Frame => {
    const phase = (s % 0.5) / 0.5
    const kick = Math.exp(-phase * 6)
    return { levels: [bassBase + 14 * kick, 3 + 5 * kick, 3, 4, 2], beat: beatEvery(500, s) }
  }

  it('does not read a single kick as the low end coming back', () => {
    const script = (s: number): Frame => (s > 30 && s < 40 ? { levels: [1, 1, 2.5, 3.5, 2], beat: false } : kickGroove(s))
    const names = run(script, 60).map(({ section }) => section)
    // The break itself may be named, but the kicks inside the groove must not fire drops by themselves.
    expect(names.filter((n) => n === 'drop').length).toBeLessThanOrEqual(1)
  })

  it('does not call a drop after a break that only lasted a moment', () => {
    const script = (s: number): Frame => (s > 31 && s < 32.6 ? { levels: [1, 1, 2.5, 3.5, 2], beat: false } : kickGroove(s))
    const names = run(script, 50).map(({ section }) => section)
    expect(names).not.toContain('drop')
  })

  it('calls the low end returning after a short pause a drop', () => {
    // A few seconds of near silence before the drop is a pause, not the end of the song.
    const script = (s: number): Frame => (s > 30 && s < 33.5 ? { levels: [0.05, 0.05, 0.05, 0.05, 0.05], beat: false } : kickGroove(s))
    const names = run(script, 50).map(({ section }) => section)
    expect(names).toContain('quiet')
    expect(names).toContain('drop')
  })

  it('does not flicker in and out of quiet while a dip hovers near the line', () => {
    // Hovers around the quiet line for 10 seconds.
    const script = (s: number): Frame => {
      if (s > 30 && s < 40) {
        const wobble = 0.16 + 0.1 * Math.sin(s * 3)
        return { levels: [10 * wobble, 6 * wobble, 3 * wobble, 4 * wobble, 2 * wobble], beat: false }
      }
      return groove(s)
    }
    const names = run(script, 60).map(({ section }) => section)
    const flips = names.filter((n) => n === 'quiet').length
    expect(flips).toBeLessThanOrEqual(1)
  })
})

describe('SectionTracker intros, outros and song changes', () => {
  // Scales a frame's levels, and optionally the highs separately (an outro takes the highs down with everything else).
  const scaled = (frame: Frame, all: number, highs = all): Frame => ({
    levels: frame.levels.map((level, i) => level * (i >= 3 ? highs : all)),
    beat: frame.beat,
  })

  // A song: groove, then an outro fading to `floor`, held for `hold` seconds, then the next song ramps in over `ramp` seconds.
  const twoSongs = (floor: number, hold: number, ramp: number): ((s: number) => Frame) => {
    const outroAt = 50
    const nextAt = outroAt + 4 + hold
    return (s) => {
      if (s < outroAt) return groove(s)
      if (s < outroAt + 4) {
        const fade = (s - outroAt) / 4
        return scaled(groove(s), 1 - (1 - floor) * fade, 1 - (1 - floor * 0.4) * fade)
      }
      if (s < nextAt) return scaled({ ...groove(s), beat: false }, floor, floor * 0.4)
      const climb = Math.min(1, (s - nextAt) / ramp)
      return scaled(groove(s), floor + (1 - floor) * climb)
    }
  }

  it('calls a fade to 40% an outro, not a break, and the next song an intro', () => {
    const seen = run(twoSongs(0.4, 14, 8), 110)
    const names = seen.map(({ section }) => section)
    expect(names).toContain('outro')
    expect(names).toContain('intro')
    expect(names.indexOf('outro')).toBeLessThan(names.indexOf('intro'))
    expect(names).not.toContain('break')
    expect(names[names.length - 1]).toBe('groove')
  })

  it('still calls the next song an intro when it opens quietly', () => {
    // The fade holds at 25%, then the next song climbs from there.
    const names = run(twoSongs(0.25, 12, 14), 120).map(({ section }) => section)
    expect(names).toContain('outro')
    expect(names).toContain('intro')
  })

  it('counts the songs', () => {
    const tracker = new SectionTracker()
    const script = twoSongs(0.4, 14, 8)
    let song = 1
    for (let t = 0; t <= 110000; t += FRAME_MS) {
      const frame = script(t / 1000)
      tracker.push({ t, levels: frame.levels, beat: frame.beat })
      song = tracker.getState().songIndex
    }
    expect(song).toBe(2)
  })

  it('does not call a break an outro: a break keeps the highs', () => {
    const script = (s: number): Frame => (s > 30 && s < 50 ? { levels: [1, 1, 2.5, 4, 2], beat: beatEvery(500, s) } : groove(s))
    const names = run(script, 70).map(({ section }) => section)
    expect(names).toContain('break')
    expect(names).not.toContain('outro')
  })

  it('calls a fade that comes back within a few seconds a long break, not a new song', () => {
    const script = (s: number): Frame => (s > 40 && s < 47 ? scaled(groove(s), 0.4, 0.15) : groove(s))
    const tracker = new SectionTracker()
    let song = 1
    for (let t = 0; t <= 70000; t += FRAME_MS) {
      const frame = script(t / 1000)
      tracker.push({ t, levels: frame.levels, beat: frame.beat })
      song = tracker.getState().songIndex
    }
    expect(song).toBe(1)
  })

  it('opens a song that starts from silence with an intro, and calls no buildup in it', () => {
    const script = (s: number): Frame => {
      const p = Math.min(1, s / 18)
      const frame = groove(s)
      return { levels: frame.levels.map((level) => level * (0.05 + 0.95 * p)), beat: frame.beat && s > 4 }
    }
    const names = run(script, 60).map(({ section }) => section)
    expect(names).toContain('intro')
    expect(names).not.toContain('buildup')
    expect(names[names.length - 1]).toBe('groove')
  })

  it('does not call the start of the app mid-song an intro', () => {
    const names = run(groove, 40).map(({ section }) => section)
    expect(names).not.toContain('intro')
  })

  it('treats a change of tempo with no outro as the next song', () => {
    const script = (s: number): Frame => (s < 70 ? { levels: [10, 6, 3, 4, 2], beat: beatEvery(500, s) } : { levels: [10, 6, 3, 4, 2], beat: beatEvery(368, s) })
    const tracker = new SectionTracker()
    let song = 1
    for (let t = 0; t <= 120000; t += FRAME_MS) {
      const frame = script(t / 1000)
      tracker.push({ t, levels: frame.levels, beat: frame.beat })
      song = tracker.getState().songIndex
    }
    expect(song).toBe(2)
  })

  it('does not read a steady tempo as a song change', () => {
    const tracker = new SectionTracker()
    let song = 1
    for (let t = 0; t <= 150000; t += FRAME_MS) {
      tracker.push({ t, levels: [10, 6, 3, 4, 2], beat: beatEvery(500, t / 1000) })
      song = tracker.getState().songIndex
    }
    expect(song).toBe(1)
  })
})

describe('SectionTracker song time', () => {
  const timeAt = (script: (s: number) => Frame, seconds: number): number | null => {
    const tracker = new SectionTracker()
    for (let t = 0; t <= seconds * 1000; t += FRAME_MS) {
      const frame = script(t / 1000)
      tracker.push({ t, levels: frame.levels, beat: frame.beat })
    }
    return tracker.getState().songMs
  }

  it('has no song time until a song with a beat has been going a while', () => {
    expect(timeAt(groove, 6)).toBeNull()
    expect(timeAt(groove, 30)).toBeGreaterThan(25000)
  })

  it('has no song time in silence or on stray noise with no beat', () => {
    expect(timeAt(() => ({ levels: [0.05, 0.05, 0.05, 0.05, 0.05], beat: false }), 60)).toBeNull()
    const spurts = (s: number): Frame => ({ levels: Math.floor(s) % 9 === 0 ? [6, 3, 2, 2, 1] : [0.05, 0.05, 0.05, 0.05, 0.05], beat: false })
    expect(timeAt(spurts, 60)).toBeNull()
  })

  it('starts the time over when the next song starts', () => {
    const script = (s: number): Frame => (s < 70 ? { levels: [10, 6, 3, 4, 2], beat: beatEvery(500, s) } : { levels: [10, 6, 3, 4, 2], beat: beatEvery(368, s) })
    const ms = timeAt(script, 120)
    expect(ms).not.toBeNull()
    expect(ms!).toBeLessThan(60000)
  })
})

describe('SectionTracker silences between songs', () => {
  const silent = (floor: number): Frame => ({ levels: [10 * floor, 6 * floor, 3 * floor, 4 * floor, 2 * floor], beat: false })

  // Music, 20 s of silence from 10 s, music again, 20 s of silence from 40 s, music again.
  const withSilences = (floor: number): ((s: number) => Frame) => (s) => ((s >= 10 && s < 30) || (s >= 40 && s < 60) ? silent(floor) : groove(s))

  const finish = (script: (s: number) => Frame, seconds: number): ReturnType<SectionTracker['getState']> => {
    const tracker = new SectionTracker()
    for (let t = 0; t <= seconds * 1000; t += FRAME_MS) {
      const frame = script(t / 1000)
      tracker.push({ t, levels: frame.levels, beat: frame.beat })
    }
    return tracker.getState()
  }

  it.each([
    ['digital silence', 0],
    ['a mic noise floor at 1% of the music', 0.01],
    ['a mic noise floor at 3% of the music', 0.03],
  ])('treats each of two 20 s silences as a new song (%s)', (_name, floor) => {
    const state = finish(withSilences(floor), 100)
    expect(state.songIndex).toBe(3)
  })

  it('restarts the song clock after a silence', () => {
    const state = finish(withSilences(0), 75)
    expect(state.songIndex).toBe(3)
    // The third song began around 60 s, so 15 s later its clock cannot read more than that.
    expect(state.songMs === null || state.songMs < 16000).toBe(true)
  })

  it('treats a silence at the very start of a song, inside the warm-up, as a boundary too', () => {
    const script = (s: number): Frame => (s >= 2 && s < 22 ? silent(0) : groove(s))
    // 2 s of music is under the minimum for a song, so this is still the first song, restarted.
    expect(finish(script, 50).songIndex).toBe(1)
    const longer = (s: number): Frame => (s >= 12 && s < 32 ? silent(0) : groove(s))
    expect(finish(longer, 60).songIndex).toBe(2)
  })

  it('does not call the app opening on silence and then music a second song', () => {
    const script = (s: number): Frame => (s < 25 ? silent(0) : groove(s))
    expect(finish(script, 60).songIndex).toBe(1)
  })

  it('does not call a short gap in the sound a new song', () => {
    const script = (s: number): Frame => (s >= 30 && s < 33 ? silent(0) : groove(s))
    expect(finish(script, 60).songIndex).toBe(1)
  })
})
