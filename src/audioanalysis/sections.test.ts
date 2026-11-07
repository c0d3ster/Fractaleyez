import { describe, expect, it } from 'vitest'
import { SectionSample, SectionState, SectionTracker } from './sections'
import { Booster, boosterScores, sigmoid, softmaxInPlace } from './section-model'

// How well the tracker labels real songs is measured offline against expert labels (scripts/section-eval, see the plan doc).
// These tests pin what has to hold whatever the model learned: no labels without a song, the song clock, song changes on long
// silences, the same answer for a quiet mic, a replayable recording, and bounded memory.

const FRAME_MS = 1000 / 60
const BEAT_MS = 60000 / 128

type Shape = (t: number) => { bass: number; mid: number; high: number; beats: boolean }

// A steady four-on-the-floor song: a kick every beat (the bass pumps), mids and highs held, with slow random wobble.
const groove: Shape = () => ({ bass: 1, mid: 1, high: 1, beats: true })

const render = (seconds: number, shape: Shape, { scale = 1, start = 0, seed = 1 } = {}): SectionSample[] => {
  let state = seed
  const noise = (): number => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296 - 0.5
  }
  const frames: SectionSample[] = []
  let nextBeat = 0
  for (let k = 0; k < (seconds * 1000) / FRAME_MS; k++) {
    const local = k * FRAME_MS
    const { bass, mid, high, beats } = shape(local / 1000)
    const sinceBeat = (local % BEAT_MS) / BEAT_MS
    const kick = beats ? Math.exp(-sinceBeat * 6) : 0.15
    const beat = beats && local >= nextBeat
    if (beat) nextBeat += BEAT_MS
    if (!beats) nextBeat = local + BEAT_MS
    const wobble = 1 + noise() * 0.2
    frames.push({
      t: start + local,
      levels: [bass * (0.3 + kick) * 12, bass * 8 * wobble, mid * 6 * wobble, high * 4 * wobble, high * 3 * wobble].map((v) => v * scale),
      beat,
    })
  }
  return frames
}

const silence = (seconds: number, start: number): SectionSample[] =>
  Array.from({ length: (seconds * 1000) / FRAME_MS }, (_, k) => ({ t: start + k * FRAME_MS, levels: [0, 0, 0, 0, 0], beat: false }))

const play = (tracker: SectionTracker, frames: SectionSample[]): SectionState[] => {
  const states: SectionState[] = []
  frames.forEach((frame) => {
    tracker.push(frame)
    states.push(tracker.getState())
  })
  return states
}

const end = (frames: SectionSample[]): number => (frames[frames.length - 1]?.t ?? 0) + FRAME_MS

