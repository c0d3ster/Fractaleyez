import * as THREE from 'three'

import type { AudioSnapshot } from '../../audioanalysis/audio-snapshot'
import { JuliaVisualizer } from '../julia-visualizer'
import { Layer } from './layer'

/** Fractal (Julia set) as a layer, drawn with the compositor's shared renderer. */
export class FractalLayer implements Layer {
  private readonly visualizer = new JuliaVisualizer()

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.visualizer.init()
  }

  render = (target: THREE.WebGLRenderTarget, deltaTime: number, audio: AudioSnapshot): void => {
    this.visualizer.update(deltaTime, audio)
    this.visualizer.renderTo(this.renderer, target)
  }

  warm = (): void => {
    this.visualizer.warm(this.renderer)
  }

  setMaxIterations = (iterations: number): void => {
    this.visualizer.setMaxIterations(iterations)
  }

  getSteerPosition = (): { x: number; y: number } => this.visualizer.getSteerPosition()

  // A hidden layer is not updated, so a Switcheroo hop's Tour ghost would stay on the dimmed slider.
  onHidden = (): void => {
    this.visualizer.clearTourGhost()
  }

  // The visualizer tracks window size itself (uAspect); only the target size changes, and the compositor owns that.
  resize = (): void => {}

  dispose = (): void => {
    this.visualizer.dispose()
  }
}
