import * as THREE from 'three'

import { AudioAnalysedDataForVisualization } from '../../audioanalysis/audio-analysed-data'
import { JuliaVisualizer } from '../julia-visualizer'
import { Layer } from './layer'

/** Fractal (Julia set) as a layer, drawn with the compositor's shared renderer. */
export class FractalLayer implements Layer {
  private readonly visualizer = new JuliaVisualizer()

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.visualizer.init()
  }

  render = (target: THREE.WebGLRenderTarget, deltaTime: number, audio: AudioAnalysedDataForVisualization): void => {
    this.visualizer.update(deltaTime, audio)
    this.visualizer.renderTo(this.renderer, target)
  }

  getSteerPosition = (): { x: number; y: number } => this.visualizer.getSteerPosition()

  // The visualizer tracks window size itself (uAspect); only the target size changes, and the compositor owns that.
  resize = (): void => {}

  dispose = (): void => {
    this.visualizer.dispose()
  }
}
