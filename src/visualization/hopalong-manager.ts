import * as THREE from 'three'
import { EffectComposer, ShockWaveEffect, RenderPass, BloomEffect, EffectPass } from 'postprocessing'

import { HopalongVisualizer } from './hopalong-visualizer'
import { CameraManager } from './camera-manager'
import { AudioAnalysedDataForVisualization } from '../audioanalysis/audio-analysed-data'
import { CAMERA_STEER_SCREEN_FRACTION_PER_PAD_UNIT, getParticleCrossfadeDurationMs, MAX_CROSSFADE_GENERATIONS } from '../config/visualizer.config'

// The shockwave effect projects its position through a fixed camera at this distance and field of view,
// onto a plane at this depth (the camera's focus point depth).
const SHOCKWAVE_CAMERA_FOV = 60
const SHOCKWAVE_CAMERA_Z = 7
const SHOCKWAVE_PLANE_Z = -5

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
  // The shockwave's own world position (not the camera's focus point, which the camera looks at and so
  // always projects to screen center). Moved to the camera pointer before each explosion.
  private shockwavePosition = new THREE.Vector3(0, 0, SHOCKWAVE_PLANE_Z)
  private effectPass: EffectPass | null
  /** Older generations still fading out, oldest first. */
  private crossfades: ParticleCrossfade[]
  /** Current (newest) visualizer's own fade-in progress. */
  private incomingElapsedMs: number
  private videoMask = false
  private videoPlaneVisible = true

  constructor() {
    this.elapsedTime = 0
    this.cameraManager = null
    this.hopalongVisualizer = null
    this.renderer = null
    this.composer = null
    this.clock = null
    this.bloomEffect = null
    this.shockwaveEffect = null
    this.effectPass = null
    this.crossfades = []
    this.incomingElapsedMs = getParticleCrossfadeDurationMs()
  }

  getDomElement = (): HTMLCanvasElement | null => this.renderer?.domElement ?? null

  // Video mask: the video plane is drawn after the particles with a screen blend, so it only shows where the
  // particles are black and leaves the particles themselves untouched.
  setVideoMask = (enabled: boolean): void => {
    this.videoMask = enabled
  }

  // The video element Julia samples for its own mask.
  getVideoElement = (): HTMLVideoElement | null => this.hopalongVisualizer?.video ?? null

  // Hidden when Julia is drawing the video itself, so it isn't drawn twice.
  setVideoPlaneVisible = (visible: boolean): void => {
    this.videoPlaneVisible = visible
  }

  // Run every frame because the visualizer (and its video plane) is recreated on config changes.
  private syncVideoPlaneLook = (): void => {
    const visualizers = [this.hopalongVisualizer!, ...this.crossfades.map((cf) => cf.outgoing)]
    visualizers.forEach(({ videoPlane }) => {
      if (!videoPlane) return
      videoPlane.visible = this.videoPlaneVisible
      const material = videoPlane.material as THREE.MeshBasicMaterial
      const blending = this.videoMask ? THREE.CustomBlending : THREE.NormalBlending
      if (material.blending === blending) return
      material.blending = blending
      material.blendEquation = THREE.AddEquation
      material.blendSrc = THREE.OneMinusDstColorFactor
      material.blendDst = THREE.OneFactor
      material.transparent = this.videoMask
      material.depthTest = !this.videoMask
      material.depthWrite = !this.videoMask
      videoPlane.renderOrder = this.videoMask ? 1 : 0
      material.needsUpdate = true
    })
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
    // Default: all visible bands enabled; bri/air (6–7) disabled (near-ultrasonic)
    window.enabledFreqBands = [true, true, true, true, true, true, false, false]
    document.addEventListener('mousemove', this.onDocumentMouseMove)
    document.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('resize', this.onWindowResize)
  }

  setupEffects = (): void => {
    // Rebuilt on every crossfade start (to point the RenderPass at the new scene) -- without
    // disposing the previous one first, each rebuild leaked its render targets/passes, and
    // since Particle Config drags call startCrossfade() on essentially every frame, that leak
    // compounded fast.
    this.composer?.dispose()
    this.composer = new EffectComposer(this.renderer!)
    this.composer.addPass(new RenderPass(this.hopalongVisualizer!.getScene(), this.cameraManager!.getCamera()))
    this.bloomEffect = new BloomEffect()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(this.bloomEffect as any).kernelSize = 1

    const fakeCamera = new THREE.PerspectiveCamera(SHOCKWAVE_CAMERA_FOV, window.innerWidth / window.innerHeight)
    fakeCamera.position.z = SHOCKWAVE_CAMERA_Z

    const options = { waveSize: .15, speed: .5, amplitude: .2, maxRadius: 2 }
    this.shockwaveEffect = new ShockWaveEffect(fakeCamera, this.shockwavePosition, options)

    this.effectPass = new EffectPass(this.cameraManager!.getCamera(), this.shockwaveEffect, this.bloomEffect)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(this.effectPass as any).renderToScreen = true
    this.composer.addPass(this.effectPass)

    this.clock = new THREE.Clock()
  }

  // Fires the shockwave on demand (the S key), regardless of the audio, for testing and tuning.
  triggerShockwave = (): void => {
    this.aimShockwaveAtCameraPointer()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(this.shockwaveEffect as any).explode()
  }

  // Puts the shockwave's source where the Julia visualizer's is: shifted off screen center toward the camera
  // by the same small amount per pad unit (so a modest Camera Position stays near the middle, not
  // out in a corner). Screen y grows downward. The effect projects its position through a fixed camera at
  // z = 7 with a 60 degree field of view, so the matching world point on the shockwave's plane follows
  // from that frustum.
  private aimShockwaveAtCameraPointer = (): void => {
    const range = window.config.user.cameraBound.value
    // Use where the camera has actually got to, not the pointer's target: the camera eases toward the pointer
    // (and stores y negated), and the Julia wave likewise uses its eased steering.
    const { position } = this.cameraManager!.getCamera()
    const padX = Math.max(-range, Math.min(range, position.x))
    const padY = Math.max(-range, Math.min(range, -position.y))
    // Normalized device offset from center: the screen fraction shift times two (NDC spans -1 to 1).
    const normX = 2 * padX * CAMERA_STEER_SCREEN_FRACTION_PER_PAD_UNIT
    const normY = 2 * padY * CAMERA_STEER_SCREEN_FRACTION_PER_PAD_UNIT
    const halfHeight = Math.tan((SHOCKWAVE_CAMERA_FOV / 2) * Math.PI / 180) * (SHOCKWAVE_CAMERA_Z - SHOCKWAVE_PLANE_Z)
    const halfWidth = halfHeight * (window.innerWidth / window.innerHeight)
    this.shockwavePosition.set(normX * halfWidth, -normY * halfHeight, SHOCKWAVE_PLANE_Z)
  }

  update = (deltaTime: number, audioData: AudioAnalysedDataForVisualization): void => {
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
      this.aimShockwaveAtCameraPointer()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(this.shockwaveEffect as any).explode()
    }
    this.syncVideoPlaneLook()
    this.composer!.render(this.clock!.getDelta())

    this.cameraManager!.manageCameraPosition(deltaTime)
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
    this.crossfades.push({ outgoing, elapsedMs: 0, durationMs: getParticleCrossfadeDurationMs() })
    this.setupEffects()
  }

  advanceCrossfades = (deltaTime: number): void => {
    const incomingDurationMs = getParticleCrossfadeDurationMs()
    if (this.incomingElapsedMs < incomingDurationMs) {
      this.incomingElapsedMs = Math.min(incomingDurationMs, this.incomingElapsedMs + deltaTime)
      this.setParticleOpacity(this.hopalongVisualizer!, this.incomingElapsedMs / incomingDurationMs)
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

  // Where the camera has actually got to, in the camera pad's units (the pad shows the target instantly; this
  // trails it). The camera's y chases the pad's y inverted, hence the flip.
  getCameraTrailPosition(): { x: number; y: number } | null {
    const camera = this.cameraManager?.camera
    if (!camera) return null
    return { x: camera.position.x, y: -camera.position.y }
  }

  onKeyDown = (event: KeyboardEvent): void => {
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
