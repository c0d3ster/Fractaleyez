import { describe, expect, it } from 'vitest'

import { PerfProbe } from './perf-probe'

const makeProbe = (): { probe: PerfProbe; advance: (ms: number) => void } => {
  let time = 1000
  return { probe: new PerfProbe({ now: () => time }), advance: (ms) => { time += ms } }
}

describe('PerfProbe', () => {
  it('records nothing while off', () => {
    const { probe, advance } = makeProbe()
    probe.frameStart()
    probe.begin('layer.fractal')
    advance(5)
    probe.end('layer.fractal')
    probe.frameEnd()
    probe.count('x')
    expect(probe.summary()).toMatchObject({ enabled: false, frames: 0, sections: {}, counters: {} })
  })

  it('times sections and the whole frame on the CPU', () => {
    const { probe, advance } = makeProbe()
    probe.enable()
    for (let frame = 0; frame < 3; frame++) {
      probe.frameStart()
      probe.begin('layer.fractal')
      advance(4)
      probe.end('layer.fractal')
      probe.begin('post.effects')
      advance(2)
      probe.end('post.effects')
      probe.frameEnd()
      advance(10)
    }
    const summary = probe.summary()
    expect(summary.frames).toBe(3)
    expect(summary.sections['layer.fractal']?.cpu).toMatchObject({ n: 3, p50: 4 })
    expect(summary.sections['post.effects']?.cpu).toMatchObject({ n: 3, p50: 2 })
    expect(summary.cpu).toMatchObject({ n: 3, p50: 6 })
    expect(summary.gpuTimer).toBe('not attached')
  })

  it('counts frame gaps that run long', () => {
    const { probe, advance } = makeProbe()
    probe.enable()
    probe.frameStart()
    advance(16)
    probe.frameStart()
    advance(30)
    probe.frameStart()
    advance(70)
    probe.frameStart()
    advance(5000)
    probe.frameStart()
    const summary = probe.summary()
    expect(summary.gap).toMatchObject({ n: 3, max: 70 })
    expect(summary.gapOver25).toBe(2)
    expect(summary.gapOver50).toBe(1)
  })

  it('measures from a stamp to the next since, once', () => {
    const { probe, advance } = makeProbe()
    probe.enable()
    probe.since('config.change', 'to popup')
    probe.stamp('config.change')
    advance(12)
    probe.since('config.change', 'to popup')
    probe.since('config.change', 'to popup')
    expect(probe.summary().latencies['to popup']).toMatchObject({ n: 1, max: 12 })
  })

  it('forgets samples on reset but keeps working', () => {
    const { probe, advance } = makeProbe()
    probe.enable()
    probe.frameStart()
    probe.begin('a')
    advance(3)
    probe.end('a')
    probe.count('commit')
    probe.reset()
    expect(probe.summary()).toMatchObject({ frames: 0, sections: { a: { cpu: null } }, counters: {} })
    probe.begin('a')
    advance(2)
    probe.end('a')
    expect(probe.summary().sections.a?.cpu).toMatchObject({ n: 1, max: 2 })
  })

  it('reads gauges only when a summary is asked for', () => {
    const { probe } = makeProbe()
    let reads = 0
    probe.addGauge('geometries', () => ++reads)
    expect(reads).toBe(0)
    expect(probe.summary().gauges).toEqual({ geometries: 1 })
    expect(probe.summary().gauges).toEqual({ geometries: 2 })
  })

  it('reports why there is no GPU timing when the extension is missing', () => {
    const { probe } = makeProbe()
    const gl = { createQuery: () => null, getExtension: () => null } as unknown as WebGL2RenderingContext
    probe.attachGl(gl)
    probe.enable()
    expect(probe.summary().gpuTimer).toBe('unavailable')
  })
})
