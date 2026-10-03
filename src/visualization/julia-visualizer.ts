import * as THREE from 'three'
import { CAMERA_STEER_SCREEN_FRACTION_PER_PAD_UNIT } from '../config/visualizer.config'
import { AudioAnalysedDataForVisualization } from '../audioanalysis/audio-analysed-data'
import { juliaFragmentShader, juliaVertexShader } from './shaders/julia-fragment.glsl'
import { JULIA_MAP_VIEW, JULIA_TOUR } from './julia-tour'
import { userConfig } from '../config/user.config'
import { JULIA_SCALE, SCALE_UNITS_PER_SLIDER_STEP } from '../config/juliaScale.config'
import { SHAPE_EASE_SECONDS, SHAPE_MAX_TRANSITION_SECONDS, SHAPE_VELOCITY_HALF_LIFE_SECONDS, ShapeGlider } from './shape-glider'

const TOUR = JULIA_TOUR

// Switcheroo hops to a neighboring look on each beat, never straying more than MAX_HOPS hops from the
// slider's home position. The hop size grows with Speed but slower than linearly (the glide rate already
// scales with Speed): 2 tour points at the default Speed of 2, about 10 at Speed 20, never under 1.
const SWITCHEROO_HOP_POINTS_AT_DEFAULT_SPEED = 2
const SWITCHEROO_HOP_SPEED_EXPONENT = 0.7
const SWITCHEROO_MIN_HOP_POINTS = 1
const SWITCHEROO_MAX_HOPS = 2

// The shape glides to a new tour position at a steady rate in tour points per second, proportional to
// the Speed slider, so a long jump visibly sweeps through the shapes in between. Speed is floored so
// the glide still moves at Speed 0. The cap on how long a transition may take, and the easing, live in
// ShapeGlider.
const SHAPE_POINTS_PER_SEC_PER_SPEED = 0.3
const SHAPE_MIN_SPEED = 0.5

// Manual shape (the shape pad). The glide rate is in c units per second per unit of Speed: about the
// distance between neighboring tour points (0.12) times SHAPE_POINTS_PER_SEC_PER_SPEED. While the
// pointer is dragging, the shape follows it closely instead of gliding.
const MANUAL_C_UNITS_PER_SEC_PER_SPEED = 0.035
// Manual hops use the same Speed scaling as the tour: this distance (in c units) is for 2 tour points'
// worth of hop, and the radius around the chosen point is MAX_HOPS hops.
const MANUAL_HOP_DISTANCE_PER_TOUR_POINT = 0.06
// Cyclone eases in and out instead of snapping: the warp amount closes half the gap to its target this often.
const CYCLONE_HALF_LIFE_SECONDS = 0.4

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

// Radius of the view at t=0 at the default Scale (1.5x). This has to be small enough that the whole frame
// already sits deep in the region where Koenigs linearization holds well --
// 1.4 (comparable to the whole Julia set's extent) made the wrap an obvious pop.
const W_START = 0.006

// The Scale slider sets that starting radius, log-spaced: 1.5x is W_START and 0.2x is the whole Julia set.
// Below 0.2x the set keeps shrinking in the frame (the "eyeball" zone) down to half its whole-set size at
// the slider's 0.1x minimum. Above 1.5x it dives up to 3x deeper by 2.0x.
const SCALE_DEFAULT = JULIA_SCALE.default
const SCALE_WHOLE_SET = JULIA_SCALE.wholeSet
const SCALE_MIN = JULIA_SCALE.min
const WHOLE_SET_RADIUS = 1.75
const EYEBALL_RADIUS_AT_MIN_SCALE = 3.5
// Motion (dive, spin, orient turn) finishes settling at this Scale, so 0.3x down is a still picture.
const SCALE_SETTLED = JULIA_SCALE.settled
const DEEP_SCALE_SPAN = 0.5
const DEEP_SCALE_FACTOR = 3
// Measured wrap mismatch of the 3rd-order Koenigs loop grows with the cube of the starting radius: it is
// sub-pixel up to about 0.2 (roughly Scale 0.7x) and pops beyond that. Wider views swap the sawtooth zoom
// for a breathing one (zoom in and back out, seamless by construction), and never dive past the radius
// where the shader's series blend begins.
const SEAM_SAFE_RADIUS = 0.2
const WIDE_DIVE_FLOOR_RADIUS = 0.25
const WIDE_BLEND_HALF_LIFE_SECONDS = 0.4
const RADIUS_HALF_LIFE_SECONDS = 0.15


