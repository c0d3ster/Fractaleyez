import * as THREE from 'three'
import { AudioAnalysedDataForVisualization } from '../audioanalysis/audio-analysed-data'
import { juliaFragmentShader, juliaVertexShader } from './shaders/julia-fragment.glsl'

const BASE_C = { x: -0.75, y: 0.11 }
const C_DRIFT_RADIUS = 0.015
const C_DRIFT_SPEED = 0.04
const BASS_C_INFLUENCE = 0.04
const TREBLE_C_INFLUENCE = 0.04

// c only moves this fraction of the way toward its (audio + drift) target at each wrap --
// a full snap-to-target broke self-similarity outright (confirmed: freezing c entirely made
// the wrap seamless, so consecutive loops must stay close to each other, not jump to wherever
// the target happens to be). This spreads any given amount of evolution across many loops.
const WRAP_C_LERP_FACTOR = 0.08

const EMA_HALF_LIFE_SECONDS = 0.12

// Loop progress (t) per second at rest, scaled by the music speed multiplier below.
const BASE_LOOP_SPEED = 0.04

// Each loop spans this many self-similarity periods (zoom by |lambda|^N, rotate by N*arg(lambda)).
// Any whole number of periods is still an exact match at the wrap, and it makes each loop dive deeper.
const LOOP_PERIODS = 2

// Radius of the view at t=0. This has to be small enough that the whole frame
// already sits deep in the region where Koenigs linearization holds well --
// 1.4 (comparable to the whole Julia set's extent) made the wrap an obvious pop.
const W_START = 0.012

// Zoom speed = base * (1 + smoothed energy * gain + beat envelope * boost), capped.
// Energy is the mean deviation from 128 on a 0-128 scale, so typical music sits around 5-30.
const ENERGY_EMA_HALF_LIFE_SECONDS = 0.3
const ENERGY_SPEED_GAIN = 0.2
const PEAK_SPEED_BOOST = 1.5
const MAX_SPEED_MULTIPLIER = 8

// Mouse steering reuses the shared user.cameraBound slider (0-500). At the max, the fixed point's
// screen position can shift this far (in 0-1 frame units) from where the mouse pulls it.
const CAMERA_BOUND_MAX = 500
const MAX_STEER_FRAME_OFFSET = 0.4
const STEER_EMA_HALF_LIFE_SECONDS = 0.35

const HUE_DRIFT_PER_SEC = 0.015
const HUE_PEAK_JUMP = 0.12
const PEAK_JUMP_THRESHOLD = 0.9

interface FixedPointResult {
  fixedPointX: number
  fixedPointY: number
  lambdaMag: number
  lambdaArg: number
}

// Closed-form repelling fixed point + multiplier for f(z) = z^2 + c.
// Fixed points solve z^2 + c = z, i.e. z = (1 +/- sqrt(1 - 4c)) / 2 (Vieta's formulas).
// The multiplier at a fixed point is f'(z) = 2z; we pick whichever root has |2z| > 1 (repelling).
const computeFixedPointAndLambda = (cx: number, cy: number): FixedPointResult => {
  const dx = 1 - 4 * cx
  const dy = -4 * cy
  const dMag = Math.hypot(dx, dy)

  const sqrtX = Math.sqrt(Math.max(0, (dMag + dx) / 2))
  const sqrtYMagnitude = Math.sqrt(Math.max(0, (dMag - dx) / 2))
  const sqrtY = dy < 0 ? -sqrtYMagnitude : sqrtYMagnitude

  const z1x = (1 + sqrtX) / 2
  const z1y = sqrtY / 2
  const z2x = (1 - sqrtX) / 2
  const z2y = -sqrtY / 2

  const mag1 = 2 * Math.hypot(z1x, z1y)
  const mag2 = 2 * Math.hypot(z2x, z2y)

  const useFirst = mag1 >= mag2
  const fixedPointX = useFirst ? z1x : z2x
  const fixedPointY = useFirst ? z1y : z2y

  // Guard against near-parabolic c (both fixed points weakly repelling) so pow(lambdaMag, -t) stays sane.
  const lambdaMag = Math.max(mag1, mag2, 1.05)
  const lambdaArg = Math.atan2(2 * fixedPointY, 2 * fixedPointX)

  return { fixedPointX, fixedPointY, lambdaMag, lambdaArg }
}

