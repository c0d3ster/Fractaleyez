import * as THREE from 'three'
import { CAMERA_STEER_SCREEN_FRACTION_PER_PAD_UNIT, getParticleCrossfadeDurationMs } from '../config/visualizer.config'
import type { AudioSnapshot } from '../audioanalysis/audio-snapshot'
import { buildJuliaFragmentShader, juliaVertexShader } from './shaders/julia-fragment.glsl'
import { activeFractalFamily, FRACTAL_FAMILIES, fractalTypesEnabled, koenigsPoint, quadraticFamily, type Complex, type FixedPointResult, type FractalFamily } from './fractal-families'
import { userConfig } from '../config/user.config'
import { userHeading } from '../config/heading'
import { HeadingFollower } from '../config/headingFollower'
import { FRACTAL_MAX_ITERATIONS, QUALITY_PROFILES } from '../config/quality.config'
import { getDisplayedColor } from '../config/displayedColor'
import { LUT_SIZE } from '../config/paletteLut'
import { JULIA_SCALE, SCALE_UNITS_PER_SLIDER_STEP } from '../config/juliaScale.config'
import { ghostKey, ghostStore } from '../utils/ghostStore'
import { stepToward } from './step-toward'
import { startupTimeline } from './perf/startup'
import { SHAPE_EASE_SECONDS, SHAPE_MAX_TRANSITION_SECONDS, SHAPE_VELOCITY_HALF_LIFE_SECONDS, ShapeGlider } from './shape-glider'

const TOUR_GHOST = ghostKey('fractal', 'tour')

// A tier change moves the iteration cap this fast (Quality to Balanced, 128 to 96, takes about half a second).
const ITERATION_STEP_PER_SECOND = 64

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
// The eyeball zone's smallest picture, as a multiple of the family's whole-set radius.
const EYEBALL_RADIUS_FACTOR = 2
// Motion (dive, spin, orient turn) finishes settling at this Scale, so 0.3x down is a still picture.
const SCALE_SETTLED = JULIA_SCALE.settled
const DEEP_SCALE_SPAN = 0.5
const DEEP_SCALE_FACTOR = 3
// Measured wrap mismatch of the 3rd-order Koenigs loop grows with the cube of the starting radius: for z^2 + c it is
// sub-pixel up to about 0.2 (roughly Scale 0.7x) and pops beyond that (each family's seamSafeRadius). Wider views
// swap the sawtooth zoom for a breathing one (zoom in and back out, seamless by construction), and never dive past
// the radius where the shader's series blend begins (WIDE_DIVE_FLOOR_FACTOR times the seam-safe radius).
const WIDE_DIVE_FLOOR_FACTOR = 1.25
// Where the shader's series blend begins (WIDE_START in julia-fragment.glsl.ts): the breathing dive never goes below it either.
const SERIES_BLEND_START_RADIUS = 0.25
// The most a family's referenceMultiplier may speed the loop up or slow it down.
const ZOOM_RATE_MIN_FACTOR = 0.4
const ZOOM_RATE_MAX_FACTOR = 2.5
// The longest step a Type crossfade takes in one frame (see stepFamilyFade).
const FAMILY_FADE_MAX_STEP_SECONDS = 0.05
// What the picture fading out after a Type change takes from the new one each frame: everything but its own shape.
const SHARED_UNIFORMS = [
  'uSpin', 'uLogZoom', 'uWStart', 'uAspect', 'uHuePhase', 'uPaletteCycles', 'uPalettePhase', 'uCenterOffset', 'uIterOffset',
  'uRotation', 'uCyclone', 'uSaturation', 'uGlow', 'uShockRadius', 'uShockStrength', 'uMaxIter',
] as const
const WIDE_BLEND_HALF_LIFE_SECONDS = 0.4
const RADIUS_HALF_LIFE_SECONDS = 0.15


