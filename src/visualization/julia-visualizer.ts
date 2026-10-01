import * as THREE from 'three'
import { AudioAnalysedDataForVisualization } from '../audioanalysis/audio-analysed-data'
import { juliaFragmentShader, juliaVertexShader } from './shaders/julia-fragment.glsl'

// The Shape slider walks a tour of Julia-set c values, smoothly interpolated between points. The path
// was generated offline: it passes through famous shapes (airplane, basilica, galaxy, Siegel disk,
// rabbit, dendrite, then back along the main cardioid's boundary through the San Marco / seahorse
// area), each stretch snapped onto the Mandelbrot set and resampled evenly, so neighbors look related
// and almost every position is a connected, detailed shape instead of dust. Near-cusp c values
// (close to 0.25) are avoided: the fixed point's multiplier approaches 1 there, so the zoom crawls.
// Every point has a repelling-fixed-point multiplier of at least 1.89.
const TOUR: readonly (readonly [number, number])[] = [
  [-1.7549, 0], [-1.628, 0], [-1.484, 0], [-1.384, 0.012],
  [-1.2647, 0.0283], [-1.1409, 0.025], [-1.0188, 0.0059], [-0.9121, -0.0546],
  [-0.8377, -0.153], [-0.732, -0.208], [-0.704, -0.288], [-0.644, -0.416],
  [-0.568, -0.48], [-0.521, -0.5895], [-0.404, -0.588], [-0.3778, -0.4834],
  [-0.3772, -0.3595], [-0.3815, -0.2357], [-0.3877, -0.112], [-0.3947, 0.0117],
  [-0.4016, 0.1354], [-0.4074, 0.2591], [-0.4111, 0.3829], [-0.4097, 0.5068],
  [-0.3759, 0.6201], [-0.284, 0.644], [-0.22, 0.732], [-0.1202, 0.7476],
  [-0.092, 0.8616], [-0.044, 0.984], [-0.092, 0.872], [-0.024, 0.784],
  [0.068, 0.648], [0.148, 0.612], [0.2558, 0.5541], [0.3081, 0.4438],
  [0.3638, 0.338], [0.3625, 0.301], [0.3026, 0.4094], [0.233, 0.5116],
  [0.1331, 0.583], [0.017, 0.6258], [-0.1048, 0.6474], [-0.2273, 0.6399],
  [-0.3432, 0.5969], [-0.4504, 0.535], [-0.55, 0.4615], [-0.6354, 0.3736],
  [-0.6929, 0.2657], [-0.732, 0.1481], [-0.7984, 0.1381], [-0.7269, 0.1889],
]

// Switcheroo hops this many tour points on each beat (a neighboring look), never straying more than
// MAX_HOP_POINTS from the slider's home position.
const SWITCHEROO_HOP_POINTS = 3
const SWITCHEROO_MAX_HOP_POINTS = 6

// The shape glides to a new tour position at a steady rate in tour points per second, proportional to
// the Speed slider, so a long jump visibly sweeps through the shapes in between. Speed is floored so
// the glide still moves at Speed 0, and no transition takes longer than SHAPE_MAX_TRANSITION_SECONDS
// (a long jump at low Speed speeds up to meet that cap). The ends ease in and out.
const SHAPE_POINTS_PER_SEC_PER_SPEED = 0.6
const SHAPE_MIN_SPEED = 0.5
const SHAPE_MAX_TRANSITION_SECONDS = 15
const SHAPE_EASE_SECONDS = 0.4
const SHAPE_EASE_MAX_JUMP_FRACTION = 0.35
const SHAPE_VELOCITY_HALF_LIFE_SECONDS = 0.1
const ZOOM_PULL_HALF_LIFE_SECONDS = 15
const SPIN_PULL_HALF_LIFE_SECONDS = 10
const ORIENT_HALF_LIFE_SECONDS = 0.6

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
const SHAPE_SLIDER_MIN = 100
const SHAPE_SLIDER_MAX = 2000
const ROTATION_RAD_PER_SEC_PER_UNIT = 0.03

// Steering reads the same shared camera position the Camera Position pad writes (and Hopalong's
// camera reads), in pad units clamped to +/- user.cameraBound (0-500). At the slider max, the fixed
// point's screen position can shift this far (in 0-1 frame units).
const CAMERA_BOUND_MAX = 500
const MAX_STEER_FRAME_OFFSET = 0.4
const STEER_EMA_HALF_LIFE_SECONDS = 0.35

// Effect tuning. Each mirrors a Hopalong effect behind the same checkbox.
const WOBWOB_RECOIL = 2
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