export class JuliaVisualizer {
  private renderer: THREE.WebGLRenderer | null = null
  private scene: THREE.Scene | null = null
  private camera: THREE.OrthographicCamera | null = null
  private material: THREE.ShaderMaterial | null = null

  private smoothBass = 0
  private smoothTreble = 0
  private smoothEnergy = 0
  private mouseNormX = 0
  private mouseNormY = 0
  private steerX = 0
  private steerY = 0
  private driftPhase = 0
  private loopT = 0
  private huePhase = 0
  private previousPeakValue = 0
  private hasStartedLoop = false

  // These describe the fixed point/multiplier for whichever c the CURRENT loop is rendering.
  // They're only resampled from the continuously-drifting audio-reactive c at the wrap instant --
  // self-similarity requires c to stay constant for the whole loop, otherwise the two ends of the
  // zoom are literally different Julia sets and the wrap is a visible pop.
  private loopCx = BASE_C.x
  private loopCy = BASE_C.y
  private loopFixedPointX = 0
  private loopFixedPointY = 0
  private loopLambdaMag = 1
  private loopLambdaArg = 0

  init(): void {
    this.renderer = new THREE.WebGLRenderer({ antialias: false })
    this.renderer.setClearColor(0x000000, 1)
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.domElement.style.position = 'fixed'
    this.renderer.domElement.style.inset = '0'
    this.renderer.domElement.style.display = 'none'
    document.body.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    this.material = new THREE.ShaderMaterial({
      vertexShader: juliaVertexShader,
      fragmentShader: juliaFragmentShader,
      uniforms: {
        uC: { value: new THREE.Vector2(BASE_C.x, BASE_C.y) },
        uFixedPoint: { value: new THREE.Vector2() },
        uT: { value: 0 },
        uLambdaMag: { value: 1 },
        uLambdaArg: { value: 0 },
        uWStart: { value: W_START },
        uAspect: { value: window.innerWidth / window.innerHeight },
        uHuePhase: { value: 0 },
        uCenterOffset: { value: new THREE.Vector2() },
      },
    })

    const geometry = new THREE.PlaneGeometry(2, 2)
    const mesh = new THREE.Mesh(geometry, this.material)
    this.scene.add(mesh)

    window.addEventListener('resize', this.onResize)
    window.addEventListener('mousemove', this.onMouseMove)
  }

  private onMouseMove = (event: MouseEvent): void => {
    this.mouseNormX = (event.clientX / window.innerWidth - 0.5) * 2
    this.mouseNormY = (event.clientY / window.innerHeight - 0.5) * 2
  }

  private onResize = (): void => {
    if (!this.renderer || !this.material) return
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.material.uniforms.uAspect!.value = window.innerWidth / window.innerHeight
  }

  private emaTowards(current: number, target: number, dtSeconds: number): number {
    const k = 1 - Math.pow(0.5, dtSeconds / EMA_HALF_LIFE_SECONDS)
    return current + (target - current) * k
  }

  setVisible(visible: boolean): void {
    if (!this.renderer) return
    this.renderer.domElement.style.display = visible ? 'block' : 'none'
  }