const scaleToRadius = (scale: number, wholeSetRadius: number): number => {
  if (scale >= SCALE_DEFAULT) return W_START * Math.pow(DEEP_SCALE_FACTOR, -(scale - SCALE_DEFAULT) / DEEP_SCALE_SPAN)
  if (scale >= SCALE_WHOLE_SET) {
    const wideness = (SCALE_DEFAULT - scale) / (SCALE_DEFAULT - SCALE_WHOLE_SET)
    return W_START * Math.pow(wholeSetRadius / W_START, wideness)
  }
  const eyeball = (SCALE_WHOLE_SET - Math.max(SCALE_MIN, scale)) / (SCALE_WHOLE_SET - SCALE_MIN)
  return wholeSetRadius * Math.pow(EYEBALL_RADIUS_FACTOR, eyeball)
}

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
// camera reads), in pad units clamped to +/- user.sway (0-500); the shift per pad unit is shared
// with the Hopalong shockwave so both waves start from the same spot.
const STEER_EMA_HALF_LIFE_SECONDS = 0.7

// Effect tuning. Each mirrors a Hopalong effect behind the same checkbox.
const WOBWOB_RECOIL = 2
// Ring speed is the post-processing shockwave's formula (see PostEffects.render): the Speed slider over 15 plus a beat term,
// with a small base added so the ring keeps pace with it.
const SHOCKWAVE_BASE_SPEED = 0.15
const SHOCKWAVE_BEAT_SPEED_GAIN = 1.25
const SHOCKWAVE_MAX_RADIUS = 3
const GLOW_ENERGY_REFERENCE = 30

const HUE_DRIFT_PER_SEC = 0.015
const HUE_PEAK_JUMP = 0.12

