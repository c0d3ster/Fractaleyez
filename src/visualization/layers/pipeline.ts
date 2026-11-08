import * as THREE from 'three'

import { AudioAnalysedDataForVisualization } from '../../audioanalysis/audio-analysed-data'
import { QualityProfile } from '../../config/quality.config'
import { stepDisplayedColor } from '../../config/displayedColor'
import { perfProbe } from '../perf'
import { ProfileRamp, RampedValues } from '../profile-ramp'
import { QualityController } from '../quality-controller'
import { LayerCompositor } from './compositor'
import { FractalLayer } from './fractal-layer'
import { LogoLayer } from './logo-layer'
import { OrbitLayer } from './orbit-layer'
import { PostEffects } from './post-effects'
import { VideoLayer } from './video-layer'

export type LayerPipeline = {
  render: (deltaTime: number, audio: AudioAnalysedDataForVisualization) => void
  /** Where the camera pad's trailing dot sits: the fractal's steering when it is the only camera-driven layer, else the orbit camera. */
  getCameraSteer: () => { x: number; y: number }
  dispose: () => void
}

/** One renderer and canvas; Video, Orbit, Fractal and Logo draw to their own targets, composed in `layers.order`, then bloom and shockwave. */
export const createLayerPipeline = (quality: QualityController): LayerPipeline => {
  const renderer = new THREE.WebGLRenderer({ antialias: false })
  renderer.setClearColor(0x000000, 1)
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.domElement.style.position = 'fixed'
  renderer.domElement.style.inset = '0'
  document.body.appendChild(renderer.domElement)
  perfProbe.attachGl(renderer.getContext())
  perfProbe.addGauge('three.geometries', () => renderer.info.memory.geometries)
  perfProbe.addGauge('three.textures', () => renderer.info.memory.textures)
  perfProbe.addGauge('three.programs', () => renderer.info.programs?.length ?? 0)

  const orbit = new OrbitLayer(renderer)
  const fractal = new FractalLayer(renderer)
  const video = new VideoLayer(renderer)
  const logo = new LogoLayer(renderer)
  const compositor = new LayerCompositor(renderer, { orbit, fractal, video, logo })
  // The center of the visual: where the fractal's steering has got to while it is drawn (the center its own shockwave
  // ring expands from, so the post-processing wave stays on it), otherwise the Orbit camera's trail.
  const getVisualCenter = (): { x: number; y: number } =>
    window.config.layers.meta.fractal.enabled.value ? fractal.getSteerPosition() : orbit.getCameraTrailPosition()
  const effects = new PostEffects(renderer, compositor.getScene(), compositor.getCamera(), getVisualCenter)
  // Shaders that would otherwise compile the first time a layer or effect is switched on (a freeze of a few hundred ms) compile now, during startup.
  fractal.warm()
  effects.warm()

  // The tier sets how much each layer and effect spends; it is applied now and again whenever Auto or the user changes it. What would show as
  // a jump (the fractal's and the glow's resolution, the logo's filter) moves toward the new tier over a few tenths of a second instead
  // (see profile-ramp.ts, and the fractal's iteration cap eases on its own); the first tier applies at once.
  const ramp = new ProfileRamp()
  const applyRamped = ({ fractalScale, bloomScale, logoBicubic }: Partial<RampedValues>): void => {
    if (fractalScale !== undefined) compositor.setResolutionScale('fractal', fractalScale)
    if (bloomScale !== undefined) effects.setBloomScale(bloomScale)
    if (logoBicubic !== undefined) logo.setSmoothMagnification(logoBicubic)
  }
  const applyProfile = (_tier: unknown, profile: QualityProfile): void => {
    applyRamped(ramp.setTarget(profile))
    fractal.setMaxIterations(profile.fractalIterations)
    video.setUploadFps(profile.videoUploadFps)
  }
  const unsubscribeQuality = quality.subscribe(applyProfile)
  quality.setVideoDropProvider(video.getDropRate)

  const onResize = (): void => {
    renderer.setSize(window.innerWidth, window.innerHeight)
    const { x, y } = renderer.getDrawingBufferSize(new THREE.Vector2())
    compositor.resize(x, y)
    effects.resize(window.innerWidth, window.innerHeight)
  }
  window.addEventListener('resize', onResize)

  return {
    render: (deltaTime, audio) => {
      // The Color config's palette, saturation, phase and cycles ease over the crossfade time; every layer then draws with the same shown colors.
      stepDisplayedColor(deltaTime)
      applyRamped(ramp.step(deltaTime))
      compositor.renderLayers(deltaTime, audio, window.config.layers)
      perfProbe.begin('camera')
      orbit.stepCamera(deltaTime)
      perfProbe.end('camera')
      effects.render(audio)
    },
    getCameraSteer: () => {
      const { orbit: orbitMeta, fractal: fractalMeta } = window.config.layers.meta
      return !orbitMeta.enabled.value && fractalMeta.enabled.value ? fractal.getSteerPosition() : orbit.getCameraTrailPosition()
    },
    dispose: () => {
      window.removeEventListener('resize', onResize)
      unsubscribeQuality()
      quality.setVideoDropProvider(null)
      effects.dispose()
      compositor.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
