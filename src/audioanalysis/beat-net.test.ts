import { describe, expect, it } from 'vitest'
import { BeatActivation, BeatNet, BeatNetModel } from './beat-net'
import model from './beat-net-model.json'
import fixture from './beat-net.fixture.json'

const run = (net: BeatNetModel, levels: readonly (readonly number[])[], fps: number): BeatActivation[] => {
  const out: BeatActivation[] = []
  const beatNet = new BeatNet(net, (a) => out.push(a))
  levels.forEach((frame, i) => beatNet.push((i * 1000) / fps, frame))
  return out
}

describe('BeatNet', () => {
  it('gives the same beat and downbeat as the PyTorch model it was exported from (beat-net.py fixture)', () => {
    const out = run(model, fixture.levels, fixture.fps)
    expect(out).toHaveLength(fixture.beat.length)
    out.forEach((a, i) => {
      expect(a.beat).toBeCloseTo(fixture.beat[i]!, 4)
      expect(a.downbeat).toBeCloseTo(fixture.downbeat[i]!, 4)
    })
  })

  it('runs on a 10 ms hop grid whatever the frame rate, starting at the first frame', () => {
    const levels = Array.from({ length: 144 }, (_, i) => [10 + (i % 7), 5, 3, 2, 1])
    const out = run(model, levels, 144)
    expect(out[0]!.t).toBe(0)
    expect(out[1]!.t).toBe(10)
    // 143 frames at 144 fps last 993 ms: hops at 0, 10, ..., 990.
    expect(out).toHaveLength(100)
  })
})
