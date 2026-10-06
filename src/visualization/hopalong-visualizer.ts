import * as THREE from 'three'

import { AudioAnalysedDataForVisualization } from '../audioanalysis/audio-analysed-data'
import { getResolvedSpriteUrl } from '../utils/spriteCache'
import { acquireSpriteTexture, releaseSpriteTexture } from '../utils/textureCache'
import { getParticleCrossfadeDurationMs, MAX_CROSSFADE_GENERATIONS } from '../config/visualizer.config'
import { userConfig } from '../config/user.config'
import { ColorState, resolveColorState } from '../config/colorState'
import { windowHue } from '../config/hueWindow'
import { sampleLut } from '../config/paletteLut'
import { getMusicSpeedMultiplier } from './music-speed'

/*
 * ORIGINAL AUTHOR: Iacopo Sassarini
 * Modifications made by Cody Douglass and Conor O'Neill
 */
const DEF_BRIGHTNESS = .5

// Orbit parameters
let a = 0; let b = 0; let c = 0; let d = 0; let e = 0

type SubsetPoint = {
  x: number
  y: number
  vertex: THREE.Vector3
}

type ParticleSystem = THREE.Points & {
  myMaterial: THREE.PointsMaterial
  myLevel: number
  mySubset: number
  /** Raw sprite entry (e.g. 'galaxySprite.png') this object was built with, so an orbit-shape
   * crossfade can rebuild an equivalent object without re-deriving the round-robin sprite index. */
  mySpriteUrl: string
  needsUpdate: number
}

/** In-flight opacity crossfade between an orbit-shape change's old and new particle objects,
 * scoped to a single visualizer -- see startOrbitFade(). */
type OrbitFade = {
  outgoing: ParticleSystem[]
  elapsedMs: number
  durationMs: number
}

export class HopalongVisualizer {
  particlesPerLayer: number
  layers: number
  levels: number
  colorState: ColorState
  levelDepth: number
  particleSize: number
  needsParticleReset: boolean
  lights: THREE.PointLight[]
  objects: ParticleSystem[]
  hueValues: number[]
  scene: THREE.Scene
  sprites: string[]
  startTimer: Date | null
  deltaTime: number
  elapsedTime: number
  audioPeak: boolean
  peakCountdown: number
  lastOrbitParams: { a: number; b: number; c: number; d: number; e: number; scaleFactor: number }
  orbit: { subsets: SubsetPoint[][]; xMin: number; xMax: number; yMin: number; yMax: number; scaleX: number; scaleY: number }
  private updateInterval: ReturnType<typeof setInterval> | undefined
  /** Set once this visualizer becomes the outgoing half of a crossfade, so it stops reshaping
   * its orbit from window.config (already overwritten with the incoming preset's values by the
   * time the fade starts) and just fades out its last known shape instead. */
  private frozen: boolean
  /** Older orbit-shape generations still fading out, oldest first. */
  private orbitFades: OrbitFade[]
  /** Current (newest) orbit shape's own fade-in progress. */
  private orbitIncomingElapsedMs: number

  constructor() {
    this.particlesPerLayer = window.config.particle.particlesPerLayer.value
    this.layers = window.config.particle.layers.value
    this.levels = window.config.particle.levels.value
    this.colorState = resolveColorState(window.config.color)
    this.levelDepth = 500
    this.particleSize = window.config.particle.particleSize.value
    this.needsParticleReset = false
    this.lights = []
    this.objects = []
    this.hueValues = []
    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(0x000000, 0.0013)
    this.sprites = window.config.particle.sprites.value
    this.startTimer = null
    this.deltaTime = 0
    this.elapsedTime = 0
    this.audioPeak = false
    this.peakCountdown = 0
    // Seeded from the live config (not null) so the first updateOrbit() poll after
    // construction doesn't see a spurious "changed" diff and kick off a needless orbit fade.
    this.lastOrbitParams = {
      a: window.config.orbit.a.value,
      b: window.config.orbit.b.value,
      c: window.config.orbit.c.value,
      d: window.config.orbit.d.value,
      e: window.config.orbit.e.value,
      scaleFactor: window.config.user.scaleFactor.value
    }
    this.orbit = { subsets: [], xMin: 0, xMax: 0, yMin: 0, yMax: 0, scaleX: 0, scaleY: 0 }
    this.updateInterval = undefined
    this.frozen = false
    this.orbitFades = []
    this.orbitIncomingElapsedMs = getParticleCrossfadeDurationMs()

    for (let i = 0; i < this.layers; i++) {
      const subsetPoints: SubsetPoint[] = []
      for (let j = 0; j < this.particlesPerLayer; j++) {
        subsetPoints[j] = { x: 0, y: 0, vertex: new THREE.Vector3(0, 0, 0) }
      }
      this.orbit.subsets.push(subsetPoints)
      this.hueValues[i] = Math.random()
    }
  }

