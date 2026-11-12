import { describe, expect, it } from 'vitest'

import { DRUM_KINDS, DrumHits, drumProbabilities, type DrumCandidate, type DrumKind } from '../../src/drums/drum-hits'
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

  // The candidate is read on levels between frames, which the model was not trained on (the model before this one read the first kick as a
  // clap as well here).
  it('calls the kick, the hats and the clap of a kit, the clap and the kick together, at 240 fps', () => expectKit(240))

  // Known gap, failing on purpose until the model is retrained (scripts/section-eval/DRUM-HITS.md): when it passes, make it a plain `it` again.
  // A snare with a strong body and nothing around it reads as half a kick (snare 0.47 and 0.59 against its 0.8, kick 0.69).
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
  [[9.9391, 18.122, 22.197, 6.1484, 3.7651, 0.2626, 0.9468, 0.4376, 0.4784, 0.6955, -1.2477, -0.0358, -1.6476, -7.1017, -6.8407, 1.8227, 1.3091, 1.9665, 1.0165, -3.2775, -0.829, 0, 1, 1, 1, 1, 1.3091, 2.1039, 2.6723, 0.8276, 0.2954, -1.617, -0.2676, -0.3611, -3.3659, -6.0856], [0.9409, 0.0157, 0.0197, 0.0066]],
  [[6.5673, 7.5489, 5.2989, 12.2182, 5.704, 0.5575, 0.6748, 0.6679, 0.8141, 0.7584, -1.2502, -0.0633, -1.6701, -1.3242, -1.9758, 0.5817, 0.6246, 0.676, -0.409, 0.8729, 0.3104, 0, 1, 1, 1, 1, 0.6246, 0.8572, 0.5597, 1.2543, 0.449, -1.4796, -0.1114, -0.9308, -1.1722, -2.0666], [0.7665, 0.2689, 0.9175, 0.3088]],
  [[4.7697, 6.9448, 9.2136, -3.1176, -8.9648, 0.9243, 0.7179, 0.375, 0.0848, 0.2913, -0.0838, -0.7963, -1.8071, -6.0075, -6.0075, 0.2672, 0.2323, 0.4673, 0.7298, -1.8434, -1.3227, 0, 1, 1, 0, 0, 0.2323, 0.6727, 0.9211, -0.4673, -1.3227, -0.1273, -0.6344, -1.6592, -4.6749, -6.051], [0.0472, 0.0081, 0.0002, 0.0001]],
]