// Position along the tour in stop units (0 to TOUR.length - 1), smoothly interpolated between stops
// with a Catmull-Rom spline so dragging the slider morphs continuously instead of snapping.
const tourPoint = (position: number): Complex => {
  const last = TOUR.length - 1
  const clamped = Math.max(0, Math.min(last, position))
  const index = Math.min(last - 1, Math.floor(clamped))
  const t = clamped - index
  const stop = (i: number): Complex => {
    const [re, im] = TOUR[Math.max(0, Math.min(last, i))]!
    return { re, im }
  }
  const p0 = stop(index - 1)
  const p1 = stop(index)
  const p2 = stop(index + 1)
  const p3 = stop(index + 2)
  const spline = (a: number, b: number, c: number, d: number): number =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t)
  return { re: spline(p0.re, p1.re, p2.re, p3.re), im: spline(p0.im, p1.im, p2.im, p3.im) }
}

// Direction (in the complex plane, radians) from the zoom point toward where the filled region is, found by
// sampling the escape-time on rings around the zoom point at the loop's starting radius and averaging the
// directions of the points that stay bounded (points that escape late count for a bit less). Used to turn each
// shape so that region faces down. Returns null when nothing stands out (a symmetric or empty view).
const ORIENT_DIRECTIONS = 48
const ORIENT_RING_RADII = [0.5, 1, 1.5, 2]
const ORIENT_MAX_ITER = 100
const massDirection = (cx: number, cy: number, fixedPoint: Complex, koenigs2: Complex, koenigs3: Complex): number | null => {
  let sumX = 0
  let sumY = 0
  let total = 0
  for (let i = 0; i < ORIENT_DIRECTIONS; i++) {
    const angle = (i / ORIENT_DIRECTIONS) * Math.PI * 2
    const cosA = Math.cos(angle)
    const sinA = Math.sin(angle)
    for (const ring of ORIENT_RING_RADII) {
      const w: Complex = { re: W_START * ring * cosA, im: W_START * ring * sinA }
      const w2 = cMul(w, w)
      const k2 = cMul(koenigs2, w2)
      const k3 = cMul(koenigs3, cMul(w2, w))
      let zRe = fixedPoint.re + w.re + k2.re + k3.re
      let zIm = fixedPoint.im + w.im + k2.im + k3.im
      let weight = 1
      for (let n = 0; n < ORIENT_MAX_ITER; n++) {
        const nextRe = zRe * zRe - zIm * zIm + cx
        zIm = 2 * zRe * zIm + cy
        zRe = nextRe
        if (zRe * zRe + zIm * zIm > 256) {
          // Late escapers are near the set and count for more; early escapers are far away and barely count.
          weight = 0.6 * Math.pow(n / ORIENT_MAX_ITER, 2)
          break
        }
      }
      sumX += weight * cosA
      sumY += weight * sinA
      total += weight
    }
  }
  return total > 0 && Math.hypot(sumX, sumY) > 0.05 * total ? Math.atan2(sumY, sumX) : null
}