  init(): void {
    let count = 1
    let particleIndex = 0
    this.setLights()

    this.generateOrbit()

    for (let level = 0; level < this.levels; level++) {
      for (let s = 0; s < this.layers; s++) {
        const points: THREE.Vector3[] = []
        for (let i = 0; i < this.particlesPerLayer; i++) {
          const { subsets } = this.orbit
          points.push(subsets[s]![i]!.vertex)
        }
        const geometry = new THREE.BufferGeometry().setFromPoints(points)

        particleIndex = count % this.sprites.length
        const spriteUrl = this.sprites[particleIndex]!
        const sprite = acquireSpriteTexture(getResolvedSpriteUrl(spriteUrl))
        const material = new THREE.PointsMaterial({
          size: this.particleSize,
          map: sprite,
          blending: THREE.AdditiveBlending,
          depthTest: false,
          transparent: true
        })

        const particles = new THREE.Points(geometry, material) as ParticleSystem
        particles.myMaterial = material
        particles.myLevel = level
        particles.mySubset = s
        particles.mySpriteUrl = spriteUrl
        particles.position.x = 0
        particles.position.y = 0
        particles.position.z = -this.levelDepth * level - (s * this.levelDepth / this.layers) + window.config.user.scaleFactor.value / 2
        particles.needsUpdate = 0
        this.colorize(particles, s)
        this.objects.push(particles)
        this.scene.add(particles)
        count++
      }
    }

    this.updateInterval = setInterval(() => { this.updateOrbit() }, 250)
  }

  update(deltaTime: number, audioData: AudioAnalysedDataForVisualization): void {
    this.advanceOrbitFade(deltaTime)
    this.syncColor()

    if (audioData.beat.active) {
      this.audioPeak = true
    }
    // Switcheroo reshapes once per beat (the frame the peak crosses the threshold), not on every frame the peak stays
    // up: that rebuilt the whole orbit and re-uploaded every buffer for several frames a beat, which doubled the frame
    // time on a slower CPU, and the shape just holds until the next beat anyway.
    const reshapeOnBeat = audioData.beat.fresh && window.config.effects.switcheroo.value && !this.frozen

    this.deltaTime = deltaTime
    this.elapsedTime += deltaTime

    const musicSpeedMultiplier = getMusicSpeedMultiplier(audioData)

    let count = 0
    let switcherooGenerated = false

    this.objects.forEach((obj, index) => {
      const wasAudioPeak = this.audioPeak

      if (wasAudioPeak) {
        this.peakCountdown--
        if (this.peakCountdown <= 0) {
          this.audioPeak = false
          this.peakCountdown = 100
        }
      }

      // Switcheroo reshapes obj's own buffer to the current orbit -- only ever the primary
      // (incoming) object. Applying it to an in-flight orbit fade's outgoing object would
      // reshape it into the *new* orbit mid-fade, defeating the crossfade entirely.
      if (reshapeOnBeat && count % 2 === 0) {
        if (!switcherooGenerated) {
          this.generateOrbit()
          switcherooGenerated = true
        }
        const currentSubset = this.orbit.subsets[obj.mySubset]!
        const posArray = obj.geometry.attributes.position!.array as Float32Array
        for (let i = 0; i < this.particlesPerLayer; i++) {
          posArray[i * 3] = currentSubset[i]!.vertex.x
          posArray[i * 3 + 1] = currentSubset[i]!.vertex.y
        }
        obj.geometry.attributes.position!.needsUpdate = true
      }

      this.applyParticleMotion(obj, count, musicSpeedMultiplier, wasAudioPeak)

      // Every still-fading orbit generation's outgoing objects should keep drifting/rotating/
      // color-shifting just like they would have without the fade -- only their shape and
      // opacity differ from the incoming set, so they get the same per-frame motion, paired
      // by index.
      this.orbitFades.forEach((fade) => {
        const outgoingObj = fade.outgoing[index]
        if (outgoingObj) {
          this.applyParticleMotion(outgoingObj, count, musicSpeedMultiplier, wasAudioPeak)
        }
      })

      count++
    })
  }

