import { describe, expect, it } from 'vitest'

import { DRUM_KINDS, DrumHits, drumProbabilities, type DrumCandidate, type DrumKind } from './drum-hits'
import fixture from './drum-hits.fixture.json'

// The first 3.2 s of band levels (60 fps, levels.py's filters, clean feed) of three generated test clips (scripts/section-eval/drum-gen.py),
// with the times each drum was placed at: a four-on-the-floor kick with off-beat hats and a clap on 2 and 4, a snare alone, and bass, pads
// and chord stabs with no drums.
type Clip = { bpm: number; hits: Record<DrumKind, number[]>; frames: number[][] }
const CLIPS: Record<'kit' | 'snare' | 'melodic', Clip> = fixture
const FRAME_MS = 1000 / 60
// A call is the hit's when it is this close after it (a candidate starts at its first edge, a frame or two in).
const MATCH_MS = 60

// The clip at 60 fps, or at 240 fps with the levels between frames interpolated.
const framesAt = (clip: Clip, fps: 60 | 240): Array<{ t: number; levels: number[] }> => {
  if (fps === 60) return clip.frames.map((levels, f) => ({ t: f * FRAME_MS, levels }))
  return clip.frames.slice(0, -1).flatMap((levels, f) => {
    const next = clip.frames[f + 1] ?? levels
    return [0, 1, 2, 3].map((q) => ({ t: (f + q / 4) * FRAME_MS, levels: levels.map((v, b) => v + ((next[b] ?? v) - v) * (q / 4)) }))
  })
}

const run = (clip: Clip, fps: 60 | 240 = 60): { drums: DrumHits; candidates: DrumCandidate[] } => {
  const candidates: DrumCandidate[] = []
  const drums = new DrumHits((candidate) => candidates.push(candidate))
  framesAt(clip, fps).forEach(({ t, levels }) => drums.push(t, levels, 1000 / fps, 2))
  return { drums, candidates }
}

const callsOf = (drums: DrumHits, kind: DrumKind): readonly number[] => drums.getHits()[DRUM_KINDS.indexOf(kind)]!
const caught = (hits: readonly number[], calls: readonly number[]): number => hits.filter((hit) => calls.some((t) => t >= hit - 20 && t <= hit + MATCH_MS)).length
const extra = (hits: readonly number[], calls: readonly number[]): number => calls.filter((t) => !hits.some((hit) => t >= hit - 20 && t <= hit + MATCH_MS)).length

describe('drumProbabilities', () => {
  // Feature vectors from the training set and what the Python fit gave for them: the same model, read the same way.
  it('matches the trained model', () => {
    PARITY.forEach(([features, expected]) => {
      drumProbabilities(features).forEach((p, k) => expect(p).toBeCloseTo(expected[k]!, 3))
    })
  })
})

describe('DrumHits', () => {
  const expectKit = (fps: 60 | 240): void => {
    const { drums } = run(CLIPS.kit, fps)
    ;(['kick', 'hat', 'clap'] as const).forEach((kind) => {
      expect(caught(CLIPS.kit.hits[kind], callsOf(drums, kind))).toBe(CLIPS.kit.hits[kind].length)
      expect(extra(CLIPS.kit.hits[kind], callsOf(drums, kind))).toBe(0)
    })
    expect(callsOf(drums, 'snare')).toEqual([])
  }

  it('calls the kick, the hats and the clap of a kit, the clap and the kick together, at 60 fps', () => expectKit(60))

  // Known gap, failing on purpose until the model is retrained (scripts/section-eval/DRUM-HITS.md): when it passes, make it a plain `it` again.
  // At 240 fps the first kick reads as a clap as well (0.89 against 0.875; 0.36 at 60 fps): the candidate is read on levels between frames,
  // which the model was not trained on.
  it.fails('calls the kick, the hats and the clap of a kit, the clap and the kick together, at 240 fps', () => expectKit(240))

  // Known gap, failing on purpose until the model is retrained (scripts/section-eval/DRUM-HITS.md): when it passes, make it a plain `it` again.
  // A snare with a strong body and nothing around it reads as half a kick (snare 0.55 and 0.7 against its 0.8, kick 0.6).
  it.fails('calls a snare alone a snare and nothing else', () => {
    const { drums } = run(CLIPS.snare)
    expect(caught(CLIPS.snare.hits.snare, callsOf(drums, 'snare'))).toBe(CLIPS.snare.hits.snare.length)
    ;(['kick', 'hat', 'clap'] as const).forEach((kind) => expect(callsOf(drums, kind)).toEqual([]))
  })

  it('calls no drum in bass, pads and chord stabs, though they make candidates', () => {
    const { drums, candidates } = run(CLIPS.melodic)
    expect(candidates.length).toBeGreaterThan(3)
    expect(drums.getHits().flat()).toEqual([])
  })

  it('makes no candidates in the first second, while the trackers have nothing to compare with', () => {
    expect(run(CLIPS.melodic).candidates.every(({ t }) => t >= 1000)).toBe(true)
  })

  it('reads a roll from the snare and the clap only', () => {
    const { drums } = run(CLIPS.kit)
    expect(drums.getRollHits()).toEqual([callsOf(drums, 'snare'), callsOf(drums, 'clap')])
  })

  it('keeps only the last few seconds, and knows when each drum last hit', () => {
    const drums = new DrumHits()
    const frames = framesAt(CLIPS.kit, 60)
    const clipMs = frames.length * FRAME_MS
    ;[0, 1, 2].forEach((loop) => frames.forEach(({ t, levels }) => drums.push(loop * clipMs + t, levels, FRAME_MS, 2)))
    const end = 3 * clipMs
    expect(drums.getHits().flat().every((time) => time >= end - 3000 - FRAME_MS)).toBe(true)
    const last = drums.getLastHits()
    expect(last.kick).toBe(callsOf(drums, 'kick').at(-1))
    expect(last.snare).toBeNull()
  })
})

const PARITY: Array<[number[], number[]]> = [
  [[-0.3777, 3.536, 6.1765, 4.8173, 5.3715, 0.5137, 0.452, 0.342, 0.087, 0.2656, -5.546, -0.0468, -0.9923, -3.6076, -5.2168, 0.3556, -4.3256, 0.3923, 0.7838, 0.5728, -0.3895, 0, 0, 0, 0, 1, -4.3256, 0.3923, 0.7838, 0.69, 0.6475, -5.5461, -0.0468, -0.9923, -3.4905, -4.1799], [0.0105, 0.0069, 0.0017, 0.0001]],
  [[-1.4802, 3.5425, 4.5984, 0.6595, 0.7403, 0.5638, 0.4633, 0.4102, 0.9519, 1, -6.9149, -6.9149, -6.9149, -0.9686, -0.0494, -0.9585, -7.0284, -7.0306, -5.7682, -1.4057, -0.615, 0, 1, 1, 0, 0, -7.0284, 0.2089, 0.1104, -0.6081, -0.58, -7.4999, -0.2604, -1.6212, -0.7559, -0.5993], [0.0069, 0.0124, 0.9996, 0.0373]],
  [[0.1694, 0.6985, 4.8962, 5.9326, 8.3203, 0.0277, 0.5028, 0.7037, 0.0905, 0.0042, -5.6221, -0.2426, -0.4031, -1.4874, -3.8659, -0.1159, -4.1189, -0.2508, 0.2211, 0.264, 0.1851, 0, 0, 1, 1, 0, -1.4966, -0.2508, 0.6264, 0.7263, 0.9892, -3.2233, -0.4661, -0.2214, -1.2487, -3.2854], [0.0023, 0.006, 0.0135, 0.0012]],
]
