import * as THREE from 'three'
import { EffectComposer, ShockWaveEffect, RenderPass, BloomEffect, EffectPass } from 'postprocessing'

import { HopalongVisualizer } from './hopalong-visualizer'
import { CameraManager } from './camera-manager'
import { AudioAnalysedDataForVisualization } from '../audioanalysis/audio-analysed-data'
import { PARTICLE_CROSSFADE_DURATION_MS, MAX_CROSSFADE_GENERATIONS } from '../config/visualizer.config'

type ParticleCrossfade = {
  outgoing: HopalongVisualizer
  elapsedMs: number
  durationMs: number
}

export class HopalongManager {
  private elapsedTime: number
  private cameraManager: CameraManager | null
  private hopalongVisualizer: HopalongVisualizer | null
  private renderer: THREE.WebGLRenderer | null
  private composer: EffectComposer | null
  private clock: THREE.Clock | null
  private bloomEffect: BloomEffect | null
  private shockwaveEffect: ShockWaveEffect | null
  private effectPass: EffectPass | null
  private lastAudioData: AudioAnalysedDataForVisualization | null
  /** Older generations still fading out, oldest first. */
  private crossfades: ParticleCrossfade[]
  /** Current (newest) visualizer's own fade-in progress. */
  private incomingElapsedMs: number

  constructor() {
    this.elapsedTime = 0
    this.cameraManager = null
    this.lastAudioData = null
    this.hopalongVisualizer = null
    this.renderer = null
    this.composer = null
    this.clock = null
    this.bloomEffect = null
    this.shockwaveEffect = null
    this.effectPass = null
    this.crossfades = []
    this.incomingElapsedMs = PARTICLE_CROSSFADE_DURATION_MS
  }

  init = (_startTimer: Date): void => {
    this.cameraManager = new CameraManager()
    this.cameraManager.init()

    this.hopalongVisualizer = new HopalongVisualizer()
    this.hopalongVisualizer.init()

    this.clock = new THREE.Clock()

    this.renderer = new THREE.WebGLRenderer({ antialias: false })
    this.renderer.setClearColor(0x000000, 1)
    // Keep default outputEncoding (LinearEncoding). Old gammaOutput/gammaInput ctor
    // flags were ignored by Three r125; forcing sRGBEncoding changed video/texture look.
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    document.body.appendChild(this.renderer.domElement)

    this.setupEffects()
    window.setVirtualCameraPosition = (x: number, y: number) => this.cameraManager!.setVirtualMousePosition(x, y)
    window.getVirtualCameraPosition = () => ({ x: this.cameraManager!.mouseX, y: this.cameraManager!.mouseY })
    window.getAudioData = () => this.lastAudioData
    // Default: all visible bands enabled; bri/air (6–7) disabled (near-ultrasonic)
    window.enabledFreqBands = [true, true, true, true, true, true, false, false]
    document.addEventListener('mousemove', this.onDocumentMouseMove)
    document.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('resize', this.onWindowResize)
  }

  setupEffects = (): void => {
    this.composer = new EffectComposer(this.renderer!)
    this.composer.addPass(new RenderPass(this.hopalongVisualizer!.getScene(), this.cameraManager!.getCamera()))
    this.bloomEffect = new BloomEffect()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(this.bloomEffect as any).kernelSize = 1

    const fakeCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight)
    fakeCamera.position.z = 7

    const options = { waveSize: .15, speed: .5, amplitude: .2, maxRadius: 2 }
    this.shockwaveEffect = new ShockWaveEffect(fakeCamera, this.cameraManager!.focusPoint, options)

    this.effectPass = new EffectPass(this.cameraManager!.getCamera(), this.shockwaveEffect, this.bloomEffect)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(this.effectPass as any).renderToScreen = true
    this.composer.addPass(this.effectPass)