  // hueValues holds each subset's raw 0..1 position; the Color config decides what color that is. The rainbow maps it
  // into the hue window; a palette reads the color at that spot (turned by its phase) and desaturates it toward gray.
  private colorize = (obj: ParticleSystem, subset: number): void => {
    const { lut, hueStart, hueSpan, phase, saturation } = this.colorState
    const raw = this.hueValues[subset]!
    if (!lut) {
      obj.myMaterial.color.setHSL(windowHue(raw, hueStart, hueSpan), saturation, DEF_BRIGHTNESS)
      return
    }
    const [red, green, blue] = sampleLut(lut, raw + phase)
    const luma = 0.299 * red + 0.587 * green + 0.114 * blue
    obj.myMaterial.color.setRGB(luma + (red - luma) * saturation, luma + (green - luma) * saturation, luma + (blue - luma) * saturation)
  }

  // The Color config sits outside the particle diff that rebuilds the system, so a change recolors the existing
  // particles in place.
  private syncColor = (): void => {
    const next = resolveColorState(window.config.color)
    if (next === this.colorState) return
    this.colorState = next
    const recolor = (obj: ParticleSystem): void => this.colorize(obj, obj.mySubset)
    this.objects.forEach(recolor)
    this.orbitFades.forEach((fade) => fade.outgoing.forEach(recolor))
  }

  private applyParticleMotion = (obj: ParticleSystem, count: number, musicSpeedMultiplier: number, applyPeakEffects: boolean): void => {
    obj.position.z += window.config.user.speed.value * musicSpeedMultiplier

    if (applyPeakEffects) {
      if (window.config.effects.wobWob.value) {
        obj.position.z -= window.config.user.speed.value * musicSpeedMultiplier * 2
      }

      if (window.config.effects.colorShift.value) {
        this.colorize(obj, obj.mySubset)
      }
    }

    if (obj.position.z > window.config.user.scaleFactor.value / 2) {
      obj.position.setZ(-(this.levels - 1) * this.levelDepth + this.levelDepth)
    }

    // Seconds-based like Julia (deltaTime is in ms), so the spin rate doesn't depend on the frame rate.
    const rotationStep = window.config.user.rotationSpeed.value * userConfig.rotationSpeed_RAD_PER_SEC_PER_UNIT
      * musicSpeedMultiplier * (this.deltaTime / 1000)
    if (window.config.effects.cyclone.value) {
      if (count % 3 === 0) {
        obj.rotation.z -= rotationStep
      } else if (count % 3 === 1) {
        obj.rotation.z += rotationStep
      }
    } else {
      // rotation.z grows counter-clockwise, so subtract: a positive Rotation (slider to the right) is clockwise.
      obj.rotation.z -= rotationStep
    }
  }

  getScene(): THREE.Scene {
    return this.scene
  }

  updateOrbit(): void {
    if (this.frozen) return

    const newA = window.config.orbit.a.value
    const newB = window.config.orbit.b.value
    const newC = window.config.orbit.c.value
    const newD = window.config.orbit.d.value
    const newE = window.config.orbit.e.value
    const newScaleFactor = window.config.user.scaleFactor.value

    const paramsChanged = newA !== this.lastOrbitParams.a
      || newB !== this.lastOrbitParams.b
      || newC !== this.lastOrbitParams.c
      || newD !== this.lastOrbitParams.d
      || newE !== this.lastOrbitParams.e
      || newScaleFactor !== this.lastOrbitParams.scaleFactor

    if (!paramsChanged) return

    // Existing particles' Z positions (and the wrap threshold in applyParticleMotion) were
    // computed relative to the old scaleFactor -- shift them by half the delta so depth/wrap
    // behavior stays consistent under the new one, same compensation the old in-place
    // updateOrbit() applied before this became a crossfade.
    const depthShift = (newScaleFactor - this.lastOrbitParams.scaleFactor) / 2

    this.lastOrbitParams = { a: newA, b: newB, c: newC, d: newD, e: newE, scaleFactor: newScaleFactor }

    this.generateOrbit()

    for (let s = 0; s < this.layers; s++) {
      this.hueValues[s] = Math.random()
    }

    this.startOrbitFade(depthShift)
  }