const scaleToRadius = (scale: number): number => {
  if (scale >= SCALE_DEFAULT) return W_START * Math.pow(DEEP_SCALE_FACTOR, -(scale - SCALE_DEFAULT) / DEEP_SCALE_SPAN)
  if (scale >= SCALE_WHOLE_SET) {
    const wideness = (SCALE_DEFAULT - scale) / (SCALE_DEFAULT - SCALE_WHOLE_SET)
    return W_START * Math.pow(WHOLE_SET_RADIUS / W_START, wideness)
  }
  const eyeball = (SCALE_WHOLE_SET - Math.max(SCALE_MIN, scale)) / (SCALE_WHOLE_SET - SCALE_MIN)
  return WHOLE_SET_RADIUS * Math.pow(EYEBALL_RADIUS_AT_MIN_SCALE / WHOLE_SET_RADIUS, eyeball)
}
const SETTLED_RADIUS = scaleToRadius(SCALE_SETTLED)

// Zoom speed = base * (1 + smoothed energy * gain + beat envelope * boost), capped.
// Energy is the mean deviation from 128 on a 0-128 scale, so typical music sits around 5-30.
const ENERGY_EMA_HALF_LIFE_SECONDS = 0.3
const ENERGY_SPEED_GAIN = 0.2
const PEAK_SPEED_BOOST = 1.5
const MAX_SPEED_MULTIPLIER = 8

// The shared user sliders map onto the Julia view. The default speed (2) keeps the base pace;
// rotation spins the whole view about the fixed point, which keeps the loop seamless.
const SPEED_DEFAULT = 2

// Switcheroo hop size in tour points for the current Speed.
const switcherooHopPoints = (speed: number): number => Math.max(
  SWITCHEROO_MIN_HOP_POINTS,
  SWITCHEROO_HOP_POINTS_AT_DEFAULT_SPEED * Math.pow(Math.max(SHAPE_MIN_SPEED, speed) / SPEED_DEFAULT, SWITCHEROO_HOP_SPEED_EXPONENT),
)

// Steering reads the same shared camera position the Camera Position pad writes (and Hopalong's
// camera reads), in pad units clamped to +/- user.cameraBound (0-500); the shift per pad unit is shared
// with the Hopalong shockwave so both waves start from the same spot.
const STEER_EMA_HALF_LIFE_SECONDS = 0.7

// Effect tuning. Each mirrors a Hopalong effect behind the same checkbox.
const WOBWOB_RECOIL = 2
const SHOCKWAVE_BASE_SPEED = 0.9
const SHOCKWAVE_MAX_RADIUS = 3
const GLOW_ENERGY_REFERENCE = 30

const HUE_DRIFT_PER_SEC = 0.015
const HUE_PEAK_JUMP = 0.12

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

// True when c is inside the Mandelbrot set, i.e. its Julia set is connected and detailed rather than dust.
const inMandelbrotSet = (cx: number, cy: number): boolean => {
  let zRe = 0
  let zIm = 0
  for (let n = 0; n < 200; n++) {
    const nextRe = zRe * zRe - zIm * zIm + cx
    zIm = 2 * zRe * zIm + cy
    zRe = nextRe
    if (zRe * zRe + zIm * zIm > 4) return false
  }
  return true
}

// The one place the shape position is read: the Fractal config's Tour slider, as 0 to 1 along the tour.
const getShapePosition = (): number => {
  const { value, min, max } = window.config.fractal.tour
  return Math.max(0, Math.min(1, (value - min) / (max - min)))
}

export class JuliaVisualizer {
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
  private cycloneAmount = 0
  private hasStartedLoop = false

  // The small drift/audio offset on top of the tour's c for the CURRENT loop. It only steps toward its
  // (drift + audio) target at the wrap instant -- self-similarity wants c steady across a wrap, otherwise
  // the two ends of the zoom are different Julia sets and the wrap pops. Intentional shape changes
  // (the Shape slider, Switcheroo hops) are different: they morph continuously in time, so no seam.
  private loopOffsetX = 0
  private loopOffsetY = 0