    this.clock = new THREE.Clock()
  }

  update = (deltaTime: number, audioData: AudioAnalysedDataForVisualization): void => {
    this.lastAudioData = audioData
    this.elapsedTime += deltaTime

    const peakVal = audioData.peak?.value ?? 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(this.shockwaveEffect as any).speed = (window.config.user.speed.value / 15) + peakVal * 1.25

    if (this.particleConfigChanged()) {
      this.startCrossfade()
    }
    this.hopalongVisualizer!.update(deltaTime, audioData)
    this.crossfades.forEach((cf) => cf.outgoing.update(deltaTime, audioData))
    this.advanceCrossfades(deltaTime)

    if (window.config.effects.glow.value && audioData.peak) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(this.bloomEffect as any).blendMode.opacity.value = audioData.peak.value * audioData.peak.energy
    }

    const enabledBands = window.enabledFreqBands ?? [true, true, true, true, true, false, false, false]
    const allEnabled = enabledBands.every(Boolean)
    const anyEnabledBandElevated = allEnabled || (audioData.multibandEnergy?.some((e, i) => {
      if (!enabledBands[i]) return false
      const avg = audioData.multibandEnergyAverage?.[i] ?? 0
      return avg > 0 && e / avg > 1.0
    }) ?? true)
    if (audioData.peak && audioData.peak.value > 0.8 && anyEnabledBandElevated && window.config.effects.shockwave.value) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(this.shockwaveEffect as any).explode()
    }
    this.composer!.render(this.clock!.getDelta())

    this.cameraManager!.manageCameraPosition()
  }

  particleConfigChanged = (): boolean => {
    let hasChanged = false
    Object.keys(window.config.particle).forEach((setting) => {
      const particleSection = window.config.particle as Record<string, { value: unknown }>
      const visualizer = this.hopalongVisualizer as unknown as Record<string, unknown>
      if (visualizer[setting] !== particleSection[setting]?.value) {
        hasChanged = true
      }
    })
    return hasChanged
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
  startCrossfade = (): void => {
    // Adding a new generation would exceed the cap -- force-finish the oldest still-fading
    // one(s) immediately to make room, rather than growing the list unbounded.
    while (this.crossfades.length >= MAX_CROSSFADE_GENERATIONS - 1) {
      this.finalizeOutgoing(this.crossfades.shift()!)
    }

    const outgoing = this.hopalongVisualizer!
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
    // incoming's scene, since that's the only scene the composer's RenderPass points at; a
    // generation left behind in an intermediate visualizer's scene would stop being rendered.
    const liveObjects = [outgoing, ...this.crossfades.map((cf) => cf.outgoing)].flatMap((v) => v.objects)
    liveObjects.forEach((obj) => incoming.scene.add(obj))
    this.setParticleOpacity(incoming, 0)

    this.hopalongVisualizer = incoming
    this.incomingElapsedMs = 0
    this.crossfades.push({ outgoing, elapsedMs: 0, durationMs: PARTICLE_CROSSFADE_DURATION_MS })
    this.setupEffects()
  }

  advanceCrossfades = (deltaTime: number): void => {
    if (this.incomingElapsedMs < PARTICLE_CROSSFADE_DURATION_MS) {
      this.incomingElapsedMs = Math.min(PARTICLE_CROSSFADE_DURATION_MS, this.incomingElapsedMs + deltaTime)
      this.setParticleOpacity(this.hopalongVisualizer!, this.incomingElapsedMs / PARTICLE_CROSSFADE_DURATION_MS)
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

  finalizeOutgoing = (cf: ParticleCrossfade): void => {
    // Move the outgoing particle systems back into their own (unrendered) scene so
    // outgoing.destroyVisualization()'s disposeScene() can dispose their geometry/material/
    // textures through its existing traversal, instead of duplicating that logic here.
    cf.outgoing.objects.forEach((obj) => cf.outgoing.scene.add(obj))
    cf.outgoing.destroyVisualization()
  }

  setParticleOpacity = (visualizer: HopalongVisualizer, opacity: number): void => {
    visualizer.objects.forEach((obj) => {
      obj.myMaterial.opacity = opacity
    })
  }

  onDocumentMouseMove = (event: MouseEvent): void => {
    this.cameraManager!.updateMousePosition(event)
  }

  onWindowResize = (): void => {
    console.info('resizing.....')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(this.composer as any).setSize(window.innerWidth, window.innerHeight)
    this.renderer!.setPixelRatio(window.devicePixelRatio)
    this.renderer!.setSize(window.innerWidth, window.innerHeight)
    this.cameraManager!.onResize()
  }

  onKeyDown = (event: KeyboardEvent): void => {
    if (event.keyCode === 38 && window.config.user.speed.value < window.config.user.speed.max)
      window.config.user.speed.value += 0.5
    else if (event.keyCode === 40 && window.config.user.speed.value > window.config.user.speed.min)
      window.config.user.speed.value -= 0.5
    else if (event.keyCode === 37 && window.config.user.rotationSpeed.value < window.config.user.rotationSpeed.max)
      window.config.user.rotationSpeed.value += 0.25
    else if (event.keyCode === 39 && window.config.user.rotationSpeed.value > window.config.user.rotationSpeed.min)
      window.config.user.rotationSpeed.value -= 0.25
  }
}
