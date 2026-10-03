import * as THREE from 'three'

import { AudioAnalysedDataForVisualization } from '../../audioanalysis/audio-analysed-data'
import { LayerCompositor } from './compositor'
import { FractalLayer } from './fractal-layer'
import { OrbitLayer } from './orbit-layer'
import { PostEffects } from './post-effects'
import { VideoLayer } from './video-layer'

export type LayerPipeline = {
  render: (deltaTime: number, audio: AudioAnalysedDataForVisualization) => void
  triggerShockwave: () => void
  /** Where the camera pad's trailing dot sits: the fractal's steering when it is the only camera-driven layer, else the orbit camera. */
  getCameraSteer: () => { x: number; y: number }
  dispose: () => void
}

/** One renderer and canvas; Video, Orbit and Fractal draw to their own targets, composed in `layers.order`, then bloom and shockwave. */
export const createLayerPipeline = (): LayerPipeline => {
  const renderer = new THREE.WebGLRenderer({ antialias: false })
  renderer.setClearColor(0x000000, 1)
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.domElement.style.position = 'fixed'
  renderer.domElement.style.inset = '0'
  document.body.appendChild(renderer.domElement)

  const orbit = new OrbitLayer(renderer)
  const fractal = new FractalLayer(renderer)
  const video = new VideoLayer(renderer)
  const compositor = new LayerCompositor(renderer, { orbit, fractal, video })
  const effects = new PostEffects(renderer, compositor.getScene(), compositor.getCamera(), orbit.getCameraTrailPosition)

  const onResize = (): void => {
    renderer.setSize(window.innerWidth, window.innerHeight)
    const { x, y } = renderer.getDrawingBufferSize(new THREE.Vector2())
    compositor.resize(x, y)
    effects.resize(window.innerWidth, window.innerHeight)
  }
  window.addEventListener('resize', onResize)

  return {
    render: (deltaTime, audio) => {
      compositor.renderLayers(deltaTime, audio, window.config.layers)
      effects.render(audio)
    },
    triggerShockwave: effects.triggerShockwave,
    getCameraSteer: () => {
      const { orbit: orbitMeta, fractal: fractalMeta } = window.config.layers.meta
      return !orbitMeta.enabled.value && fractalMeta.enabled.value ? fractal.getSteerPosition() : orbit.getCameraTrailPosition()
    },
    dispose: () => {
      window.removeEventListener('resize', onResize)
      effects.dispose()
      compositor.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