describe('SectionTracker', () => {
  it('shows quiet and has no song time with no regular beat (noise, typing)', () => {
    const tracker = new SectionTracker()
    const typing: Shape = (t) => ({ bass: 0.05, mid: 0.4 + (Math.sin(t * 13.7) > 0.7 ? 1 : 0), high: 0.3, beats: false })
    // Keystrokes at irregular times: gaps drawn at random between 80 and 900 ms.
    let seed = 7
    let next = 0
    const frames = render(40, typing).map((frame) => {
      if (frame.t < next) return { ...frame, beat: false }
      seed = (seed * 1664525 + 1013904223) % 4294967296
      next = frame.t + 80 + (seed / 4294967296) * 820
      return { ...frame, beat: true }
    })
    const states = play(tracker, frames)
    expect(states.slice(-600).every((s) => s.section === 'quiet' && s.songMs === null)).toBe(true)
  })

  it('confirms a song with a steady beat and runs the song clock', () => {
    const tracker = new SectionTracker()
    const states = play(tracker, render(40, groove))
    const last = states[states.length - 1]!
    expect(last.section).not.toBe('quiet')
    expect(last.songMs).toBeGreaterThan(25000)
    expect(last.songIndex).toBe(1)
  })

  it('gives the same labels at a tenth of the level (a quiet mic)', () => {
    const shape: Shape = (t) => (t > 40 && t < 56 ? { bass: 0.1, mid: 0.5 + (t - 40) / 16, high: 0.5 + (t - 40) / 10, beats: t % 2 < 1 } : groove(t))
    const loud = play(new SectionTracker(), render(90, shape)).map((s) => s.section)
    const quiet = play(new SectionTracker(), render(90, shape, { scale: 0.1 })).map((s) => s.section)
    expect(quiet).toEqual(loud)
  })

  it('starts the next song after a long silence and restarts the clock', () => {
    const tracker = new SectionTracker()
    const first = render(70, groove)
    const gap = silence(8, end(first))
    const second = render(30, groove, { start: end(gap), seed: 2 })
    const states = play(tracker, [...first, ...gap, ...second])
    const last = states[states.length - 1]!
    expect(last.songIndex).toBe(2)
    expect(last.songMs).toBeLessThan(31000)
    expect(states.slice(first.length + 120, first.length + gap.length).every((s) => s.section === 'quiet')).toBe(true)
  })

  it('does not start a new song on a short stop inside a song', () => {
    const tracker = new SectionTracker()
    const first = render(70, groove)
    const stop = silence(2, end(first))
    const rest = render(40, groove, { start: end(stop), seed: 3 })
    const states = play(tracker, [...first, ...stop, ...rest])
    expect(states[states.length - 1]!.songIndex).toBe(1)
    expect(states[states.length - 1]!.songMs).toBeGreaterThan(100000)
  })

  it('does not call the app opening on silence and then music a second song', () => {
    const tracker = new SectionTracker()
    const opening = silence(10, 0)
    const states = play(tracker, [...opening, ...render(30, groove, { start: end(opening) })])
    expect(states[states.length - 1]!.songIndex).toBe(1)
  })

  it('treats a long gap in samples (the tab was in the background) as a fresh start', () => {
    const tracker = new SectionTracker()
    const first = render(30, groove)
    const later = render(20, groove, { start: end(first) + 300000 })
    play(tracker, first)
    const states = play(tracker, later)
    expect(states[states.length - 1]!.songIndex).toBe(2)
    expect(states[states.length - 1]!.songMs ?? 0).toBeLessThan(21000)
  })

  it('replays its own recording to the same states', () => {
    const live = new SectionTracker()
    const shape: Shape = (t) => (t > 30 && t < 45 ? { bass: 0.05, mid: 1, high: 1.5, beats: true } : groove(t))
    const liveStates: SectionState[] = []
    render(70, shape).forEach((frame) => {
      const before = live.getHistory().length
      live.push(frame)
      if (live.getHistory().length !== before) liveStates.push(live.getState())
    })
    const replay = new SectionTracker()
    const replayStates: SectionState[] = []
    live.getRecording().forEach((tick) => {
      const before = replay.getHistory().length
      replay.pushTick(tick)
      if (replay.getHistory().length !== before) replayStates.push(replay.getState())
    })
    expect(replayStates.map((s) => s.section)).toEqual(liveStates.map((s) => s.section))
    expect(replayStates.map((s) => s.dropCount)).toEqual(liveStates.map((s) => s.dropCount))
  })

  it('keeps a bounded history and stays fast', () => {
    const tracker = new SectionTracker()
    const frames = render(600, groove)
    const started = performance.now()
    play(tracker, frames)
    const msPerSecondOfAudio = (performance.now() - started) / 600
    expect(tracker.getHistory().length).toBeLessThanOrEqual(481)
    expect(tracker.getRecording().length).toBeLessThanOrEqual(48000)
    // Well under a millisecond of work for every second of audio would be fine; this leaves room for a slow CI machine.
    expect(msPerSecondOfAudio).toBeLessThan(5)
  })
})

describe('section model inference', () => {
  // One iteration of a three-class booster: a stump per class on feature 0.
  const booster: Booster = {
    baseline: [0.1, -0.2, 0.3],
    treesPerIteration: 3,
    trees: [
      [[0, 0.5, 1, 2], [1], [-1]],
      [[0, 0.5, 1, 2], [0], [2]],
      [[1, 0, 1, 2], [0.5], [-0.5]],
    ],
  }

  it('goes left at or under the threshold and adds each class its own trees', () => {
    expect(boosterScores(booster, [0.5, 0], [])).toEqual([1.1, -0.2, 0.8])
    expect(boosterScores(booster, [0.6, 1], [])).toEqual([-0.9, 1.8, -0.2])
  })

  it('turns scores into probabilities', () => {
    const p = softmaxInPlace([1, 1, 1])
    p.forEach((v) => expect(v).toBeCloseTo(1 / 3))
    expect(sigmoid(0)).toBe(0.5)
  })
})
