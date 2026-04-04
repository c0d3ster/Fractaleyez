import * as THREE from 'three'

import { AudioAnalysedDataForVisualization } from '../audioanalysis/audio-analysed-data'
import { userConfig } from '../config/user.config'

/*
 * ORIGINAL AUTHOR: Iacopo Sassarini
 * Modifications made by Cody Douglass and Conor O'Neill
 */
const DEF_BRIGHTNESS = .5

// Orbit parameters
let a = 0, b = 0, c = 0, d = 0, e = 0

type SubsetPoint = {
  x: number
  y: number
  vertex: THREE.Vector3
}

type ParticleSystem = THREE.Points & {
  myMaterial: THREE.PointsMaterial
  myLevel: number
  mySubset: number
  needsUpdate: number
}

export class HopalongVisualizer {
  particlesPerLayer: number
  layers: number
  levels: number
  saturation: number
  levelDepth: number
  particleSize: number
  needsParticleReset: boolean
  lights: THREE.PointLight[]
  video: HTMLVideoElement | null
  videoPlane: THREE.Mesh | null
  objects: ParticleSystem[]
  hueValues: number[]
  scene: THREE.Scene
  sprites: string[]
  startTimer: Date | null
  deltaTime: number
  elapsedTime: number
  audioPeak: boolean
  peakCountdown: number
  lastOrbitParams: { a: number | null; b: number | null; c: number | null; d: number | null; e: number | null; scaleFactor: number | null }
  orbit: { subsets: SubsetPoint[][]; xMin: number; xMax: number; yMin: number; yMax: number; scaleX: number; scaleY: number }
  private updateInterval: ReturnType<typeof setInterval> | undefined

  private onVideoClipsRestored = (e: Event): void => {
    const ce = e as CustomEvent<{ clips: string[] }>
    this.createVideoPlane(ce.detail.clips)
  }

  private onVideoEnded = (): void => {
    if (this.video) this.nextVideo(this.video)
  }

  constructor() {
    this.particlesPerLayer = window.config.particle.particlesPerLayer.value
    this.layers = window.config.particle.layers.value
    this.levels = window.config.particle.levels.value
    this.saturation = window.config.particle.saturation ? window.config.particle.saturation.value : 1
    this.levelDepth = 500
    this.particleSize = window.config.particle.particleSize.value
    this.needsParticleReset = false
    this.lights = []
    this.video = null
    this.videoPlane = null
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
    this.lastOrbitParams = { a: null, b: null, c: null, d: null, e: null, scaleFactor: null }
    this.orbit = { subsets: [], xMin: 0, xMax: 0, yMin: 0, yMax: 0, scaleX: 0, scaleY: 0 }
    this.updateInterval = undefined

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
    let sprite = new THREE.TextureLoader().load(this.sprites[0]!)
    let count = 1
    let particleIndex = 0
    this.setLights()

    this.generateOrbit()

    if (window.config.video && window.config.video.clips.length) {
      this.createVideoPlane(window.config.video.clips)
    }

    window.addEventListener('videoClipsRestored', this.onVideoClipsRestored)

    for (let level = 0; level < this.levels; level++) {
      for (let s = 0; s < this.layers; s++) {
        const points: THREE.Vector3[] = []
        for (let i = 0; i < this.particlesPerLayer; i++) {
          const { subsets } = this.orbit
          points.push(subsets[s]![i]!.vertex)
        }
        const geometry = new THREE.BufferGeometry().setFromPoints(points)

        particleIndex = count % this.sprites.length
        sprite = new THREE.TextureLoader().load(this.sprites[particleIndex]!)
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
        particles.position.x = 0
        particles.position.y = 0
        particles.position.z = -this.levelDepth * level - (s * this.levelDepth / this.layers) + window.config.user.scaleFactor.value / 2
        particles.needsUpdate = 0
        particles.myMaterial.color.setHSL(this.hueValues[s]!, this.saturation, DEF_BRIGHTNESS)
        this.objects.push(particles)
        this.scene.add(particles)
        count++
      }
    }

    this.updateInterval = setInterval(() => { this.updateOrbit() }, 300)
  }

  createVideoPlane(clips: string[]): void {
    this.disposeVideoPlane()
    if (!clips.length) return

    this.video = document.createElement('video')
    this.video.src = clips[0]!
    this.video.autoplay = true
    window.config.video.index = 0

    this.video.addEventListener('ended', this.onVideoEnded)

    const videoTexture = new THREE.VideoTexture(this.video)
    // Overscan: camera can pan up to cameraBound in x/y; enlarge the plane so edges stay
    // covered at max bound (same world-units hack as innerWidth/innerHeight sizing).
    const maxPan = userConfig.cameraBound_MAX
    const panMargin = 1 + (2 * maxPan) / Math.min(window.innerWidth, window.innerHeight)
    const planeW = window.innerWidth * panMargin
    const planeH = window.innerHeight * panMargin
    const planeGeometry = new THREE.PlaneGeometry(planeW, planeH)
    const planeMaterial = new THREE.MeshBasicMaterial({ map: videoTexture })
    this.videoPlane = new THREE.Mesh(planeGeometry, planeMaterial)
    this.videoPlane.position.z = 5
    this.scene.add(this.videoPlane)
  }