  /**
   * Orbit param changes used to overwrite the existing particle objects' position buffers
   * directly, snapping to the new shape in one frame -- same jarring "instant jump" the particle
   * crossfade (OrbitLayer.startCrossfade()) was built to avoid for Particle Config changes.
   * This applies the identical double-buffer opacity technique, just scoped to this visualizer's
   * own objects instead of swapping the whole visualizer: build a parallel set of objects at the
   * new orbit shape (this.orbit.subsets was just regenerated above), fade the old set out and the
   * new set in, then dispose the old set. New objects inherit the outgoing object's *current*
   * position/rotation (not the spawn formula) so there's no additional depth/rotation jump on
   * top of the shape change. Up to MAX_CROSSFADE_GENERATIONS generations can be alive at once,
   * each fading out independently, matching OrbitLayer's particle crossfade.
   */
  private startOrbitFade = (depthShift: number): void => {
    // Adding a new generation would exceed the cap -- force-finish the oldest still-fading
    // one(s) immediately to make room, rather than growing the list unbounded.
    while (this.orbitFades.length >= MAX_CROSSFADE_GENERATIONS - 1) {
      this.finalizeOutgoingOrbitFade(this.orbitFades.shift()!)
    }

    // It may still be mid-fade-in itself -- snap to full opacity before demoting it to an
    // outgoing generation, so its own fade-out starts from fully visible instead of jumping
    // from wherever its fade-in had gotten to.
    this.setObjectsOpacity(this.objects, 1)

    const outgoing = this.objects
    const incoming: ParticleSystem[] = outgoing.map((obj) => {
      const currentSubset = this.orbit.subsets[obj.mySubset]!
      const geometry = new THREE.BufferGeometry().setFromPoints(currentSubset.map((point) => point.vertex))
      const sprite = acquireSpriteTexture(getResolvedSpriteUrl(obj.mySpriteUrl))
      const material = new THREE.PointsMaterial({
        size: this.particleSize,
        map: sprite,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        transparent: true,
        opacity: 0
      })

      const particles = new THREE.Points(geometry, material) as ParticleSystem
      particles.myMaterial = material
      particles.myLevel = obj.myLevel
      particles.mySubset = obj.mySubset
      particles.mySpriteUrl = obj.mySpriteUrl
      particles.position.copy(obj.position)
      particles.position.z += depthShift
      particles.rotation.z = obj.rotation.z
      particles.needsUpdate = 0
      this.colorize(particles, obj.mySubset)
      this.scene.add(particles)
      return particles
    })

    this.objects = incoming
    this.orbitIncomingElapsedMs = 0
    this.orbitFades.push({ outgoing, elapsedMs: 0, durationMs: getParticleCrossfadeDurationMs() })
  }

  private advanceOrbitFade = (deltaTime: number): void => {
    const incomingDurationMs = getParticleCrossfadeDurationMs()
    if (this.orbitIncomingElapsedMs < incomingDurationMs) {
      this.orbitIncomingElapsedMs = Math.min(incomingDurationMs, this.orbitIncomingElapsedMs + deltaTime)
      this.setObjectsOpacity(this.objects, this.orbitIncomingElapsedMs / incomingDurationMs)
    }

    this.orbitFades = this.orbitFades.filter((fade) => {
      fade.elapsedMs += deltaTime
      const t = Math.min(1, fade.elapsedMs / fade.durationMs)
      this.setObjectsOpacity(fade.outgoing, 1 - t)
      if (t < 1) return true
      this.finalizeOutgoingOrbitFade(fade)
      return false
    })
  }

  private finalizeOutgoingOrbitFade = (fade: OrbitFade): void => {
    fade.outgoing.forEach((obj) => {
      this.scene.remove(obj)
      obj.geometry.dispose()
      this.disposeMaterial(obj.myMaterial)
    })
  }

  private setObjectsOpacity = (objects: ParticleSystem[], opacity: number): void => {
    objects.forEach((obj) => {
      obj.myMaterial.opacity = opacity
    })
  }

