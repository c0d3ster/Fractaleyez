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

// Hard cap on how far c may move at one wrap. Measured offline (at a 0.012 start radius): steps of
// 0.0001 or less keep the wrap within ~1% of the zero-step mismatch, while 0.001+ more than doubles it.
const MAX_C_STEP_PER_WRAP = 0.0001

const EMA_HALF_LIFE_SECONDS = 0.12

// Loop progress (t) per second at rest, scaled by the music speed multiplier below.
const BASE_LOOP_SPEED = 0.04

// Each loop spans this many self-similarity periods (zoom by |lambda|^N, rotate by N*arg(lambda)).
// Any whole number of periods is still an exact match at the wrap, and it makes each loop dive deeper.
const LOOP_PERIODS = 2

// Radius of the view at t=0. This has to be small enough that the whole frame
// already sits deep in the region where Koenigs linearization holds well --
// 1.4 (comparable to the whole Julia set's extent) made the wrap an obvious pop.
const W_START = 0.006

// Zoom speed = base * (1 + smoothed energy * gain + beat envelope * boost), capped.
// Energy is the mean deviation from 128 on a 0-128 scale, so typical music sits around 5-30.
const ENERGY_EMA_HALF_LIFE_SECONDS = 0.3
const ENERGY_SPEED_GAIN = 0.2
const PEAK_SPEED_BOOST = 1.5
const MAX_SPEED_MULTIPLIER = 8

// The shared user sliders map onto the Julia view. The default speed (2) keeps the base pace;
// rotation spins the whole view about the fixed point, which keeps the loop seamless.
const SPEED_DEFAULT = 2
const SCALE_MIN = 100
const SCALE_MAX = 2000
const ROTATION_RAD_PER_SEC_PER_UNIT = 0.03

// Steering reads the same shared camera position the Camera Position pad writes (and Hopalong's
// camera reads), in pad units clamped to +/- user.cameraBound (0-500). At the slider max, the fixed
// point's screen position can shift this far (in 0-1 frame units).
const CAMERA_BOUND_MAX = 500
const MAX_STEER_FRAME_OFFSET = 0.4
const STEER_EMA_HALF_LIFE_SECONDS = 0.35

// Effect tuning. Each mirrors a Hopalong effect behind the same checkbox.
const WOBWOB_RECOIL = 2
const SWITCHEROO_C_KICK = 0.015
const SWITCHEROO_ANGLE_STEP = 2.4
const SHOCKWAVE_PEAK_THRESHOLD = 0.8
const SHOCKWAVE_BASE_SPEED = 0.9
const SHOCKWAVE_MAX_RADIUS = 3
const GLOW_ENERGY_REFERENCE = 30

const HUE_DRIFT_PER_SEC = 0.015
const HUE_PEAK_JUMP = 0.12
const PEAK_JUMP_THRESHOLD = 0.9

interface Complex {
  re: number
  im: number
}

interface FixedPointResult {
  fixedPointX: number
  fixedPointY: number
  lambdaMag: number
  lambdaArg: number
  koenigs2: Complex
  koenigs3: Complex
}

const cMul = (a: Complex, b: Complex): Complex => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re })
const cSub = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im })
const cScale = (a: Complex, s: number): Complex => ({ re: a.re * s, im: a.im * s })
const cDiv = (a: Complex, b: Complex): Complex => {
  const d = b.re * b.re + b.im * b.im
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }
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

  // Inverse Koenigs coordinate to third order: z = z0 + w + c2 w^2 + c3 w^3. Plain (z - z0) is only the
  // first-order term, and its error is what made wider starting views mismatch at the loop wrap.
  // From phi(f(u)) = lambda * phi(u) with f(z0 + u) = z0 + lambda u + u^2:
  //   a2 = 1 / (lambda (1 - lambda)), a3 = 2 a2 / (1 - lambda^2), c2 = -a2, c3 = 2 a2^2 - a3.
  const lambda: Complex = { re: 2 * fixedPointX, im: 2 * fixedPointY }
  const one: Complex = { re: 1, im: 0 }
  const a2 = cDiv(one, cMul(lambda, cSub(one, lambda)))
  const a3 = cDiv(cScale(a2, 2), cSub(one, cMul(lambda, lambda)))
  const koenigs2 = cScale(a2, -1)
  const koenigs3 = cSub(cScale(cMul(a2, a2), 2), a3)

  return { fixedPointX, fixedPointY, lambdaMag, lambdaArg, koenigs2, koenigs3 }
}

