import * as THREE from 'three'

import { AudioAnalysedDataForVisualization } from '../../audioanalysis/audio-analysed-data'
import { DEFAULT_ENABLED_BANDS } from '../../audioanalysis/onset-bands'
import { getParticleCrossfadeDurationMs, MAX_CROSSFADE_GENERATIONS } from '../../config/visualizer.config'
import { CameraManager } from '../camera-manager'
import { HopalongVisualizer } from '../hopalong-visualizer'
import { Layer } from './layer'

type ParticleCrossfade = {
  outgoing: HopalongVisualizer
  elapsedMs: number
  durationMs: number
}

/**
 * Orbit (Hopalong particles) as a layer. Owns the orbit camera and the particle crossfades between generations. Bloom
 * and shockwave run once on the final composite.
 */
export class OrbitLayer implements Layer {
  private readonly cameraManager = new CameraManager()
  private visualizer = new HopalongVisualizer()
  /** Older generations still fading out, oldest first. */
  private crossfades: ParticleCrossfade[] = []
  /** Current (newest) visualizer's own fade-in progress. */
  private incomingElapsedMs = getParticleCrossfadeDurationMs()

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.cameraManager.init()
    this.visualizer.init()
    window.setVirtualCameraPosition = (x: number, y: number) => this.cameraManager.setVirtualMousePosition(x, y)
    window.getVirtualCameraPosition = () => ({ x: this.cameraManager.mouseX, y: this.cameraManager.mouseY })
    // Which bands can set off a beat; the Frequency HUD changes it (and a saved selection replaces it).
    window.enabledFreqBands = [...DEFAULT_ENABLED_BANDS]
    document.addEventListener('mousemove', this.onDocumentMouseMove)
    document.addEventListener('keydown', this.onKeyDown)
  }

  render = (target: THREE.WebGLRenderTarget, deltaTime: number, audio: AudioAnalysedDataForVisualization): void => {
    if (this.particleConfigChanged()) this.startCrossfade()
    this.visualizer.update(deltaTime, audio)
    this.crossfades.forEach((cf) => cf.outgoing.update(deltaTime, audio))
    this.advanceCrossfades(deltaTime)
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
    document.removeEventListener('mousemove', this.onDocumentMouseMove)
    document.removeEventListener('keydown', this.onKeyDown)
    delete window.setVirtualCameraPosition
    delete window.getVirtualCameraPosition
    this.crossfades.forEach(this.finalizeOutgoing)
    this.crossfades = []
    this.visualizer.destroyVisualization()
  }

  /** Where the camera has actually got to, in the camera pad's units (its y chases the pad's y inverted). */
  getCameraTrailPosition = (): { x: number; y: number } => {
    const { position } = this.cameraManager.getCamera()
    return { x: position.x, y: -position.y }
  }

  private particleConfigChanged = (): boolean => {
    const particleSection: Record<string, { value: unknown }> = window.config.particle
    const visualizer = this.visualizer as unknown as Record<string, unknown>
    return Object.keys(particleSection).some((setting) => visualizer[setting] !== particleSection[setting]?.value)
  }

  /**
   * Particle Config changes require rebuilding the particle system from scratch (new
   * geometry/material per particle), so we can't tween the old system into the new one --
   * instead run both simultaneously, reparented into the same live scene, and crossfade
   * their opacity so there's never a frame where particles are just gone. Up to
   * MAX_CROSSFADE_GENERATIONS generations (1 incoming + N-1 still-fading outgoing) can be
   * alive at once, each fading out independently on its own timeline, rather than always
   * truncating whatever was fading when the next change lands.
   */
  private startCrossfade = (): void => {
    // Adding a new generation would exceed the cap -- force-finish the oldest still-fading
    // one(s) immediately to make room, rather than growing the list unbounded.
    while (this.crossfades.length >= MAX_CROSSFADE_GENERATIONS - 1) {
      this.finalizeOutgoing(this.crossfades.shift()!)
    }

    const outgoing = this.visualizer
    // It may still be mid-fade-in itself -- snap to full opacity before demoting it to an
    // outgoing generation, so its own fade-out starts from fully visible instead of jumping
    // from wherever its fade-in had gotten to.
    this.setParticleOpacity(outgoing, 1)
    // window.config already reflects the incoming preset by the time this runs, and outgoing
    // still polls it (updateOrbit()'s interval, switcheroo's regenerate) -- freeze it so it
    // fades out its own last shape instead of reshaping itself around the new preset's orbit
    // params mid-fade.
    outgoing.freezeConfig()
    const incoming = new HopalongVisualizer()
    incoming.init()

    // THREE.Object3D#add() reparents automatically. Every particle object currently alive --
    // outgoing's own plus every still-fading older generation's -- needs to move into the new
    // incoming's scene, since that's the only scene that gets rendered; a generation left
    // behind in an intermediate visualizer's scene would stop being rendered.
    const liveObjects = [outgoing, ...this.crossfades.map((cf) => cf.outgoing)].flatMap((v) => v.objects)
    liveObjects.forEach((obj) => incoming.scene.add(obj))
    this.setParticleOpacity(incoming, 0)

    this.visualizer = incoming
    this.incomingElapsedMs = 0
    this.crossfades.push({ outgoing, elapsedMs: 0, durationMs: getParticleCrossfadeDurationMs() })
  }

  private advanceCrossfades = (deltaTime: number): void => {
    const incomingDurationMs = getParticleCrossfadeDurationMs()
    if (this.incomingElapsedMs < incomingDurationMs) {
      this.incomingElapsedMs = Math.min(incomingDurationMs, this.incomingElapsedMs + deltaTime)
      this.setParticleOpacity(this.visualizer, this.incomingElapsedMs / incomingDurationMs)
    }

    this.crossfades = this.crossfades.filter((cf) => {
      cf.elapsedMs += deltaTime
      const t = Math.min(1, cf.elapsedMs / cf.durationMs)
      this.setParticleOpacity(cf.outgoing, 1 - t)
      if (t < 1) return true
      this.finalizeOutgoing(cf)
      return false
    })
  }

  private finalizeOutgoing = (cf: ParticleCrossfade): void => {
    // Move the outgoing particle systems back into their own (unrendered) scene so
    // outgoing.destroyVisualization()'s disposeScene() can dispose their geometry/material/
    // textures through its existing traversal, instead of duplicating that logic here.
    cf.outgoing.objects.forEach((obj) => cf.outgoing.scene.add(obj))
    cf.outgoing.destroyVisualization()
  }

  private setParticleOpacity = (visualizer: HopalongVisualizer, opacity: number): void => {
    visualizer.objects.forEach((obj) => {
      obj.myMaterial.opacity = opacity
    })
  }

  private onDocumentMouseMove = (event: MouseEvent): void => {
    this.cameraManager.updateMousePosition(event)
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.keyCode === 38 && window.config.user.speed.value < window.config.user.speed.max)
      window.config.user.speed.value += 0.5
    else if (event.keyCode === 40 && window.config.user.speed.value > window.config.user.speed.min)
      window.config.user.speed.value -= 0.5
    else if (event.keyCode === 39 && window.config.user.rotationSpeed.value < window.config.user.rotationSpeed.max)
      window.config.user.rotationSpeed.value += 0.25
    else if (event.keyCode === 37 && window.config.user.rotationSpeed.value > window.config.user.rotationSpeed.min)
      window.config.user.rotationSpeed.value -= 0.25
  }
}
