import { describe, expect, it } from 'vitest'
import { BeatActivation, BeatNet, BeatNetModel } from '../../src/grid/beat-net'
import model from '../../src/grid/beat-net-model.json'
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

  it('starts over after a long gap (a hidden tab) instead of running every missed hop in one frame', () => {
    const out: BeatActivation[] = []
    const net = new BeatNet(model, (a) => out.push(a))
    for (let i = 0; i < 60; i++) net.push((i * 1000) / 60, [10, 5, 3, 2, 1])
    const before = out.length
    // Five minutes later: the next frame is a fresh first hop, not 30,000 interpolated ones.
    net.push(300000, [10, 5, 3, 2, 1])
    expect(out.length - before).toBe(1)
    expect(out[out.length - 1]!.t).toBe(300000)
    net.push(300000 + 1000 / 60, [10, 5, 3, 2, 1])
    expect(out[out.length - 1]!.t).toBe(300010)
  })
})
