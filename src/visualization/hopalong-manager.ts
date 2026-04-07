import * as THREE from 'three'
import { EffectComposer, ShockWaveEffect, RenderPass, BloomEffect, EffectPass } from 'postprocessing'

import { HopalongVisualizer } from './hopalong-visualizer'
import { CameraManager } from './camera-manager'
import { AudioAnalysedDataForVisualization } from '../audioanalysis/audio-analysed-data'

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
    // Default: visible bands (sub–hi = 0–4) enabled; pre/bri/air (5–7) disabled
    window.enabledFreqBands = [true, true, true, true, true, false, false, false]
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
      this.resetVisualization()
    }
    this.hopalongVisualizer!.update(deltaTime, audioData)

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

  resetVisualization = (): void => {
    this.hopalongVisualizer!.destroyVisualization()
    this.hopalongVisualizer = new HopalongVisualizer()
    this.hopalongVisualizer.init()
    this.setupEffects()
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