  update(deltaTime: number, audioData: AudioAnalysedDataForVisualization): void {
    if (!this.material) return
    const dt = deltaTime / 1000

    const bands = audioData.multibandEnergy ?? []
    const bassRaw = (bands[0] ?? 0) / 255
    const trebleRaw = (bands[bands.length - 1] ?? 0) / 255
    this.smoothBass = this.emaTowards(this.smoothBass, bassRaw, dt)
    this.smoothTreble = this.emaTowards(this.smoothTreble, trebleRaw, dt)

    // Continuously-evolving target c from slow autonomous drift + audio -- only ever
    // committed into the render at a loop wrap, never used mid-loop (see field comment above).
    this.driftPhase += dt * C_DRIFT_SPEED
    const targetCx = BASE_C.x + Math.cos(this.driftPhase) * C_DRIFT_RADIUS + this.smoothBass * BASS_C_INFLUENCE
    const targetCy = BASE_C.y + Math.sin(this.driftPhase * 1.3) * C_DRIFT_RADIUS + this.smoothTreble * TREBLE_C_INFLUENCE

    const peakValue = audioData.peak?.value ?? 0
    const energyTarget = ((audioData.energyAverage ?? 0) + (audioData.energy ?? 0)) / 2
    const kEnergy = 1 - Math.pow(0.5, dt / ENERGY_EMA_HALF_LIFE_SECONDS)
    this.smoothEnergy += (energyTarget - this.smoothEnergy) * kEnergy

    const musicSpeedMultiplier = Math.min(
      MAX_SPEED_MULTIPLIER,
      1 + this.smoothEnergy * ENERGY_SPEED_GAIN + peakValue * PEAK_SPEED_BOOST,
    )
    this.loopT += BASE_LOOP_SPEED * musicSpeedMultiplier * dt

    const wrapped = this.loopT >= 1 || !this.hasStartedLoop
    if (this.loopT >= 1) this.loopT -= Math.floor(this.loopT)

    if (wrapped) {
      if (this.hasStartedLoop) {
        this.loopCx += (targetCx - this.loopCx) * WRAP_C_LERP_FACTOR
        this.loopCy += (targetCy - this.loopCy) * WRAP_C_LERP_FACTOR
      } else {
        this.loopCx = targetCx
        this.loopCy = targetCy
      }
      this.hasStartedLoop = true
      const { fixedPointX, fixedPointY, lambdaMag, lambdaArg } = computeFixedPointAndLambda(this.loopCx, this.loopCy)
      this.loopFixedPointX = fixedPointX
      this.loopFixedPointY = fixedPointY
      this.loopLambdaMag = Math.pow(lambdaMag, LOOP_PERIODS)
      this.loopLambdaArg = lambdaArg * LOOP_PERIODS
    }

    this.huePhase += HUE_DRIFT_PER_SEC * dt
    if (peakValue > PEAK_JUMP_THRESHOLD && this.previousPeakValue <= PEAK_JUMP_THRESHOLD) {
      this.huePhase += HUE_PEAK_JUMP
    }
    this.previousPeakValue = peakValue

    // Camera-style follow: the scene shifts opposite the mouse, like Hopalong's camera. The shift is in
    // normalized frame space, so it steers the dive without breaking the self-similar loop.
    const steerScale = (window.config.user.cameraBound.value / CAMERA_BOUND_MAX) * MAX_STEER_FRAME_OFFSET
    const kSteer = 1 - Math.pow(0.5, dt / STEER_EMA_HALF_LIFE_SECONDS)
    this.steerX += (-this.mouseNormX * steerScale - this.steerX) * kSteer
    this.steerY += (this.mouseNormY * steerScale - this.steerY) * kSteer

    const uniforms = this.material.uniforms
    uniforms.uCenterOffset!.value.set(this.steerX, this.steerY)
    uniforms.uC!.value.set(this.loopCx, this.loopCy)
    uniforms.uFixedPoint!.value.set(this.loopFixedPointX, this.loopFixedPointY)
    uniforms.uT!.value = this.loopT
    uniforms.uLambdaMag!.value = this.loopLambdaMag
    uniforms.uLambdaArg!.value = this.loopLambdaArg
    uniforms.uHuePhase!.value = this.huePhase
  }

  render(): void {
    if (!this.renderer || !this.scene || !this.camera) return
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize)
    window.removeEventListener('mousemove', this.onMouseMove)
    this.material?.dispose()
    this.renderer?.dispose()
    this.renderer?.domElement.remove()
  }
}