// The one place the shape position is read. For now it rides on the shared Scale slider (0 to 1 across
// its range); once the Julia layer has its own config section, only this function needs to change.
const getShapePosition = (): number => {
  const { value } = window.config.user.scaleFactor
  return Math.max(0, Math.min(1, (value - SHAPE_SLIDER_MIN) / (SHAPE_SLIDER_MAX - SHAPE_SLIDER_MIN)))
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
  private spinAngle = 0
  private logZoom = 0
  private orientAngle = 0
  private hasOrient = false
  private huePhase = 0
  private previousPeakValue = 0
  private hasStartedLoop = false

  // The small drift/audio offset on top of the tour's c for the CURRENT loop. It only steps toward its
  // (drift + audio) target at the wrap instant -- self-similarity wants c steady across a wrap, otherwise
  // the two ends of the zoom are different Julia sets and the wrap pops. Intentional shape changes
  // (the Shape slider, Switcheroo hops) are different: they morph continuously in time, so no seam.
  private loopOffsetX = 0
  private loopOffsetY = 0

  private tourPosition = 0
  private hasTourPosition = false
  private lastTourTarget = 0
  private shapeVelocity = 0
  private shapeCapRate = 0
  private shapeJumpDistance = 0
  private switcherooHop = 0
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
        uC: { value: new THREE.Vector2() },
        uFixedPoint: { value: new THREE.Vector2() },
        uOrient: { value: 0 },
        uSpin: { value: 0 },
        uLogZoom: { value: 0 },
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

    // Continuously-evolving target offset from slow autonomous drift + audio -- only ever
    // committed into the render at a loop wrap, never used mid-loop (see field comment above).
    this.driftPhase += dt * C_DRIFT_SPEED
    const targetOffsetX = Math.cos(this.driftPhase) * C_DRIFT_RADIUS + this.smoothBass * BASS_C_INFLUENCE
    const targetOffsetY = Math.sin(this.driftPhase * 1.3) * C_DRIFT_RADIUS + this.smoothTreble * TREBLE_C_INFLUENCE

    const peakValue = audioData.peak?.value ?? 0
    const energyTarget = ((audioData.energyAverage ?? 0) + (audioData.energy ?? 0)) / 2
    const kEnergy = 1 - Math.pow(0.5, dt / ENERGY_EMA_HALF_LIFE_SECONDS)
    this.smoothEnergy += (energyTarget - this.smoothEnergy) * kEnergy

    const musicSpeedMultiplier = Math.min(
      MAX_SPEED_MULTIPLIER,
      1 + this.smoothEnergy * ENERGY_SPEED_GAIN + peakValue * PEAK_SPEED_BOOST,
    )
    const { speed, rotationSpeed } = window.config.user
    const effects = window.config.effects

    // Wob Wob: like Hopalong's backward jerk on a beat, the zoom recoils (briefly reverses) while the peak decays.
    const wobWobFactor = effects.wobWob.value ? 1 - WOBWOB_RECOIL * peakValue : 1
    const progressDelta = BASE_LOOP_SPEED * (speed.value / SPEED_DEFAULT) * musicSpeedMultiplier * wobWobFactor * dt
    this.loopProgress += progressDelta
    this.rotation = (this.rotation + rotationSpeed.value * ROTATION_RAD_PER_SEC_PER_UNIT * dt) % (Math.PI * 2)

    const wrapIndex = Math.floor(this.loopProgress)
    const wrapped = !this.hasStartedLoop || wrapIndex !== this.lastWrapIndex
    const wrapSteps = this.hasStartedLoop ? wrapIndex - this.lastWrapIndex : 0
    this.lastWrapIndex = wrapIndex
    this.loopT = this.loopProgress - wrapIndex

    if (wrapped) {
      if (this.hasStartedLoop) {
        const stepX = (targetOffsetX - this.loopOffsetX) * WRAP_C_LERP_FACTOR
        const stepY = (targetOffsetY - this.loopOffsetY) * WRAP_C_LERP_FACTOR
        const stepLength = Math.hypot(stepX, stepY)
        const limit = stepLength > MAX_C_STEP_PER_WRAP ? MAX_C_STEP_PER_WRAP / stepLength : 1
        this.loopOffsetX += stepX * limit
        this.loopOffsetY += stepY * limit
      } else {
        this.loopOffsetX = targetOffsetX
        this.loopOffsetY = targetOffsetY
      }
      this.hasStartedLoop = true
    }

    // A fresh beat is the peak crossing the threshold upward; several effects key off it.
    const freshBeat = peakValue > PEAK_JUMP_THRESHOLD && this.previousPeakValue <= PEAK_JUMP_THRESHOLD
    this.previousPeakValue = peakValue

    // Switcheroo: on each beat, hop to a neighboring stop on the tour (a random direction, bounded around
    // the slider's home position) and hold it until the next beat. The shape glides there at the Speed-based rate.
    if (!effects.switcheroo.value) {
      this.switcherooHop = 0
    } else if (freshBeat) {
      const direction = Math.random() < 0.5 ? -SWITCHEROO_HOP_POINTS : SWITCHEROO_HOP_POINTS
      const next = this.switcherooHop + direction
      this.switcherooHop = Math.abs(next) > SWITCHEROO_MAX_HOP_POINTS ? this.switcherooHop - direction : next
    }
    const targetTourPosition = Math.max(0, Math.min(TOUR.length - 1, getShapePosition() * (TOUR.length - 1) + this.switcherooHop))
    if (!this.hasTourPosition) {
      this.tourPosition = targetTourPosition
      this.lastTourTarget = targetTourPosition
      this.hasTourPosition = true
    }
    // When the target moves, remember how fast we'd need to go to finish within the cap; the glide runs at
    // whichever is faster, the Speed-based rate or that cap rate.
    if (Math.abs(targetTourPosition - this.lastTourTarget) > 1e-6) {
      this.shapeJumpDistance = Math.abs(targetTourPosition - this.tourPosition)
      this.shapeCapRate = this.shapeJumpDistance / SHAPE_MAX_TRANSITION_SECONDS
      this.lastTourTarget = targetTourPosition
    }
    const shapeRate = Math.max(SHAPE_POINTS_PER_SEC_PER_SPEED * Math.max(SHAPE_MIN_SPEED, speed.value), this.shapeCapRate)
    const remaining = targetTourPosition - this.tourPosition
    // The ease-out zone is a time's worth of travel, but never more than a third of the jump, so short
    // hops at high Speed stay snappy instead of being dominated by the ease.
    const easeDistance = Math.max(1e-6, Math.min(shapeRate * SHAPE_EASE_SECONDS, SHAPE_EASE_MAX_JUMP_FRACTION * this.shapeJumpDistance))
    const desiredVelocity = Math.sign(remaining) * shapeRate * Math.min(1, Math.abs(remaining) / easeDistance)
    this.shapeVelocity += (desiredVelocity - this.shapeVelocity) * (1 - Math.pow(0.5, dt / SHAPE_VELOCITY_HALF_LIFE_SECONDS))
    this.tourPosition += this.shapeVelocity * dt
    // Land on the target instead of overshooting it (the smoothed velocity can carry a little momentum).
    if (Math.sign(targetTourPosition - this.tourPosition) !== Math.sign(remaining) || Math.abs(remaining) < 0.002) {
      this.tourPosition = targetTourPosition
      this.shapeVelocity = 0
    }
    const tourC = tourPoint(this.tourPosition)
    const effectiveCx = tourC.re + this.loopOffsetX
    const effectiveCy = tourC.im + this.loopOffsetY
    const { fixedPointX, fixedPointY, lambdaMag, lambdaArg, koenigs2, koenigs3 } = computeFixedPointAndLambda(effectiveCx, effectiveCy)

    // Spin and zoom are carried as running totals instead of being recomputed from the current shape.
    // Recomputing (angle = -t * arg(lambda), radius = |lambda|^-t) made the whole view swing and the zoom
    // lurch whenever c changed mid-loop, since lambda depends on c. Integrating means a shape change only
    // alters the future rate. At a wrap we add back exactly one loop's worth with the current lambda, which
    // keeps the picture continuous there (self-similarity makes t = 1 and t = 0 the same view) and leaves any
    // spin accumulated from earlier shape changes in place.
    const spinPerLoop = lambdaArg * LOOP_PERIODS
    const logZoomPerLoop = Math.log(lambdaMag) * LOOP_PERIODS
    this.spinAngle += -spinPerLoop * progressDelta + wrapSteps * spinPerLoop
    this.logZoom += -logZoomPerLoop * progressDelta + wrapSteps * logZoomPerLoop
    this.spinAngle %= Math.PI * 2
    // Likewise ease any spin left over from earlier shape changes back to what an unchanged shape would have,
    // so the shape's orientation (see uOrient) is the same wherever on the slider you are.
    const canonicalSpin = -spinPerLoop * this.loopT
    const spinError = Math.atan2(Math.sin(canonicalSpin - this.spinAngle), Math.cos(canonicalSpin - this.spinAngle))
    this.spinAngle += spinError * (1 - Math.pow(0.5, dt / SPIN_PULL_HALF_LIFE_SECONDS))    // A gentle pull back toward where an unchanged shape would have the zoom, so repeated shape changes
    // can't walk the zoom depth away from the range where the zoom coordinate is accurate.
    this.logZoom += (-logZoomPerLoop * this.loopT - this.logZoom) * (1 - Math.pow(0.5, dt / ZOOM_PULL_HALF_LIFE_SECONDS))

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
    // Turn the shape so its filled region faces down, easing so a shape change (or a flip in which side
    // dominates) turns the view smoothly instead of snapping.
    const mass = massDirection(effectiveCx, effectiveCy, { re: fixedPointX, im: fixedPointY }, koenigs2, koenigs3)
    if (mass !== null) {
      const targetOrient = mass + Math.PI / 2
      if (!this.hasOrient) {
        this.orientAngle = targetOrient
        this.hasOrient = true
      }
      const orientError = Math.atan2(Math.sin(targetOrient - this.orientAngle), Math.cos(targetOrient - this.orientAngle))
      this.orientAngle += orientError * (1 - Math.pow(0.5, dt / ORIENT_HALF_LIFE_SECONDS))
    }
    uniforms.uOrient!.value = this.orientAngle
    uniforms.uSpin!.value = this.spinAngle
    uniforms.uLogZoom!.value = this.logZoom
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