// Position along the tour in stop units (0 to tour.length - 1), smoothly interpolated between stops
// with a Catmull-Rom spline so dragging the slider morphs continuously instead of snapping.
const tourPoint = (tour: FractalFamily['tour'], position: number): Complex => {
  const last = tour.length - 1
  const clamped = Math.max(0, Math.min(last, position))
  const index = Math.min(last - 1, Math.floor(clamped))
  const t = clamped - index
  const stop = (i: number): Complex => {
    const [re, im] = tour[Math.max(0, Math.min(last, i))]!
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
const orbit: [number, number] = [0, 0]
const massDirection = (family: FractalFamily, c: Complex, fixed: FixedPointResult): number | null => {
  let sumX = 0
  let sumY = 0
  let total = 0
  for (let i = 0; i < ORIENT_DIRECTIONS; i++) {
    const angle = (i / ORIENT_DIRECTIONS) * Math.PI * 2
    const cosA = Math.cos(angle)
    const sinA = Math.sin(angle)
    for (const ring of ORIENT_RING_RADII) {
      const start = koenigsPoint(fixed, { re: W_START * ring * cosA, im: W_START * ring * sinA })
      orbit[0] = start.re
      orbit[1] = start.im
      let weight = 1
      for (let n = 0; n < ORIENT_MAX_ITER; n++) {
        family.step(orbit, c.re, c.im)
        if (family.escaped(orbit[0], orbit[1])) {
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

// The one place the shape position is read: the Fractal config's Tour slider, as 0 to 1 along the tour.
const getShapePosition = (): number => {
  const { value, min, max } = window.config.fractal.tour
  return Math.max(0, Math.min(1, (value - min) / (max - min)))
}

// A Type's mesh, with the material type three's untyped Mesh loses.
type FamilyMesh = THREE.Mesh & { material: THREE.ShaderMaterial }

export class JuliaVisualizer {
  private scene: THREE.Scene | null = null
  private camera: THREE.OrthographicCamera | null = null
  private material: THREE.ShaderMaterial | null = null

  private smoothBass = 0
  private smoothTreble = 0
  private smoothEnergy = 0
  private rotation = 0
  private readonly headingFollower = new HeadingFollower(userHeading)
  private steerX = 0
  private steerY = 0
  private driftPhase = 0
  private loopProgress = 0
  private lastWrapIndex = 0
  private loopT = 0
  // The view's turn at the loop wrap: zooming one self-similarity period deeper shows the same picture turned by arg(lambda), so each wrap
  // turns the view by a loop's worth to match, and between wraps it does not turn at all.
  private spinAngle = 0
  private logZoom = 0
  private orientAngle = 0
  private hasOrient = false
  private huePhase = 0
  // The chosen Color palette, as a one-row texture the shader reads; paletteKey is the palette it was last filled for.
  private readonly paletteTexture = new THREE.DataTexture(new Uint8Array(LUT_SIZE * 4), LUT_SIZE, 1, THREE.RGBAFormat)
  private paletteKey = ''
  private cycloneAmount = 0
  private hasStartedLoop = false
  // The iteration cap the tier asks for, and the one the shader runs now (null until the first tier is applied).
  private iterationTarget = QUALITY_PROFILES.quality.fractalIterations
  private iterationCurrent: number | null = null

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
  // The fractal family drawn (the Fractal config's Type) and the fixed point the zoom sat on last frame, so it stays on the same one.
  private family: FractalFamily = quadraticFamily
  private previousFixedPoint: Complex | null = null
  // One mesh per Type, made once and kept (hidden while not drawn), so its shader compiles only once: three.js frees a program as soon as no
  // material uses it, so making a material per switch compiled the shader again on every Type change, a freeze of a few hundred ms.
  private readonly familyMeshes = new Map<FractalFamily, FamilyMesh>()
  private mesh: FamilyMesh | null = null
  // Types whose shader has compiled (drawn at least once).
  private readonly warmedFamilies = new Set<FractalFamily>()
  // The type being faded out after a Type change, drawn under the new one until the fade ends; 0 to 1 through the fade.
  private outgoing: FamilyMesh | null = null
  private familyFade = 1
  private readonly geometry = new THREE.PlaneGeometry(2, 2)
  private lastLambdaMag = 0
  private shockRadius = 0

  // Draws into a render target with the layer compositor's shared renderer through renderTo().
  init(): void {
    this.family = activeFractalFamily(window.config.fractal.family.value)
    this.scene = new THREE.Scene()
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.paletteTexture.wrapS = THREE.RepeatWrapping
    this.paletteTexture.magFilter = THREE.LinearFilter
    this.paletteTexture.minFilter = THREE.LinearFilter

    FRACTAL_FAMILIES.forEach((family) => {
      const mesh = new THREE.Mesh(this.geometry, this.createMaterial(family)) as FamilyMesh
      mesh.visible = family === this.family
      this.familyMeshes.set(family, mesh)
      this.scene?.add(mesh)
    })
    this.mesh = this.familyMeshes.get(this.family) ?? null
    this.material = this.mesh?.material ?? null

    window.addEventListener('resize', this.onResize)

    // Bridge for the config panel's shape pad, which can live in a popup window (like the camera pad).
    window.setJuliaShape = (re: number, im: number) => this.setShape(re, im)
    window.getJuliaShape = () => this.getShape()
    window.clearJuliaShape = () => this.clearShape()
  }

  private createMaterial(family: FractalFamily): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: juliaVertexShader,
      fragmentShader: buildJuliaFragmentShader(family),
      uniforms: {
        uC: { value: new THREE.Vector2() },
        uFixedPoint: { value: new THREE.Vector2() },
        uOrient: { value: 0 },
        uSpin: { value: 0 },
        uLogZoom: { value: 0 },
        uWStart: { value: W_START },
        uAspect: { value: window.innerWidth / window.innerHeight },
        uHuePhase: { value: 0 },
        uPaletteCycles: { value: 1 },
        uPalettePhase: { value: 0 },
        uPalette: { value: this.paletteTexture },
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
        uMaxIter: { value: this.iterationCurrent ?? QUALITY_PROFILES.quality.fractalIterations },
        uOpacity: { value: 1 },
      },
    })
  }

  private onResize = (): void => {
    this.familyMeshes.forEach(({ material }) => {
      material.uniforms.uAspect!.value = window.innerWidth / window.innerHeight
    })
  }

  /**
   * Compiles the shown Type's shader now. Its long loop takes a while to compile, and left until the layer is first switched on that shows
   * as a freeze. The other Types compile later, one at a time, through warmNextFamily.
   */
  warm(renderer: THREE.WebGLRenderer): void {
    this.warmFamily(renderer, this.family)
  }

  /**
   * Compiles one Type the viewer has not seen yet (each is a separate freeze, so the caller spreads them out over idle time). Returns false
   * once every Type is ready. A Type picked before its turn compiles when it first draws, as before.
   */
  warmNextFamily(renderer: THREE.WebGLRenderer): boolean {
    if (!fractalTypesEnabled()) return false
    const next = FRACTAL_FAMILIES.find((family) => !this.warmedFamilies.has(family))
    if (!next) return false
    this.warmFamily(renderer, next)
    return FRACTAL_FAMILIES.some((family) => !this.warmedFamilies.has(family))
  }

  // Draws one Type alone into a 1x1 target: that compiles its shader, and also finishes it on drivers that only do so at the first draw.
  private warmFamily(renderer: THREE.WebGLRenderer, family: FractalFamily): void {
    const { scene, camera } = this
    const mesh = this.familyMeshes.get(family)
    if (!scene || !camera || !mesh) return
    const target = new THREE.WebGLRenderTarget(1, 1)
    const shown = new Map([...this.familyMeshes.values()].map((other) => [other, other.visible]))
    shown.forEach((_visible, other) => {
      other.visible = other === mesh
    })
    startupTimeline.span(`fractal-type:${family.key}`, () => {
      renderer.setRenderTarget(target)
      renderer.render(scene, camera)
      renderer.setRenderTarget(null)
    })
    shown.forEach((visible, other) => {
      other.visible = visible
    })
    target.dispose()
    this.warmedFamilies.add(family)
  }

  /**
   * How many escape-time iterations each pixel runs at most; the quality tier sets it. The cap is the thickness of the black inside the
   * set and of the detail at its edge, so a tier change moves it at `ITERATION_STEP_PER_SECOND` instead of snapping, which would redraw
   * the whole picture in one frame. The first value applies at once.
   */
  setMaxIterations(iterations: number): void {
    if (!this.material) return
    this.iterationTarget = Math.min(FRACTAL_MAX_ITERATIONS, Math.max(1, iterations))
    if (this.iterationCurrent === null) this.applyIterations(this.iterationTarget)
  }

  private applyIterations = (iterations: number): void => {
    this.iterationCurrent = iterations
    this.familyMeshes.forEach(({ material }) => {
      material.uniforms.uMaxIter!.value = iterations
    })
  }

  /**
   * Switches to another fractal family (the Type picker): its shader replaces the current one, and the shape starts over on the new
   * family's tour at the Tour slider's position, since a point of one family's parameter plane means nothing in another's.
   */
  private setFamily(family: FractalFamily): void {
    this.family = family
    const incoming = this.familyMeshes.get(family)
    const current = this.mesh
    if (incoming && current && incoming !== current) {
      // Over the Crossfade Duration the old type keeps drawing underneath and the new one fades in over it (see stepFamilyFade).
      // A switch in the middle of a fade drops the older picture: the one on screen becomes the one fading out.
      if (this.outgoing && this.outgoing !== incoming) this.outgoing.visible = false
      this.outgoing = null
      if (getParticleCrossfadeDurationMs() > 0) {
        current.material.uniforms.uOpacity!.value = 1
        current.material.transparent = false
        current.renderOrder = 0
        this.outgoing = current
        incoming.material.transparent = true
        incoming.material.uniforms.uOpacity!.value = 0
        this.familyFade = 0
      } else {
        current.visible = false
        incoming.material.transparent = false
        incoming.material.uniforms.uOpacity!.value = 1
      }
      incoming.renderOrder = 1
      incoming.visible = true
      this.mesh = incoming
      this.material = incoming.material
    }
    this.manual = false
    this.manualHopRe = 0
    this.manualHopIm = 0
    this.switcherooHop = 0
    this.hasTourPosition = false
    this.previousFixedPoint = null
    this.hasOrient = false
    // The drift and audio offset on c was in the old family's units; take the new family's at the next frame instead of easing over.
    this.hasStartedLoop = false
  }

  // How much faster or slower than the base pace the loop runs, so families with much bigger or smaller multipliers than z^2 + c keep its
  // zoom speed (see FractalFamily.referenceMultiplier). Uses last frame's multiplier: this frame's depends on the shape it is about to step.
  private zoomRateFactor(): number {
    const { referenceMultiplier } = this.family
    if (referenceMultiplier === undefined || this.lastLambdaMag <= 1) return 1
    const factor = Math.log(referenceMultiplier) / Math.log(this.lastLambdaMag)
    return Math.max(ZOOM_RATE_MIN_FACTOR, Math.min(ZOOM_RATE_MAX_FACTOR, factor))
  }

  private syncFamily(): void {
    const family = activeFractalFamily(window.config.fractal.family.value)
    if (family !== this.family) this.setFamily(family)
  }

  private dropOutgoing(): void {
    if (!this.outgoing) return
    this.outgoing.visible = false
    this.outgoing = null
  }

  /**
   * Moves a Type crossfade along. The picture fading out keeps its own shape (its c, fixed point and orientation) but takes the shared
   * zoom, spin, palette and effects from the new one, so it keeps moving with the music while it fades instead of freezing.
   */
  private stepFamilyFade(dt: number): void {
    if (!this.outgoing || !this.material) return
    const crossfadeMs = getParticleCrossfadeDurationMs()
    // The first frame of a new type compiles its shader, which can take a while: cap the step so the fade does not jump past it.
    this.familyFade = crossfadeMs > 0 ? Math.min(1, this.familyFade + Math.min(dt, FAMILY_FADE_MAX_STEP_SECONDS) * 1000 / crossfadeMs) : 1
    if (this.familyFade >= 1) {
      this.dropOutgoing()
      this.material.transparent = false
      this.material.uniforms.uOpacity!.value = 1
      return
    }
    const { uniforms } = this.material
    const outgoing = this.outgoing.material.uniforms
    SHARED_UNIFORMS.forEach((name) => {
      const value = uniforms[name]!.value as unknown
      if (value instanceof THREE.Vector2) (outgoing[name]!.value as THREE.Vector2).copy(value)
      else outgoing[name]!.value = value
    })
    const t = this.familyFade
    uniforms.uOpacity!.value = t * t * (3 - 2 * t)
  }

  private emaTowards(current: number, target: number, dtSeconds: number): number {
    const k = 1 - Math.pow(0.5, dtSeconds / EMA_HALF_LIFE_SECONDS)
    return current + (target - current) * k
  }

  // Switches the shape to a manual point in the c plane (clamped to the shape pad's map). The shape heads
  // there at a Speed-based rate, also while the pointer is dragging, rather than snapping to it.
  setShape(re: number, im: number): void {
    // The pad may pick a shape while the layer is hidden and not updating, right after a Type change: take the new type first, so the
    // shape lands in its plane and the next update keeps it.
    this.syncFamily()
    if (!this.manual) {
      const current = tourPoint(this.family.tour, this.tourGlider.position)
      this.manualRe = current.re
      this.manualIm = current.im
      this.manualVelocityRe = 0
      this.manualVelocityIm = 0
      this.manual = true
    }
    const { mapView } = this.family
    this.manualHomeRe = Math.max(mapView.reMin, Math.min(mapView.reMax, re))
    this.manualHomeIm = Math.max(mapView.imMin, Math.min(mapView.imMax, im))
    this.manualHopRe = 0
    this.manualHopIm = 0
  }

  // Hands the shape back to the Tour slider's tour, rejoining it at the nearest point to where we are.
  clearShape(): void {
    if (!this.manual) return
    this.manual = false
    let bestPosition = 0
    let bestDistance = Number.POSITIVE_INFINITY
    const { tour } = this.family
    for (let position = 0; position <= tour.length - 1; position += 0.05) {
      const point = tourPoint(tour, position)
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
    const saturation = getDisplayedColor().saturation
    if (this.hasShape) {
      // The shape trails its target: in manual mode that is where the pointer last put it (plus any
      // Switcheroo hop), on the tour it is the Tour slider's point plus the hop.
      const tourTarget = tourPoint(this.family.tour, this.currentTourTarget())
      const targetRe = this.manual ? this.manualHomeRe + this.manualHopRe : tourTarget.re
      const targetIm = this.manual ? this.manualHomeIm + this.manualHopIm : tourTarget.im
      return { re: this.shapeRe, im: this.shapeIm, manual: this.manual, hue, saturation, targetRe, targetIm }
    }
    const start = tourPoint(this.family.tour, getShapePosition() * (this.family.tour.length - 1))
    return { re: start.re, im: start.im, manual: false, hue, saturation, targetRe: start.re, targetIm: start.im }
  }

  // Shows the Tour slider where a Switcheroo hop has the shape headed, beside the slider's own thumb (which stays on the stored value).
  // Only on the tour and only while a hop is in effect; in manual mode the slider is not what steers the shape.
  private publishTourGhost(): void {
    const { tour } = window.config.fractal
    const hopped = !this.manual && this.switcherooHop !== 0
    const along = this.currentTourTarget() / (this.family.tour.length - 1)
    ghostStore.set(TOUR_GHOST, hopped ? tour.min + along * (tour.max - tour.min) : null)
  }

  /** Clears the Tour ghost while the layer is hidden: `update` stops running then, so nothing else would take it down. */
  clearTourGhost(): void {
    ghostStore.set(TOUR_GHOST, null)
  }

  private currentTourTarget(): number {
    const last = this.family.tour.length - 1
    return Math.max(0, Math.min(last, getShapePosition() * last + this.switcherooHop))
  }

  private hopManualShape(speed: number): void {
    const hopDistance = switcherooHopPoints(speed) * MANUAL_HOP_DISTANCE_PER_TOUR_POINT * this.family.parameterScale
    const maxRadius = hopDistance * SWITCHEROO_MAX_HOPS
    const targetRe = this.manualHomeRe + this.manualHopRe
    const targetIm = this.manualHomeIm + this.manualHopIm
    // Prefer hopping to a point on the same side of the set boundary as the chosen point (connected
    // shapes stay connected, dust stays dust); if none turns up, take any nearby point so it still hops.
    const { mapView, parameterInSet } = this.family
    const homeInside = parameterInSet({ re: this.manualHomeRe, im: this.manualHomeIm })
    for (const requireSameSide of [true, false]) {
      for (let attempt = 0; attempt < 24; attempt++) {
        const angle = Math.random() * Math.PI * 2
        const candidateRe = targetRe + Math.cos(angle) * hopDistance
        const candidateIm = targetIm + Math.sin(angle) * hopDistance
        const inView = candidateRe > mapView.reMin && candidateRe < mapView.reMax
          && candidateIm > mapView.imMin && candidateIm < mapView.imMax
        const nearHome = Math.hypot(candidateRe - this.manualHomeRe, candidateIm - this.manualHomeIm) <= maxRadius
        if (!inView || !nearHome) continue
        if (requireSameSide && parameterInSet({ re: candidateRe, im: candidateIm }) !== homeInside) continue
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
    const rate = Math.max(MANUAL_C_UNITS_PER_SEC_PER_SPEED * this.family.parameterScale * Math.max(SHAPE_MIN_SPEED, speed), distance / SHAPE_MAX_TRANSITION_SECONDS)
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

  update(deltaTime: number, audioData: AudioSnapshot): void {
    if (!this.material) return
    const dt = deltaTime / 1000
    this.syncFamily()
    if (this.iterationCurrent !== null && this.iterationCurrent !== this.iterationTarget) {
      this.applyIterations(stepToward(this.iterationCurrent, this.iterationTarget, ITERATION_STEP_PER_SECOND * dt))
    }

    const bands = audioData.bands
    const bassRaw = (bands[0] ?? 0) / 255
    const trebleRaw = (bands[bands.length - 1] ?? 0) / 255
    this.smoothBass = this.emaTowards(this.smoothBass, bassRaw, dt)
    this.smoothTreble = this.emaTowards(this.smoothTreble, trebleRaw, dt)

    // Continuously-evolving target offset from slow autonomous drift + audio -- only ever
    // committed into the render at a loop wrap, never used mid-loop (see field comment above).
    this.driftPhase += dt * C_DRIFT_SPEED
    // In the family's own parameter units (see FractalFamily.parameterScale).
    const { parameterScale } = this.family
    const targetOffsetX = (Math.cos(this.driftPhase) * C_DRIFT_RADIUS + this.smoothBass * BASS_C_INFLUENCE) * parameterScale
    const targetOffsetY = (Math.sin(this.driftPhase * 1.3) * C_DRIFT_RADIUS + this.smoothTreble * TREBLE_C_INFLUENCE) * parameterScale

    const peakValue = audioData.beat.value
    const energyTarget = (audioData.energyAverage + audioData.energy) / 2
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
    const progressDelta = BASE_LOOP_SPEED * (speed.value / SPEED_DEFAULT) * musicSpeedMultiplier * wobWobFactor * this.zoomRateFactor() * dt
    this.loopProgress += progressDelta
    // A drag on the Rotation dial turns the view by the difference at once; the speed carries on from there.
    const turn = this.headingFollower.takeTurn(this.rotation)
    this.rotation = (this.rotation + turn + rotationSpeed.value * userConfig.rotationSpeed_RAD_PER_SEC_PER_UNIT * dt) % (Math.PI * 2)
    userHeading.report(this.rotation)

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
        const maxStep = MAX_C_STEP_PER_WRAP * parameterScale
        const limit = stepLength > maxStep ? maxStep / stepLength : 1
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
    const targetRadius = scaleToRadius(window.config.user.scaleFactor.value / SCALE_UNITS_PER_SLIDER_STEP, this.family.wholeSetRadius)
    if (!this.hasViewRadius) {
      this.viewRadius = targetRadius
      this.hasViewRadius = true
    } else {
      const kRadius = 1 - Math.pow(0.5, dt / RADIUS_HALF_LIFE_SECONDS)
      this.viewRadius = Math.exp(Math.log(this.viewRadius) + (Math.log(targetRadius) - Math.log(this.viewRadius)) * kRadius)
    }
    const kWide = 1 - Math.pow(0.5, dt / WIDE_BLEND_HALF_LIFE_SECONDS)
    this.wideBlend += ((this.viewRadius > this.family.seamSafeRadius ? 1 : 0) - this.wideBlend) * kWide

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
      baseC = tourPoint(this.family.tour, tourPosition)
    } else {
      if (!effects.switcheroo.value) {
        this.manualHopRe = 0
        this.manualHopIm = 0
      } else if (freshBeat) {
        this.hopManualShape(speed.value)
      }
      baseC = this.stepManualShape(speed.value, dt)
    }
    this.publishTourGhost()
    this.shapeRe = baseC.re
    this.shapeIm = baseC.im
    this.hasShape = true
    const offset = this.family.shapeOffset?.(baseC, { re: this.loopOffsetX, im: this.loopOffsetY }) ?? { re: this.loopOffsetX, im: this.loopOffsetY }
    const effectiveCx = baseC.re + offset.re
    const effectiveCy = baseC.im + offset.im
    const fixed = this.family.fixedPoint({ re: effectiveCx, im: effectiveCy }, this.previousFixedPoint)
    const { fixedPointX, fixedPointY, lambdaMag, lambdaArg, koenigs2, koenigs3 } = fixed
    this.previousFixedPoint = { re: fixedPointX, im: fixedPointY }
    this.lastLambdaMag = lambdaMag

    // The zoom is carried as a running total instead of being recomputed from the current shape. Recomputing
    // (radius = |lambda|^-t) made the zoom lurch whenever c changed mid-loop, since lambda depends on c. Integrating
    // means a shape change only alters the future rate. At a wrap we add back exactly one loop's worth with the
    // current lambda, which keeps the picture continuous there (self-similarity makes t = 1 and t = 0 the same view).
    // The view does not turn while it zooms: the picture one period deeper is the same one turned by arg(lambda),
    // and turning the view along with the zoom to follow that made every Type spin (Bouquet and Ribbon fastest,
    // where arg(lambda) is largest) even at a Rotation speed of 0. Zoomed straight in, the shapes stream straight
    // out from the center instead, and the turn a seamless wrap needs happens all at once at the wrap, where
    // self-similarity hides it. In the wide views (blend) the zoom breathes without wrapping, so nothing turns there.
    const spinPerLoop = lambdaArg * LOOP_PERIODS
    const logZoomPerLoop = Math.log(lambdaMag) * LOOP_PERIODS
    this.spinAngle = (this.spinAngle + wrapSteps * spinPerLoop * (1 - this.wideBlend)) % (Math.PI * 2)
    this.logZoom += -logZoomPerLoop * progressDelta + wrapSteps * logZoomPerLoop
    // A gentle pull back toward where an unchanged shape would have the zoom, so repeated shape changes
    // can't walk the zoom depth away from the range where the zoom coordinate is accurate.
    this.logZoom += (-logZoomPerLoop * this.loopT - this.logZoom) * (1 - Math.pow(0.5, dt / ZOOM_PULL_HALF_LIFE_SECONDS))

    this.huePhase += HUE_DRIFT_PER_SEC * dt
    if (freshBeat && effects.colorShift.value) this.huePhase += HUE_PEAK_JUMP

    // Shockwave: a ripple expanding from the fixed point on every beat (the Frequency HUD picks which bands count).
    if (effects.shockwave.value && freshBeat) {
      this.shockAge = 0
      this.shockRadius = 0
    }
    let shockStrength = 0
    if (this.shockAge >= 0) {
      this.shockAge += dt
      // Integrated, not age * speed, because the beat term decays while the ring is out.
      this.shockRadius += dt * (SHOCKWAVE_BASE_SPEED + speed.value / 15 + peakValue * SHOCKWAVE_BEAT_SPEED_GAIN)
      if (this.shockRadius > SHOCKWAVE_MAX_RADIUS) this.shockAge = -1
      else shockStrength = 1 - this.shockRadius / SHOCKWAVE_MAX_RADIUS
    }

    // Glow: Hopalong drives bloom opacity with peak value * peak energy.
    const glow = effects.glow.value ? Math.min(1, (peakValue * audioData.beat.energy) / GLOW_ENERGY_REFERENCE) : 0

    // Steering: the convergence point moves toward where the camera pad / mouse points (pad y grows downward,
    // the shader's offset y grows upward, hence the flip). The shift is in normalized frame space, so it
    // steers the dive without breaking the self-similar loop.
    const range = window.config.user.sway.value
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
    // never past the radius where the shader's series blend begins. The iteration offset tracks the zoom depth.
    const lnLambda = Math.log(lambdaMag)
    // The dive and the orient turn both settle to nothing as the view widens from the seam-safe radius to the
    // whole set, so the widest Scale is a fixed full-frame picture of the Julia set.
    const { seamSafeRadius } = this.family
    const wideFraction = Math.max(0, Math.min(1, Math.log(this.viewRadius / seamSafeRadius) / Math.log(scaleToRadius(SCALE_SETTLED, this.family.wholeSetRadius) / seamSafeRadius)))
    const settle = 1 - wideFraction * wideFraction * (3 - 2 * wideFraction)
    const breathDepth = settle * Math.min(logZoomPerLoop, Math.max(0, Math.log(this.viewRadius / Math.max(seamSafeRadius * WIDE_DIVE_FLOOR_FACTOR, SERIES_BLEND_START_RADIUS))))
    const breathZoom = -breathDepth * 0.5 * (1 - Math.cos(Math.PI * 2 * this.loopT))
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
    const mass = massDirection(this.family, { re: effectiveCx, im: effectiveCy }, fixed)
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
    uniforms.uSpin!.value = this.spinAngle
    uniforms.uLogZoom!.value = this.logZoom * (1 - blend) + breathZoom * blend
    uniforms.uHuePhase!.value = this.huePhase
    this.cycloneAmount += ((effects.cyclone.value ? 1 : 0) - this.cycloneAmount) * (1 - Math.pow(0.5, dt / CYCLONE_HALF_LIFE_SECONDS))
    uniforms.uCyclone!.value = this.cycloneAmount
    uniforms.uGlow!.value = glow
    const color = getDisplayedColor()
    uniforms.uSaturation!.value = color.saturation
    uniforms.uPaletteCycles!.value = color.cycles
    uniforms.uPalettePhase!.value = color.phase
    if (color.key !== this.paletteKey) {
      this.paletteKey = color.key
      this.paletteTexture.image.data.set(color.lut)
      this.paletteTexture.needsUpdate = true
    }
    uniforms.uShockRadius!.value = this.shockRadius
    uniforms.uShockStrength!.value = shockStrength
    this.stepFamilyFade(dt)
  }

  // Draws into the caller's target with the caller's renderer.
  renderTo(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget): void {
    if (!this.scene || !this.camera) return
    renderer.setRenderTarget(target)
    renderer.render(this.scene, this.camera)
    renderer.setRenderTarget(null)
    this.warmedFamilies.add(this.family)
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize)
    delete window.setJuliaShape
    delete window.getJuliaShape
    delete window.clearJuliaShape
    ghostStore.set(TOUR_GHOST, null)
    this.familyMeshes.forEach(({ material }) => material.dispose())
    this.familyMeshes.clear()
    this.outgoing = null
    this.geometry.dispose()
  }
}