  generateOrbit(): void {
    let x = 0; let y = 0; let z = 0; let x1 = 0
    this.prepareOrbit()

    const la = a; const lb = b; const lc = c; const ld = d; const le = e
    const scale_factor_l = window.config.user.scaleFactor.value

    let xMin = 0; let xMax = 0; let yMin = 0; let yMax = 0

    for (let s = 0; s < this.layers; s++) {
      x = s * 0.005 * (1 - Math.random())
      y = s * 0.005 * (1 - Math.random())

      const currentSubset = this.orbit.subsets[s]!

      for (let i = 0; i < this.particlesPerLayer; i++) {
        z = (ld + Math.sqrt(Math.sqrt(Math.abs(lb * x - lc))))
        if (x > 0) x1 = y - z
        else if (x === 0) x1 = y
        else x1 = y + z
        y = la - x
        x = x1 + le

        currentSubset[i]!.x = x
        currentSubset[i]!.y = y

        if (x < xMin) { xMin = x }
        else if (x > xMax) { xMax = x }
        if (y < yMin) { yMin = y }
        else if (y > yMax) { yMax = y }
      }
    }

    const scaleX = 2 * scale_factor_l / (xMax - xMin)
    const scaleY = 2 * scale_factor_l / (yMax - yMin)

    this.orbit.xMin = xMin
    this.orbit.yMin = yMin
    this.orbit.xMax = xMax
    this.orbit.yMax = yMax
    this.orbit.scaleX = scaleX
    this.orbit.scaleY = scaleY

    for (let s = 0; s < this.layers; s++) {
      const currentSubset = this.orbit.subsets[s]!
      for (let i = 0; i < this.particlesPerLayer; i++) {
        currentSubset[i]!.vertex.setX(scaleX * (currentSubset[i]!.x - xMin) - scale_factor_l)
        currentSubset[i]!.vertex.setY(scaleY * (currentSubset[i]!.y - yMin) - scale_factor_l)
      }
    }
  }

  prepareOrbit(): void {
    this.updateOrbitParams()
    this.orbit.xMin = 0
    this.orbit.xMax = 0
    this.orbit.yMin = 0
    this.orbit.yMax = 0
  }

  updateOrbitParams(): void {
    a = window.config.orbit.a.value
    b = window.config.orbit.b.value
    c = window.config.orbit.c.value
    d = window.config.orbit.d.value
    e = window.config.orbit.e.value
  }

  setLights(): void {
    this.lights[0] = new THREE.PointLight(0xffffff, 0.2, 0)
    this.lights[1] = new THREE.PointLight(0xffffff, 0.2, 0)
    this.lights[2] = new THREE.PointLight(0xffffff, 0.2, 0)

    this.lights[0]!.position.set(0, 200, 0)
    this.lights[1]!.position.set(100, 200, 100)
    this.lights[2]!.position.set(-100, -200, -100)

    this.scene.add(this.lights[0]!)
    this.scene.add(this.lights[1]!)
    this.scene.add(this.lights[2]!)
  }

  destroyVisualization(): void {
    if (this.updateInterval !== undefined) clearInterval(this.updateInterval)
    this.disposeScene(this.scene)
  }

  /** Stops this visualizer from reacting to further config changes -- called on the outgoing
   * side of a crossfade, which should only fade out, not reshape itself around whatever preset
   * is now live in window.config. Also resolves any in-progress orbit-shape fade immediately:
   * once OrbitLayer starts driving this visualizer's overall opacity as a single outgoing
   * generation, an unrelated inner fade still animating individual objects' opacity would fight
   * it for control of the same materials. */
  freezeConfig = (): void => {
    this.frozen = true
    if (this.updateInterval !== undefined) {
      clearInterval(this.updateInterval)
      this.updateInterval = undefined
    }
    if (this.orbitFades.length > 0) {
      this.setObjectsOpacity(this.objects, 1)
      this.orbitFades.forEach((fade) => this.finalizeOutgoingOrbitFade(fade))
      this.orbitFades = []
    }
  }

  disposeScene(scene: THREE.Scene): void {
    scene.traverse((object) => {
      if (
        object instanceof THREE.Mesh
        || object instanceof THREE.Points
        || object instanceof THREE.Line
        || object instanceof THREE.LineSegments
      ) {
        object.geometry?.dispose()
        const mat = object.material
        if (Array.isArray(mat)) {
          mat.forEach((m) => this.disposeMaterial(m))
        } else if (mat) {
          this.disposeMaterial(mat)
        }
      }
    })
  }

  private disposeMaterial(material: THREE.Material): void {
    for (const v of Object.values(material)) {
      if (v instanceof THREE.Texture) {
        releaseSpriteTexture(v)
      }
    }
    material.dispose()
  }
}
