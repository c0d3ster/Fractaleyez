import { describe, expect, it } from 'vitest'

import { GpuResult, GpuTimer, TimerGl } from './gpu-timer'

const EXT = { TIME_ELAPSED_EXT: 0x88bf, GPU_DISJOINT_EXT: 0x8fbb }

type FakeQuery = { id: number; ready: boolean; ns: number }

// A stand-in for the context: queries finish when the test says so.
const makeGl = (): { gl: TimerGl; queries: FakeQuery[]; deleted: number[]; setDisjoint: (on: boolean) => void; active: () => boolean } => {
  const queries: FakeQuery[] = []
  const deleted: number[] = []
  let disjoint = false
  let active: FakeQuery | null = null
  const gl: TimerGl = {
    QUERY_RESULT: 1,
    QUERY_RESULT_AVAILABLE: 2,
    createQuery: () => {
      const query: FakeQuery = { id: queries.length, ready: false, ns: 0 }
      queries.push(query)
      return query as unknown as WebGLQuery
    },
    deleteQuery: (query) => { deleted.push((query as unknown as FakeQuery).id) },
    beginQuery: (_target, query) => {
      if (active) throw new Error('timer queries cannot nest')
      active = query as unknown as FakeQuery
    },
    endQuery: () => { active = null },
    getQueryParameter: (query, parameter) => {
      const fake = query as unknown as FakeQuery
      return parameter === 2 ? fake.ready : fake.ns
    },
    getParameter: () => disjoint,
  }
  return { gl, queries, deleted, setDisjoint: (on) => { disjoint = on }, active: () => active !== null }
}

const run = (timer: GpuTimer, name: string, tag = 0): void => {
  timer.begin(name, tag)
  timer.end(name)
}

const collected = (timer: GpuTimer): GpuResult[] => {
  const results: GpuResult[] = []
  timer.collect((result) => results.push(result))
  return results
}

describe('GpuTimer', () => {
  it('returns results in order, in milliseconds, once they are ready', () => {
    const { gl, queries } = makeGl()
    const timer = new GpuTimer(gl, EXT)
    run(timer, 'fractal', 7)
    run(timer, 'orbit', 7)
    expect(collected(timer)).toEqual([])
    Object.assign(queries[0]!, { ready: true, ns: 2_500_000 })
    expect(collected(timer)).toEqual([{ name: 'fractal', ms: 2.5, tag: 7 }])
    Object.assign(queries[1]!, { ready: true, ns: 1_000_000 })
    expect(collected(timer)).toEqual([{ name: 'orbit', ms: 1, tag: 7 }])
  })

  it('waits at the first unfinished query rather than skipping ahead', () => {
    const { gl, queries } = makeGl()
    const timer = new GpuTimer(gl, EXT)
    run(timer, 'a')
    run(timer, 'b')
    queries[1]!.ready = true
    expect(collected(timer)).toEqual([])
  })

  it('refuses a section that would nest inside another and counts it', () => {
    const { gl, active } = makeGl()
    const timer = new GpuTimer(gl, EXT)
    expect(timer.begin('outer')).toBe(true)
    expect(timer.begin('inner')).toBe(false)
    timer.end('inner')
    expect(active()).toBe(true)
    timer.end('outer')
    expect(active()).toBe(false)
    expect(timer.getFaults()).toEqual({ refused: 1, disjoint: 0, invalid: 0 })
  })

  it('reuses query objects instead of creating new ones every frame', () => {
    const { gl, queries } = makeGl()
    const timer = new GpuTimer(gl, EXT)
    for (let frame = 0; frame < 20; frame++) {
      run(timer, 'layer')
      queries.forEach((query) => { query.ready = true })
      collected(timer)
    }
    expect(queries).toHaveLength(1)
  })

  it('drops waiting results after a disjoint event and keeps working', () => {
    const { gl, queries, setDisjoint } = makeGl()
    const timer = new GpuTimer(gl, EXT)
    run(timer, 'a')
    queries[0]!.ready = true
    setDisjoint(true)
    expect(collected(timer)).toEqual([])
    expect(timer.getFaults().disjoint).toBe(1)
    setDisjoint(false)
    run(timer, 'b')
    queries.forEach((query) => { query.ready = true; query.ns = 3_000_000 })
    expect(collected(timer)).toEqual([{ name: 'b', ms: 3, tag: 0 }])
  })

  it('drops an impossible reading and counts it', () => {
    const { gl, queries } = makeGl()
    const timer = new GpuTimer(gl, EXT)
    run(timer, 'broken')
    run(timer, 'fine')
    Object.assign(queries[0]!, { ready: true, ns: 18_446_744_073_709_552_000 })
    Object.assign(queries[1]!, { ready: true, ns: 1_500_000 })
    expect(collected(timer)).toEqual([{ name: 'fine', ms: 1.5, tag: 0 }])
    expect(timer.getFaults().invalid).toBe(1)
  })

  it('deletes every query on dispose', () => {
    const { gl, queries, deleted } = makeGl()
    const timer = new GpuTimer(gl, EXT)
    run(timer, 'a')
    run(timer, 'b')
    timer.dispose()
    expect(deleted.sort()).toEqual(queries.map(({ id }) => id))
  })
})
