import { describe, expect, it } from 'vitest'

import type { LayerKey } from '../../config/configDefaults'
import { JoinState, LayerJoin } from './layer-join'

const ORDER: LayerKey[] = ['logo', 'fractal', 'orbit', 'video']

const joinedOf = (join: LayerJoin): LayerKey[] => ORDER.filter(join.has)

describe('LayerJoin', () => {
  it('lets one layer in per frame, in order', () => {
    const join = new LayerJoin(ORDER, () => 'ready')
    const seen: LayerKey[][] = []
    for (let frame = 0; frame < 5; frame++) {
      join.beginFrame()
      seen.push(joinedOf(join))
    }
    expect(seen).toEqual([
      ['logo'],
      ['logo', 'fractal'],
      ['logo', 'fractal', 'orbit'],
      ['logo', 'fractal', 'orbit', 'video'],
      ['logo', 'fractal', 'orbit', 'video'],
    ])
  })

  it('passes over a layer that is off', () => {
    const join = new LayerJoin(ORDER, (key) => (key === 'logo' ? 'off' : 'ready'))
    join.beginFrame()
    expect(joinedOf(join)).toEqual(['fractal'])
  })

  it('holds the later layers back while one waits, for at most two seconds', () => {
    let now = 0
    const states: Partial<Record<LayerKey, JoinState>> = { logo: 'waiting' }
    const join = new LayerJoin(ORDER, (key) => states[key] ?? 'ready', () => now)
    join.beginFrame()
    now = 1000
    join.beginFrame()
    expect(joinedOf(join)).toEqual([])
    states.logo = 'ready'
    join.beginFrame()
    expect(joinedOf(join)).toEqual(['logo'])

    const stuck = new LayerJoin(ORDER, (key) => (key === 'logo' ? 'waiting' : 'ready'), () => now)
    now = 0
    stuck.beginFrame()
    now = 2500
    stuck.beginFrame()
    stuck.beginFrame()
    expect(joinedOf(stuck)).toEqual(['fractal', 'orbit'])
  })
})