  // Shape source: by default the Tour slider walks the tour; dragging the shape pad (or choosing a
  // famous shape) switches to a manual point in the c plane until the Tour slider moves again.
  private tourGlider = new ShapeGlider()
  private hasTourPosition = false
  private switcherooHop = 0
  private lastTourValue: number | null = null
  private viewRadius = W_START
  private hasViewRadius = false
  private wideBlend = 0
  private manual = false
  private manualRe = 0
  private manualIm = 0
  private manualHomeRe = 0
  private manualHomeIm = 0
  private manualHopRe = 0
  private manualHopIm = 0
  private manualVelocityRe = 0
  private manualVelocityIm = 0
  private shapeRe = 0
  private shapeIm = 0
  private hasShape = false
  private shockAge = -1

  // Draws into a render target with the layer compositor's shared renderer through renderTo().
  init(): void {
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
        uSaturation: { value: 1 },
        uGlow: { value: 0 },
        uShockRadius: { value: 0 },
        uShockStrength: { value: 0 },
      },
    })

    const geometry = new THREE.PlaneGeometry(2, 2)
    const mesh = new THREE.Mesh(geometry, this.material)
    this.scene.add(mesh)

    window.addEventListener('resize', this.onResize)

    // Bridge for the config panel's shape pad, which can live in a popup window (like the camera pad).
    window.setJuliaShape = (re: number, im: number) => this.setShape(re, im)
    window.getJuliaShape = () => this.getShape()
    window.clearJuliaShape = () => this.clearShape()
  }

  private onResize = (): void => {
    if (!this.material) return
    this.material.uniforms.uAspect!.value = window.innerWidth / window.innerHeight
  }

  private emaTowards(current: number, target: number, dtSeconds: number): number {
    const k = 1 - Math.pow(0.5, dtSeconds / EMA_HALF_LIFE_SECONDS)
    return current + (target - current) * k
  }

  // Switches the shape to a manual point in the c plane (clamped to the shape pad's map). The shape heads
  // there at a Speed-based rate, also while the pointer is dragging, rather than snapping to it.
  setShape(re: number, im: number): void {
    if (!this.manual) {
      const current = tourPoint(this.tourGlider.position)
      this.manualRe = current.re
      this.manualIm = current.im
      this.manualVelocityRe = 0
      this.manualVelocityIm = 0
      this.manual = true
    }
    this.manualHomeRe = Math.max(JULIA_MAP_VIEW.reMin, Math.min(JULIA_MAP_VIEW.reMax, re))
    this.manualHomeIm = Math.max(JULIA_MAP_VIEW.imMin, Math.min(JULIA_MAP_VIEW.imMax, im))
    this.manualHopRe = 0
    this.manualHopIm = 0
  }

  // Hands the shape back to the Tour slider's tour, rejoining it at the nearest point to where we are.
  clearShape(): void {
    if (!this.manual) return
    this.manual = false
    let bestPosition = 0
    let bestDistance = Number.POSITIVE_INFINITY
    for (let position = 0; position <= TOUR.length - 1; position += 0.05) {
      const point = tourPoint(position)
      const distance = Math.hypot(point.re - this.manualRe, point.im - this.manualIm)
      if (distance < bestDistance) {
        bestDistance = distance
        bestPosition = position
      }
    }
    this.tourGlider.reset(bestPosition)
    this.tourGlider.retarget()
    this.switcherooHop = 0
  }

  // The shape's current c (before the small drift and audio offsets), whether it is manual, and the
  // current palette hue and saturation so the shape pad can match the visualizer's colors.
  getShape(): { re: number; im: number; manual: boolean; hue: number; saturation: number; targetRe: number; targetIm: number } {
    const hue = this.huePhase
    const saturation = window.config.particle.saturation.value
    if (this.hasShape) {
      // The shape trails its target: in manual mode that is where the pointer last put it (plus any
      // Switcheroo hop), on the tour it is the Tour slider's point plus the hop.
      const tourTarget = tourPoint(this.currentTourTarget())
      const targetRe = this.manual ? this.manualHomeRe + this.manualHopRe : tourTarget.re
      const targetIm = this.manual ? this.manualHomeIm + this.manualHopIm : tourTarget.im
      return { re: this.shapeRe, im: this.shapeIm, manual: this.manual, hue, saturation, targetRe, targetIm }
    }
    const start = tourPoint(getShapePosition() * (TOUR.length - 1))
    return { re: start.re, im: start.im, manual: false, hue, saturation, targetRe: start.re, targetIm: start.im }
  }

  private currentTourTarget(): number {
    return Math.max(0, Math.min(TOUR.length - 1, getShapePosition() * (TOUR.length - 1) + this.switcherooHop))
  }

  private hopManualShape(speed: number): void {
    const hopDistance = switcherooHopPoints(speed) * MANUAL_HOP_DISTANCE_PER_TOUR_POINT
    const maxRadius = hopDistance * SWITCHEROO_MAX_HOPS
    const targetRe = this.manualHomeRe + this.manualHopRe
    const targetIm = this.manualHomeIm + this.manualHopIm
    // Prefer hopping to a point on the same side of the set boundary as the chosen point (connected
    // shapes stay connected, dust stays dust); if none turns up, take any nearby point so it still hops.
    const homeInside = inMandelbrotSet(this.manualHomeRe, this.manualHomeIm)
    for (const requireSameSide of [true, false]) {
      for (let attempt = 0; attempt < 24; attempt++) {
        const angle = Math.random() * Math.PI * 2
        const candidateRe = targetRe + Math.cos(angle) * hopDistance
        const candidateIm = targetIm + Math.sin(angle) * hopDistance
        const inView = candidateRe > JULIA_MAP_VIEW.reMin && candidateRe < JULIA_MAP_VIEW.reMax
          && candidateIm > JULIA_MAP_VIEW.imMin && candidateIm < JULIA_MAP_VIEW.imMax
        const nearHome = Math.hypot(candidateRe - this.manualHomeRe, candidateIm - this.manualHomeIm) <= maxRadius
        if (!inView || !nearHome) continue
        if (requireSameSide && inMandelbrotSet(candidateRe, candidateIm) !== homeInside) continue
        this.manualHopRe = candidateRe - this.manualHomeRe
        this.manualHopIm = candidateIm - this.manualHomeIm
        return
      }
    }
  }

  // Chases the target (the chosen point plus any Switcheroo hop) at a Speed-based rate, including while
  // you drag: the shape trails the pointer instead of snapping to it. The velocity is smoothed and eased
  // out near the target, and a far target speeds the chase up so it never takes longer than the cap.
  private stepManualShape(speed: number, dt: number): Complex {
    const targetRe = this.manualHomeRe + this.manualHopRe
    const targetIm = this.manualHomeIm + this.manualHopIm
    const offsetRe = targetRe - this.manualRe
    const offsetIm = targetIm - this.manualIm
    const distance = Math.hypot(offsetRe, offsetIm)
    if (distance < 1e-6) {
      this.manualRe = targetRe
      this.manualIm = targetIm
      this.manualVelocityRe = 0
      this.manualVelocityIm = 0
      return { re: this.manualRe, im: this.manualIm }
    }
    const rate = Math.max(MANUAL_C_UNITS_PER_SEC_PER_SPEED * Math.max(SHAPE_MIN_SPEED, speed), distance / SHAPE_MAX_TRANSITION_SECONDS)
    const desiredSpeed = rate * Math.min(1, distance / Math.max(1e-6, rate * SHAPE_EASE_SECONDS))
    const smoothing = 1 - Math.pow(0.5, dt / SHAPE_VELOCITY_HALF_LIFE_SECONDS)
    this.manualVelocityRe += ((offsetRe / distance) * desiredSpeed - this.manualVelocityRe) * smoothing
    this.manualVelocityIm += ((offsetIm / distance) * desiredSpeed - this.manualVelocityIm) * smoothing
    const stepRe = this.manualVelocityRe * dt
    const stepIm = this.manualVelocityIm * dt
    // Land on the target instead of overshooting it.
    if (Math.hypot(stepRe, stepIm) >= distance) {
      this.manualRe = targetRe
      this.manualIm = targetIm
      this.manualVelocityRe = 0
      this.manualVelocityIm = 0
    } else {
      this.manualRe += stepRe
      this.manualIm += stepIm
    }
    return { re: this.manualRe, im: this.manualIm }
  }

  // Where the steering has actually got to, in the camera pad's units (the pad shows the target instantly;
  // this trails it).
  getSteerPosition(): { x: number; y: number } {
    const steerScale = CAMERA_STEER_SCREEN_FRACTION_PER_PAD_UNIT
    return { x: this.steerX / steerScale, y: -this.steerY / steerScale }
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

    const peakValue = audioData.beat.value
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
    this.rotation = (this.rotation + rotationSpeed.value * userConfig.rotationSpeed_RAD_PER_SEC_PER_UNIT * dt) % (Math.PI * 2)

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
    const freshBeat = audioData.beat.fresh

    // Moving the Tour slider hands the shape back to the tour.
    const tourValue = window.config.fractal.tour.value
    if (this.lastTourValue !== null && tourValue !== this.lastTourValue) this.clearShape()
    this.lastTourValue = tourValue

    // Scale sets the view's starting radius; ease it in log space so dragging the slider glides.
    const targetRadius = scaleToRadius(window.config.user.scaleFactor.value / SCALE_UNITS_PER_SLIDER_STEP)
    if (!this.hasViewRadius) {
      this.viewRadius = targetRadius
      this.hasViewRadius = true
    } else {
      const kRadius = 1 - Math.pow(0.5, dt / RADIUS_HALF_LIFE_SECONDS)
      this.viewRadius = Math.exp(Math.log(this.viewRadius) + (Math.log(targetRadius) - Math.log(this.viewRadius)) * kRadius)
    }
    const kWide = 1 - Math.pow(0.5, dt / WIDE_BLEND_HALF_LIFE_SECONDS)
    this.wideBlend += ((this.viewRadius > SEAM_SAFE_RADIUS ? 1 : 0) - this.wideBlend) * kWide

    // Switcheroo: on each beat, hop to a neighboring look and hold it until the next beat; the shape glides
    // there at the Speed-based rate. On the tour that is a few points along it (a random direction, bounded
    // around the slider's home position); in manual mode it is a short step in the c plane on the same side of
    // the Mandelbrot boundary as the point you chose, bounded around that point.
    let baseC: Complex
    if (!this.manual) {
      if (!effects.switcheroo.value) {
        this.switcherooHop = 0
      } else if (freshBeat) {
        const hopPoints = switcherooHopPoints(speed.value)
        const direction = Math.random() < 0.5 ? -hopPoints : hopPoints
        const next = this.switcherooHop + direction
        this.switcherooHop = Math.abs(next) > hopPoints * SWITCHEROO_MAX_HOPS ? this.switcherooHop - direction : next
      }
      const targetTourPosition = this.currentTourTarget()
      if (!this.hasTourPosition) {
        this.tourGlider.reset(targetTourPosition)
        this.hasTourPosition = true
      }
      const tourPosition = this.tourGlider.step(targetTourPosition, SHAPE_POINTS_PER_SEC_PER_SPEED * Math.max(SHAPE_MIN_SPEED, speed.value), dt)
      baseC = tourPoint(tourPosition)
    } else {
      if (!effects.switcheroo.value) {
        this.manualHopRe = 0
        this.manualHopIm = 0
      } else if (freshBeat) {
        this.hopManualShape(speed.value)
      }
      baseC = this.stepManualShape(speed.value, dt)
    }
    this.shapeRe = baseC.re
    this.shapeIm = baseC.im
    this.hasShape = true
    const effectiveCx = baseC.re + this.loopOffsetX
    const effectiveCy = baseC.im + this.loopOffsetY
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

    // Shockwave: a ripple expanding from the fixed point on every beat (the Frequency HUD picks which bands count).
    if (effects.shockwave.value && freshBeat) {
      this.shockAge = 0
    }
    let shockRadius = 0
    let shockStrength = 0
    if (this.shockAge >= 0) {
      this.shockAge += dt
      shockRadius = this.shockAge * (SHOCKWAVE_BASE_SPEED + speed.value / 15)
      if (shockRadius > SHOCKWAVE_MAX_RADIUS) this.shockAge = -1
      else shockStrength = 1 - shockRadius / SHOCKWAVE_MAX_RADIUS
    }

    // Glow: Hopalong drives bloom opacity with peak value * peak energy.
    const glow = effects.glow.value ? Math.min(1, (peakValue * audioData.beat.energy) / GLOW_ENERGY_REFERENCE) : 0

    // Steering: the convergence point moves toward where the camera pad / mouse points (pad y grows downward,
    // the shader's offset y grows upward, hence the flip). The shift is in normalized frame space, so it
    // steers the dive without breaking the self-similar loop.
    const range = window.config.user.cameraBound.value
    const pad = window.getVirtualCameraPosition?.() ?? { x: 0, y: 0 }
    const padX = Math.max(-range, Math.min(range, pad.x))
    const padY = Math.max(-range, Math.min(range, pad.y))
    const steerScale = CAMERA_STEER_SCREEN_FRACTION_PER_PAD_UNIT
    const kSteer = 1 - Math.pow(0.5, dt / STEER_EMA_HALF_LIFE_SECONDS)
    this.steerX += (padX * steerScale - this.steerX) * kSteer
    this.steerY += (-padY * steerScale - this.steerY) * kSteer

    const uniforms = this.material.uniforms
    uniforms.uCenterOffset!.value.set(this.steerX, this.steerY)
    // Breathing zoom for wide views: dive in and back out over one loop (seamless without self-similarity),
    // never past the radius where the shader's series blend begins. The spin follows the zoom the way the
    // sawtooth's does (arg(lambda) per ln|lambda|), and the iteration offset tracks the zoom depth.
    const lnLambda = Math.log(lambdaMag)
    // The dive and the orient turn both settle to nothing as the view widens from SEAM_SAFE_RADIUS to the
    // whole set, so the widest Scale is a fixed full-frame picture of the Julia set.
    const wideFraction = Math.max(0, Math.min(1, Math.log(this.viewRadius / SEAM_SAFE_RADIUS) / Math.log(SETTLED_RADIUS / SEAM_SAFE_RADIUS)))
    const settle = 1 - wideFraction * wideFraction * (3 - 2 * wideFraction)
    const breathDepth = settle * Math.min(logZoomPerLoop, Math.max(0, Math.log(this.viewRadius / WIDE_DIVE_FLOOR_RADIUS)))
    const breathZoom = -breathDepth * 0.5 * (1 - Math.cos(Math.PI * 2 * this.loopT))
    const breathSpin = (lambdaArg / lnLambda) * breathZoom
    const breathIterOffset = -breathZoom / lnLambda
    const blend = this.wideBlend
    uniforms.uWStart!.value = this.viewRadius
    uniforms.uIterOffset!.value = this.loopT * LOOP_PERIODS * (1 - blend) + breathIterOffset * blend
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
    uniforms.uOrient!.value = this.orientAngle * settle
    uniforms.uSpin!.value = this.spinAngle * (1 - blend) + breathSpin * blend
    uniforms.uLogZoom!.value = this.logZoom * (1 - blend) + breathZoom * blend
    uniforms.uHuePhase!.value = this.huePhase
    this.cycloneAmount += ((effects.cyclone.value ? 1 : 0) - this.cycloneAmount) * (1 - Math.pow(0.5, dt / CYCLONE_HALF_LIFE_SECONDS))
    uniforms.uCyclone!.value = this.cycloneAmount
    uniforms.uGlow!.value = glow
    uniforms.uSaturation!.value = window.config.particle.saturation.value
    uniforms.uShockRadius!.value = shockRadius
    uniforms.uShockStrength!.value = shockStrength
  }

  // Draws into the caller's target with the caller's renderer.
  renderTo(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget): void {
    if (!this.scene || !this.camera) return
    renderer.setRenderTarget(target)
    renderer.render(this.scene, this.camera)
    renderer.setRenderTarget(null)
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize)
    delete window.setJuliaShape
    delete window.getJuliaShape
    delete window.clearJuliaShape
    this.material?.dispose()
  }
}
