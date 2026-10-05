import * as THREE from 'three'

import { AudioAnalysedDataForVisualization } from '../../audioanalysis/audio-analysed-data'
import { LayerKey, LayersConfigSection } from '../../config/configDefaults'
import { compositeFragmentShader, compositeVertexShader, MAX_COMPOSITE_LAYERS } from './composite.glsl'
import { Layer } from './layer'
import { planLayers } from './plan'

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
      uScreen: { value: new Array<number>(MAX_COMPOSITE_LAYERS).fill(0) },
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
    const planned = planLayers(config).filter(({ key }) => this.layers[key])
    const opacities: number[] = this.material.uniforms.uOpacity!.value
    const screens: number[] = this.material.uniforms.uScreen!.value
    planned.forEach(({ key, opacity, blendMode }, slot) => {
      const target = this.getTarget(key)
      this.layers[key]!.render(target, deltaTime, audio)
      this.material.uniforms[`uLayer${slot}`]!.value = target.texture
      opacities[slot] = opacity
      screens[slot] = blendMode === 'screen' ? 1 : 0
    })
    for (let slot = planned.length; slot < MAX_COMPOSITE_LAYERS; slot++) {
      this.material.uniforms[`uLayer${slot}`]!.value = this.blank
      opacities[slot] = 0
      screens[slot] = 0
    }
    this.material.uniforms.uCount!.value = planned.length
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