  nextVideo(videoElement: HTMLVideoElement): void {
    const clips = window.config.video.clips
    if (!clips.length) {
      videoElement.pause()
      videoElement.src = ''
      this.disposeVideoPlane()
      return
    }
    window.config.video.index++
    if (window.config.video.index >= clips.length) {
      window.config.video.index = 0
    }
    videoElement.src = clips[window.config.video.index]!
    videoElement.play()
  }

  update(deltaTime: number, audioData: AudioAnalysedDataForVisualization): void {
    if ((audioData.peak?.value ?? 0) > 0.8) {
      this.audioPeak = true
    }

    this.deltaTime = deltaTime
    this.elapsedTime += deltaTime

    const musicSpeed = (audioData.energyAverage ?? 0) + (audioData.energy ?? 0)
    const musicSpeedMultiplier = 1 + musicSpeed / 10

    let count = 0
    let switcherooGenerated = false

    this.objects.forEach((obj) => {
      obj.position.z += window.config.user.speed.value * musicSpeedMultiplier

      if (this.audioPeak) {
        this.peakCountdown--
        if (this.peakCountdown <= 0) {
          this.audioPeak = false
          this.peakCountdown = 100
        }

        if (count % 2 === 0 && window.config.effects.switcheroo.value) {
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

        if (window.config.effects.wobWob.value) {
          obj.position.z -= window.config.user.speed.value * musicSpeedMultiplier * 2
        }

        if (window.config.effects.colorShift.value) {
          obj.myMaterial.color.setHSL(this.hueValues[obj.mySubset]!, this.saturation, DEF_BRIGHTNESS)
        }
      }

      if (obj.position.z > window.config.user.scaleFactor.value / 2) {
        obj.position.setZ(-(this.levels - 1) * this.levelDepth + this.levelDepth)
      }

      if (window.config.effects.cyclone.value) {
        if (count % 3 === 0) {
          obj.rotation.z += (window.config.user.rotationSpeed.value / 1000) * musicSpeedMultiplier
        } else if (count % 3 === 1) {
          obj.rotation.z -= (window.config.user.rotationSpeed.value / 1000) * musicSpeedMultiplier
        }
      } else {
        obj.rotation.z += (window.config.user.rotationSpeed.value / 1000) * musicSpeedMultiplier
      }
      count++
    })
  }

  getScene(): THREE.Scene {
    return this.scene
  }

  updateOrbit(): void {
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

    const prevScaleFactor = this.lastOrbitParams.scaleFactor

    this.lastOrbitParams = { a: newA, b: newB, c: newC, d: newD, e: newE, scaleFactor: newScaleFactor }

    this.generateOrbit()

    for (let s = 0; s < this.layers; s++) {
      this.hueValues[s] = Math.random()
    }

    this.objects.forEach((obj) => {
      const currentSubset = this.orbit.subsets[obj.mySubset]!
      const posArray = obj.geometry.attributes.position!.array as Float32Array
      for (let i = 0; i < this.particlesPerLayer; i++) {
        posArray[i * 3] = currentSubset[i]!.vertex.x
        posArray[i * 3 + 1] = currentSubset[i]!.vertex.y
      }
      obj.geometry.attributes.position!.needsUpdate = true
    })

    if (prevScaleFactor !== null && newScaleFactor !== prevScaleFactor) {
      const dz = (newScaleFactor - prevScaleFactor) / 2
      this.objects.forEach((obj) => {
        obj.position.z += dz
      })
    }
  }

  generateOrbit(): void {
    let x = 0, y = 0, z = 0, x1 = 0
    this.prepareOrbit()

    const la = a, lb = b, lc = c, ld = d, le = e
    const scale_factor_l = window.config.user.scaleFactor.value

    let xMin = 0, xMax = 0, yMin = 0, yMax = 0

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
    window.removeEventListener('videoClipsRestored', this.onVideoClipsRestored)
    if (this.updateInterval !== undefined) clearInterval(this.updateInterval)
    this.disposeVideoPlane()
    this.disposeScene(this.scene)
  }

  disposeVideoPlane(): void {
    if (this.videoPlane) {
      this.scene.remove(this.videoPlane)
      this.videoPlane.geometry.dispose()
      const mat = this.videoPlane.material as THREE.MeshBasicMaterial
      mat.map?.dispose()
      mat.dispose()
      this.videoPlane = null
    }
    if (this.video) {
      this.video.removeEventListener('ended', this.onVideoEnded)
      this.video.pause()
      this.video.removeAttribute('src')
      this.video.load()
      this.video = null
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
        v.dispose()
      }
    }
    material.dispose()
  }
}
