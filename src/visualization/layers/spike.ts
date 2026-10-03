import * as THREE from 'three'

import { AudioAnalysedDataForVisualization } from '../../audioanalysis/audio-analysed-data'
import { LayerCompositor } from './compositor'
import { FractalLayer } from './fractal-layer'
import { OrbitLayer } from './orbit-layer'

export type LayerSpike = {
  canvas: HTMLCanvasElement
  render: (deltaTime: number, audio: AudioAnalysedDataForVisualization) => void
  dispose: () => void
}

// Fractal is soft (smooth palette, no hard edges), so it is the first candidate for a reduced-resolution target.
const FRACTAL_RESOLUTION_SCALE = 0.5

/** Opt-in prototype (`?layerSpike`): Orbit and Fractal composed in `layers.order`. Not the production path. */
export const createLayerSpike = (): LayerSpike => {
  const renderer = new THREE.WebGLRenderer({ antialias: false })
  renderer.setClearColor(0x000000, 1)
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.domElement.style.position = 'fixed'
  renderer.domElement.style.inset = '0'
  document.body.appendChild(renderer.domElement)

  const compositor = new LayerCompositor(
    renderer,
    { orbit: new OrbitLayer(renderer), fractal: new FractalLayer(renderer) },
    { resolutionScale: { fractal: FRACTAL_RESOLUTION_SCALE } },
  )

  const onResize = (): void => {
    renderer.setSize(window.innerWidth, window.innerHeight)
    const { x, y } = renderer.getDrawingBufferSize(new THREE.Vector2())
    compositor.resize(x, y)
  }
  window.addEventListener('resize', onResize)

  return {
    canvas: renderer.domElement,
    render: (deltaTime, audio) => compositor.render(deltaTime, audio, window.config.layers),
    dispose: () => {
      window.removeEventListener('resize', onResize)
      compositor.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
