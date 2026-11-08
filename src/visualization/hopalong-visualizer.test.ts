import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AudioAnalysedDataForVisualization } from '../audioanalysis/audio-analysed-data'
import { AppConfig, configDefaults } from '../config/configDefaults'
import { HopalongVisualizer } from './hopalong-visualizer'
import { geometryGroupCount, isReshapedOnBeat } from './orbit-geometry-groups'

// No GL and no network: sprites are plain textures.
vi.mock('../utils/textureCache', () => ({
  acquireSpriteTexture: (): THREE.Texture => new THREE.Texture(),
  releaseSpriteTexture: (): void => undefined,
}))
vi.mock('../utils/spriteCache', () => ({ getResolvedSpriteUrl: (url: string): string => url }))

type TestWindow = { config: AppConfig }

const setConfig = (levels: number, layers: number, particlesPerLayer = 40): void => {
  const config = structuredClone(configDefaults)
  config.particle.levels.value = levels
  config.particle.layers.value = layers
  config.particle.particlesPerLayer.value = particlesPerLayer
  config.effects.switcheroo.value = true
  ;(globalThis as unknown as { window: TestWindow }).window = { config }
}

const beat = { beat: { fresh: true, active: true, value: 1, energy: 1 }, energy: 0, energyAverage: 0 } as unknown as AudioAnalysedDataForVisualization

const positionAttribute = (geometry: THREE.BufferGeometry): THREE.BufferAttribute => geometry.attributes.position as THREE.BufferAttribute

const positions = (geometry: THREE.BufferGeometry): number[] => Array.from(positionAttribute(geometry).array as Float32Array)

// The buffers are float32 (z is never written, so it stays 0), the orbit is float64.
const asBuffer = (subset: Array<{ vertex: THREE.Vector3 }>): number[] =>
  subset.flatMap(({ vertex }) => [vertex.x, vertex.y, vertex.z].map(Math.fround))

const uniqueGeometries = (viz: HopalongVisualizer): THREE.BufferGeometry[] => [...new Set(viz.objects.map((obj) => obj.geometry))]

// What each system's buffer looked like before the beat, copied, so a later change is visible even though geometries are shared.
const snapshot = (viz: HopalongVisualizer): number[][] => viz.objects.map((obj) => positions(obj.geometry))

const made: HopalongVisualizer[] = []
const build = (levels: number, layers: number): HopalongVisualizer => {
  setConfig(levels, layers)
  const viz = new HopalongVisualizer()
  viz.init()
  made.push(viz)
  return viz
}

describe('HopalongVisualizer geometry sharing', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    made.splice(0).forEach((viz) => viz.destroyVisualization())
    vi.useRealTimers()
  })

  it.each([[3, 3], [5, 4], [4, 5], [6, 2], [1, 3]])('builds one system per level and subset, on the planned number of geometries (levels %i, layers %i)', (levels, layers) => {
    const viz = build(levels, layers)
    expect(viz.objects).toHaveLength(levels * layers)
    expect(uniqueGeometries(viz)).toHaveLength(geometryGroupCount(levels, layers))
  })

  it('gives every system the positions of its own subset', () => {
    const viz = build(4, 3)
    viz.objects.forEach((obj) => {
      expect(positions(obj.geometry)).toEqual(asBuffer(viz.orbit.subsets[obj.mySubset]!))
    })
  })

  it.each([[3, 3], [5, 4], [4, 5]])('on a beat reshapes the systems at even indexes and leaves the others (levels %i, layers %i)', (levels, layers) => {
    const viz = build(levels, layers)
    const before = snapshot(viz)
    viz.update(16, beat)
    viz.objects.forEach((obj, index) => {
      const now = positions(obj.geometry)
      if (isReshapedOnBeat(index)) expect(now, `system ${index} reshaped`).toEqual(asBuffer(viz.orbit.subsets[obj.mySubset]!))
      else expect(now, `system ${index} untouched`).toEqual(before[index])
    })
  })

  it.each([[5, 4], [3, 3]])('uploads each shared buffer once per beat, not once per system, and only if a reshaped system uses it (levels %i, layers %i)', (levels, layers) => {
    const viz = build(levels, layers)
    const geometries = uniqueGeometries(viz)
    const versions = geometries.map((geometry) => positionAttribute(geometry).version)
    viz.update(16, beat)
    geometries.forEach((geometry, i) => {
      const reshaped = viz.objects.some((obj, index) => obj.geometry === geometry && isReshapedOnBeat(index))
      expect(positionAttribute(geometry).version - versions[i]!).toBe(reshaped ? 1 : 0)
    })
  })

  it('does not touch any buffer when Switcheroo is off', () => {
    const viz = build(4, 3)
    ;(globalThis as unknown as { window: TestWindow }).window.config.effects.switcheroo.value = false
    const before = snapshot(viz)
    viz.update(16, beat)
    expect(snapshot(viz)).toEqual(before)
  })
})
