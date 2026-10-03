import * as THREE from 'three'

import { AudioAnalysedDataForVisualization } from '../../audioanalysis/audio-analysed-data'
import { JuliaVisualizer } from '../julia-visualizer'
import { Layer } from './layer'

/** Fractal (Julia set) as a layer, drawn headless: no own renderer or canvas. */
export class FractalLayer implements Layer {
  private readonly visualizer = new JuliaVisualizer()

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.visualizer.init(true)
  }

  render = (target: THREE.WebGLRenderTarget, deltaTime: number, audio: AudioAnalysedDataForVisualization): void => {
    this.visualizer.update(deltaTime, audio)
    this.visualizer.renderTo(this.renderer, target)
  }

  // The visualizer tracks window size itself (uAspect); only the target size changes, and the compositor owns that.
  resize = (): void => {}

  dispose = (): void => {
    this.visualizer.dispose()
  }
}