export class JuliaVisualizer {
  private renderer: THREE.WebGLRenderer | null = null
  private scene: THREE.Scene | null = null
  private camera: THREE.OrthographicCamera | null = null
  private material: THREE.ShaderMaterial | null = null

  private smoothBass = 0
  private smoothTreble = 0
  private smoothEnergy = 0
  private rotation = 0
  private steerX = 0
  private steerY = 0
  private driftPhase = 0
  private loopProgress = 0
  private lastWrapIndex = 0
  private loopT = 0
  private huePhase = 0
  private previousPeakValue = 0
  private hasStartedLoop = false

  // The c the CURRENT loop is rendering. It's only resampled from the continuously-drifting
  // audio-reactive c at the wrap instant -- self-similarity requires c to stay constant for the whole
  // loop, otherwise the two ends of the zoom are literally different Julia sets and the wrap pops.
  private loopCx = BASE_C.x
  private loopCy = BASE_C.y

  private switcherooAngle = 0
  private previousShockPeak = 0
  private shockAge = -1

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
        uIterOffset: { value: 0 },
        uRotation: { value: 0 },
        uKoenigs2: { value: new THREE.Vector2() },
        uKoenigs3: { value: new THREE.Vector2() },
        uCyclone: { value: 0 },
        uGlow: { value: 0 },
        uShockRadius: { value: 0 },
        uShockStrength: { value: 0 },
      },
    })

    const geometry = new THREE.PlaneGeometry(2, 2)
    const mesh = new THREE.Mesh(geometry, this.material)
    this.scene.add(mesh)

    window.addEventListener('resize', this.onResize)
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
    const { speed, rotationSpeed, scaleFactor } = window.config.user
    const effects = window.config.effects

    // Wob Wob: like Hopalong's backward jerk on a beat, the zoom recoils (briefly reverses) while the peak decays.
    const wobWobFactor = effects.wobWob.value ? 1 - WOBWOB_RECOIL * peakValue : 1
    this.loopProgress += BASE_LOOP_SPEED * (speed.value / SPEED_DEFAULT) * musicSpeedMultiplier * wobWobFactor * dt
    this.rotation = (this.rotation + rotationSpeed.value * ROTATION_RAD_PER_SEC_PER_UNIT * dt) % (Math.PI * 2)

    // The picture is self-similar, so a different starting radius is just a different point in the
    // loop. Scale therefore maps (log) onto exactly one loop of phase: higher scale = deeper start.
    const scaleOffset = Math.log(scaleFactor.value / SCALE_MIN) / Math.log(SCALE_MAX / SCALE_MIN)
    const phase = this.loopProgress + scaleOffset
    const wrapIndex = Math.floor(phase)
    const wrapped = !this.hasStartedLoop || wrapIndex !== this.lastWrapIndex
    this.lastWrapIndex = wrapIndex
    this.loopT = phase - wrapIndex

    if (wrapped) {
      if (this.hasStartedLoop) {
        const stepX = (targetCx - this.loopCx) * WRAP_C_LERP_FACTOR
        const stepY = (targetCy - this.loopCy) * WRAP_C_LERP_FACTOR
        const stepLength = Math.hypot(stepX, stepY)
        const limit = stepLength > MAX_C_STEP_PER_WRAP ? MAX_C_STEP_PER_WRAP / stepLength : 1
        this.loopCx += stepX * limit
        this.loopCy += stepY * limit
      } else {
        this.loopCx = targetCx
        this.loopCy = targetCy
      }
      this.hasStartedLoop = true
    }

    // A fresh beat is the peak crossing the threshold upward; several effects key off it.
    const freshBeat = peakValue > PEAK_JUMP_THRESHOLD && this.previousPeakValue <= PEAK_JUMP_THRESHOLD
    this.previousPeakValue = peakValue

    // Switcheroo: reshape on beats. c takes a kick that decays with the peak, in a new direction each
    // beat. It changes continuously in time (no jump), so it reshapes the fractal without a seam.
    if (freshBeat) this.switcherooAngle += SWITCHEROO_ANGLE_STEP
    const kick = effects.switcheroo.value ? SWITCHEROO_C_KICK * peakValue : 0
    const effectiveCx = this.loopCx + Math.cos(this.switcherooAngle) * kick
    const effectiveCy = this.loopCy + Math.sin(this.switcherooAngle) * kick
    const { fixedPointX, fixedPointY, lambdaMag, lambdaArg, koenigs2, koenigs3 } = computeFixedPointAndLambda(effectiveCx, effectiveCy)

    this.huePhase += HUE_DRIFT_PER_SEC * dt
    if (freshBeat && effects.colorShift.value) this.huePhase += HUE_PEAK_JUMP

    // Shockwave: a ripple expanding from the fixed point on strong beats, using Hopalong's trigger rules.
    const enabledBands = window.enabledFreqBands ?? [true, true, true, true, true, false, false, false]
    const anyEnabledBandElevated = enabledBands.every(Boolean) || (audioData.multibandEnergy?.some((e, i) => {
      if (!enabledBands[i]) return false
      const average = audioData.multibandEnergyAverage?.[i] ?? 0
      return average > 0 && e / average > 1.0
    }) ?? true)
    if (effects.shockwave.value && peakValue > SHOCKWAVE_PEAK_THRESHOLD && this.previousShockPeak <= SHOCKWAVE_PEAK_THRESHOLD && anyEnabledBandElevated) {
      this.shockAge = 0
    }
    this.previousShockPeak = peakValue
    let shockRadius = 0
    let shockStrength = 0
    if (this.shockAge >= 0) {
      this.shockAge += dt
      shockRadius = this.shockAge * (SHOCKWAVE_BASE_SPEED + speed.value / 15)
      if (shockRadius > SHOCKWAVE_MAX_RADIUS) this.shockAge = -1
      else shockStrength = 1 - shockRadius / SHOCKWAVE_MAX_RADIUS
    }

    // Glow: Hopalong drives bloom opacity with peak value * peak energy.
    const glow = effects.glow.value ? Math.min(1, (peakValue * (audioData.peak?.energy ?? 0)) / GLOW_ENERGY_REFERENCE) : 0

    // Camera-style follow: the scene shifts opposite the mouse, like Hopalong's camera. The shift is in
    // normalized frame space, so it steers the dive without breaking the self-similar loop.
    const range = window.config.user.cameraBound.value
    const pad = window.getVirtualCameraPosition?.() ?? { x: 0, y: 0 }
    const padX = Math.max(-range, Math.min(range, pad.x))
    const padY = Math.max(-range, Math.min(range, pad.y))
    const steerScale = MAX_STEER_FRAME_OFFSET / CAMERA_BOUND_MAX
    const kSteer = 1 - Math.pow(0.5, dt / STEER_EMA_HALF_LIFE_SECONDS)
    this.steerX += (-padX * steerScale - this.steerX) * kSteer
    this.steerY += (padY * steerScale - this.steerY) * kSteer

    const uniforms = this.material.uniforms
    uniforms.uCenterOffset!.value.set(this.steerX, this.steerY)
    uniforms.uIterOffset!.value = this.loopT * LOOP_PERIODS
    uniforms.uRotation!.value = this.rotation
    uniforms.uKoenigs2!.value.set(koenigs2.re, koenigs2.im)
    uniforms.uKoenigs3!.value.set(koenigs3.re, koenigs3.im)
    uniforms.uC!.value.set(effectiveCx, effectiveCy)
    uniforms.uFixedPoint!.value.set(fixedPointX, fixedPointY)
    uniforms.uT!.value = this.loopT
    uniforms.uLambdaMag!.value = Math.pow(lambdaMag, LOOP_PERIODS)
    uniforms.uLambdaArg!.value = lambdaArg * LOOP_PERIODS
    uniforms.uHuePhase!.value = this.huePhase
    uniforms.uCyclone!.value = effects.cyclone.value ? 1 : 0
    uniforms.uGlow!.value = glow
    uniforms.uShockRadius!.value = shockRadius
    uniforms.uShockStrength!.value = shockStrength
  }

  render(): void {
    if (!this.renderer || !this.scene || !this.camera) return
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize)
    this.material?.dispose()
    this.renderer?.dispose()
    this.renderer?.domElement.remove()
  }
}
