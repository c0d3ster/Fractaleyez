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

// The labels shown from `seconds` on: every change after that, plus the one that was already showing. Before a regular beat has been going for a
// while there is no song to label, so the start of a run is quiet.
const labelsAfter = (seen: Array<{ section: SongSection; at: number }>, seconds: number): SongSection[] => {
  const before = seen.filter(({ at }) => at < seconds)
  const active = before[before.length - 1]
  return [...(active ? [active] : []), ...seen.filter(({ at }) => at >= seconds)].map(({ section }) => section)
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
    const seen = run(groove, 90, 1, 0.3)
    expect(labelsAfter(seen, 16)).toEqual(['groove'])
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
    // A step up in the low end of about 7 dB: a louder section, not a drop (a drop is a step back up after a buildup, break or quiet stretch, or a very big one).
    const script = (s: number): Frame => (s < 40 ? { levels: [4, 3, 3, 4, 2], beat: beatEvery(500, s) } : { levels: [10, 6, 3, 4, 2], beat: beatEvery(500, s) })
    const names = run(script, 55).map(({ section }) => section)
    expect(names).not.toContain('drop')
  })

  it('treats a long gap in samples (tab in the background) as a fresh start', () => {
    const tracker = new SectionTracker()
    for (let t = 0; t <= 40000; t += FRAME_MS) tracker.push({ t, levels: [10, 6, 3, 4, 2], beat: beatEvery(500, t / 1000) })
    for (let t = 400000; t <= 405000; t += FRAME_MS) tracker.push({ t, levels: [0.1, 0.1, 0.1, 0.1, 0.1], beat: false })
    // Five seconds of faint sound with no beat is no song, so there is nothing to label.
    expect(tracker.getState().section).toBe('quiet')
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
    const names = labelsAfter(run(script, 60), 16)
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
    const outroAt = 160
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

  it('calls a deep fade late in a song an outro, not a break, and the next song an intro', () => {
    const seen = run(twoSongs(0.2, 14, 8), 225)
    const names = seen.map(({ section }) => section)
    expect(names).toContain('outro')
    expect(names).toContain('intro')
    expect(names.indexOf('outro')).toBeLessThan(names.indexOf('intro'))
    expect(names).not.toContain('break')
    expect(names[names.length - 1]).toBe('groove')
  })

  it('still calls the next song an intro when it opens quietly', () => {
    // The fade holds at 25%, then the next song climbs from there.
    const names = run(twoSongs(0.15, 12, 14), 230).map(({ section }) => section)
    expect(names).toContain('outro')
    expect(names).toContain('intro')
  })

  it('counts the songs', () => {
    const tracker = new SectionTracker()
    const script = twoSongs(0.2, 14, 8)
    let song = 1
    for (let t = 0; t <= 225000; t += FRAME_MS) {
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

describe('SectionTracker with no music, and with dips that are not parts', () => {
  it('shows quiet, not groove, for typing on a keyboard (irregular bursts, no steady beat)', () => {
    const random = makeRandom(11)
    const tracker = new SectionTracker()
    let section = 'quiet'
    const seen = new Set<string>()
    let burstUntil = 0
    for (let t = 0; t <= 90000; t += FRAME_MS) {
      // A burst of key noise every second or so, at random times, with the odd "beat" flagged inside it.
      if (t > burstUntil && random() < 0.02) burstUntil = t + 80 + random() * 120
      const loud = t < burstUntil
      const level = loud ? 2 + random() * 3 : 0.15
      tracker.push({ t, levels: [level * 0.4, level * 0.6, level, level * 1.2, level * 0.8], beat: loud && random() < 0.1 })
      section = tracker.getState().section
      seen.add(section)
    }
    expect([...seen]).toEqual(['quiet'])
    expect(section).toBe('quiet')
    expect(tracker.getState().songMs).toBeNull()
  })

  it('does not call a quick recovery from a dip a buildup', () => {
    // A dip of about 8 dB for 2 seconds, then back: that climb is over in a couple of seconds, a buildup lasts bars.
    const script = (s: number): Frame => (s > 45 && s < 47 ? scaledGroove(s, 0.4) : groove(s))
    const names = run(script, 80).map(({ section }) => section)
    expect(names).not.toContain('buildup')
  })

  it('calls a low end held well under its peak a break, even with kick pumping in it', () => {
    const pumping = (s: number): Frame => {
      const phase = (s % 0.5) / 0.5
      const kick = Math.exp(-phase * 6)
      const low = s > 40 && s < 70 ? 0.5 : 1
      return { levels: [(3 + 12 * kick) * low, (3 + 5 * kick) * low, 3, 4, 2], beat: beatEvery(500, s) }
    }
    const seen = run(pumping, 90)
    const names = seen.map(({ section }) => section)
    expect(names).toContain('break')
    const brk = seen.find(({ section }) => section === 'break')!
    expect(brk.at).toBeGreaterThan(40)
    expect(brk.at).toBeLessThan(50)
  })
})

const scaledGroove = (s: number, factor: number): Frame => {
  const frame = groove(s)
  return { levels: frame.levels.map((level) => level * factor), beat: frame.beat }
}

describe('SectionTracker: an intro that climbs into a buildup and then a drop', () => {
  // 0-10 s: the song fades in. 10-24 s: a loop at a modest level. 24-38 s: the highs and the hit density climb. A short gap (the turnaround), then the drop.
  const build = (dropAt: number): ((s: number) => Frame) => (s) => {
    if (s < 10) {
      const climb = 0.1 + 0.4 * (s / 10)
      return { levels: [10 * climb, 6 * climb, 3 * climb, 4 * climb, 2 * climb], beat: beatEvery(500, s) && s > 3 }
    }
    if (s < 24) return { levels: [5, 3, 1.5, 2, 1], beat: beatEvery(500, s) }
    if (s < dropAt - 1.2) {
      const p = (s - 24) / (dropAt - 1.2 - 24)
      return { levels: [3, 2, 1.5 + 5 * p, 2 + 12 * p, 1 + 10 * p], beat: beatEvery(500 - 330 * p, s) }
    }
    // The turnaround: a beat of near silence before the slam.
    if (s < dropAt) return { levels: [0.3, 0.3, 0.5, 1, 0.5], beat: false }
    return { levels: [12, 8, 3, 4, 2], beat: beatEvery(500, s) }
  }

  it('labels the drop, not groove, and does not flicker buildup and groove through it', () => {
    const dropAt = 40
    const seen = run(build(dropAt), 70)
    const names = seen.map(({ section }) => section)
    const drop = seen.find(({ section }) => section === 'drop')
    expect(drop).toBeDefined()
    expect(drop!.at).toBeGreaterThanOrEqual(dropAt - 0.5)
    expect(drop!.at).toBeLessThan(dropAt + 3)
    expect(names).toContain('buildup')
    // After the drop there is no second or third buildup.
    const afterDrop = seen.filter(({ at }) => at >= drop!.at).map(({ section }) => section)
    expect(afterDrop).not.toContain('buildup')
  })

  it('still finds the drop when the buildup label has lapsed by the time it lands', () => {
    // A longer turnaround: the climb stops for several seconds before the drop.
    const script = (s: number): Frame => {
      const frame = build(48)(s)
      return s >= 41 && s < 48 ? { levels: [0.4, 0.4, 0.6, 1.2, 0.6], beat: false } : frame
    }
    const names = run(script, 75).map(({ section }) => section)
    expect(names).toContain('drop')
  })
})

describe('SectionTracker through a drop with a wobbling bass', () => {
  // The first 20 s are a groove, then a break, then a drop whose bass wobbles (a 2 s or 1 s LFO of about 12 dB peak to peak).
  const wobbleSong = (periodS: number): ((s: number) => Frame) => (s) => {
    if (s < 30) return { levels: [10, 6, 3, 4, 2], beat: beatEvery(500, s) }
    if (s < 40) return { levels: [1.5, 1.5, 2.5, 3.5, 2], beat: beatEvery(500, s) }
    const wob = 0.5 + 0.5 * Math.sin((2 * Math.PI * (s - 40)) / periodS)
    const bass = 3 + 12 * wob
    return { levels: [bass, bass * 0.6, 3, 4, 2], beat: beatEvery(500, s) }
  }

  it.each([['2 s', 2], ['1 s', 1]])('gives one drop and no break, buildup or second drop inside it (%s wobble)', (_name, period) => {
    const seen = run(wobbleSong(period), 100)
    const drop = seen.find(({ section }) => section === 'drop')
    expect(drop).toBeDefined()
    const after = seen.filter(({ at }) => at > drop!.at + 0.5).map(({ section }) => section)
    expect(after).not.toContain('break')
    expect(after).not.toContain('buildup')
    expect(after).not.toContain('drop')
  })

  it('keeps a real break and drop pair apart from the wobble before it', () => {
    const names = run(wobbleSong(2), 100).map(({ section }) => section)
    expect(names).toContain('break')
    expect(names.filter((n) => n === 'drop')).toHaveLength(1)
  })
})
