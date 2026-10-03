import * as THREE from 'three'

import { AudioAnalysedDataForVisualization } from '../../audioanalysis/audio-analysed-data'
import { CameraManager } from '../camera-manager'
import { HopalongVisualizer } from '../hopalong-visualizer'
import { Layer } from './layer'

/**
 * Orbit (Hopalong particles) as a layer. Spike scope: no particle crossfade and no video plane (the Video layer
 * owns the video), and no bloom or shockwave (those run once on the final composite).
 */
export class OrbitLayer implements Layer {
  private readonly cameraManager = new CameraManager()
  private readonly visualizer = new HopalongVisualizer()

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.cameraManager.init()
    this.visualizer.init()
  }

  render = (target: THREE.WebGLRenderTarget, deltaTime: number, audio: AudioAnalysedDataForVisualization): void => {
    this.visualizer.update(deltaTime, audio)
    if (this.visualizer.videoPlane) this.visualizer.videoPlane.visible = false
    this.renderer.setRenderTarget(target)
    this.renderer.setClearColor(0x000000, 1)
    this.renderer.clear()
    this.renderer.render(this.visualizer.getScene(), this.cameraManager.getCamera())
    this.renderer.setRenderTarget(null)
    this.cameraManager.manageCameraPosition(deltaTime)
  }

  resize = (): void => {
    this.cameraManager.onResize()
  }

  dispose = (): void => {
    this.visualizer.destroyVisualization()
  }
}
