import * as THREE from 'three'

import { AudioAnalysedDataForVisualization } from '../../audioanalysis/audio-analysed-data'
import { LayerKey, LayersConfigSection } from '../../config/configDefaults'
import { BLEND_CODES, compositeFragmentShader, compositeVertexShader, MAX_COMPOSITE_LAYERS } from './composite.glsl'
import { Layer } from './layer'
import { getParticleCrossfadeDurationMs } from '../../config/visualizer.config'
import { stepOpacity } from './fade'
import { planLayers, targetOpacity } from './plan'

export type LayerCompositorOptions = {
  /** Per-layer render target scale against the drawing buffer (default 1). Soft layers can go below 1. */
  resolutionScale?: Partial<Record<LayerKey, number>>
}

/**
 * Draws each planned layer into its own render target, then composites them to the screen in one pass. Targets are
 * created on a layer's first visible frame and kept, so a layer that never shows never allocates one. The composite
 * pass is a scene of its own (getScene/getCamera) so post effects can take it as their input instead of the screen.
 */
export class LayerCompositor {
  private readonly targets = new Map<LayerKey, THREE.WebGLRenderTarget>()
  private readonly effectiveOpacity: Partial<Record<LayerKey, number>> = {}
  private readonly wasActive: Partial<Record<LayerKey, boolean>> = {}
  private readonly blank: THREE.DataTexture
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly material: THREE.ShaderMaterial
  private readonly quad: THREE.Mesh

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly layers: Partial<Record<LayerKey, Layer>>,
    private readonly options: LayerCompositorOptions = {},
  ) {
    this.blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
    this.blank.needsUpdate = true
    const uniforms: Record<string, THREE.IUniform> = {
      uOpacity: { value: new Array<number>(MAX_COMPOSITE_LAYERS).fill(0) },
      uBlend: { value: new Array<number>(MAX_COMPOSITE_LAYERS).fill(BLEND_CODES.mask) },
      uCount: { value: 0 },
    }
    for (let i = 0; i < MAX_COMPOSITE_LAYERS; i++) uniforms[`uLayer${i}`] = { value: this.blank }
    this.material = new THREE.ShaderMaterial({
      vertexShader: compositeVertexShader,
      fragmentShader: compositeFragmentShader,
      uniforms,
      depthTest: false,
      depthWrite: false,
    })
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
    this.scene.add(this.quad)
  }

  getScene = (): THREE.Scene => this.scene

  getCamera = (): THREE.OrthographicCamera => this.camera

  /** Draws every planned layer into its target and points the composite pass at them. */
  renderLayers = (deltaTime: number, audio: AudioAnalysedDataForVisualization, config: LayersConfigSection): void => {
    const planned = planLayers(config, this.stepOpacities(deltaTime, config)).filter(({ key }) => this.layers[key]?.isActive?.() ?? Boolean(this.layers[key]))
    const opacities: number[] = this.material.uniforms.uOpacity!.value
    const blends: number[] = this.material.uniforms.uBlend!.value
    planned.forEach(({ key, opacity, blendMode }, slot) => {
      const target = this.getTarget(key)
      this.layers[key]!.render(target, deltaTime, audio)
      this.material.uniforms[`uLayer${slot}`]!.value = target.texture
      opacities[slot] = opacity
      blends[slot] = BLEND_CODES[blendMode]
    })
    for (let slot = planned.length; slot < MAX_COMPOSITE_LAYERS; slot++) {
      this.material.uniforms[`uLayer${slot}`]!.value = this.blank
      opacities[slot] = 0
      blends[slot] = BLEND_CODES.mask
    }
    this.material.uniforms.uCount!.value = planned.length
  }

  /**
   * Eases each layer's effective opacity toward its target over the shared particle crossfade duration. A layer seen
   * for the first time starts at its target, so nothing fades in on load.
   */
  private stepOpacities = (
    deltaTime: number,
    { order, meta }: LayersConfigSection,
  ): Partial<Record<LayerKey, number>> => {
    const durationMs = getParticleCrossfadeDurationMs()
    order.forEach((key) => {
      const layer = this.layers[key]
      const target = layer?.isFadingOut?.() ? 0 : targetOpacity(meta, key)
      const active = layer?.isActive?.() ?? Boolean(layer)
      // A layer that just became active (e.g. the first video clip was selected) fades in from 0. Not on first sight, so nothing fades in on load.
      const startsFromZero = this.wasActive[key] === false && active
      this.wasActive[key] = active
      const current = startsFromZero ? 0 : this.effectiveOpacity[key]
      const next = current === undefined ? target : stepOpacity(current, target, deltaTime, durationMs)
      this.effectiveOpacity[key] = next
      if (next === 0 && target === 0) this.layers[key]?.onHidden?.()
    })
    return this.effectiveOpacity
  }

  /** Draws the composite pass straight to the screen. */
  composite = (): void => {
    this.renderer.setRenderTarget(null)
    this.renderer.render(this.scene, this.camera)
  }

  resize = (width: number, height: number): void => {
    this.targets.forEach((target, key) => {
      const [w, h] = this.targetSize(key, width, height)
      target.setSize(w, h)
    })
    Object.values(this.layers).forEach((layer) => layer?.resize(width, height))
  }

  dispose = (): void => {
    this.targets.forEach((target) => target.dispose())
    this.targets.clear()
    Object.values(this.layers).forEach((layer) => layer?.dispose())
    this.blank.dispose()
    this.material.dispose()
    this.quad.geometry.dispose()
  }

  private getTarget = (key: LayerKey): THREE.WebGLRenderTarget => {
    const existing = this.targets.get(key)
    if (existing) return existing
    const { x, y } = this.renderer.getDrawingBufferSize(new THREE.Vector2())
    const [w, h] = this.targetSize(key, x, y)
    const target = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true })
    this.targets.set(key, target)
    return target
  }

  private targetSize = (key: LayerKey, width: number, height: number): [number, number] => {
    const scale = this.options.resolutionScale?.[key] ?? 1
    return [Math.max(1, Math.floor(width * scale)), Math.max(1, Math.floor(height * scale))]
  }
}
