import * as THREE from 'three'

import type { AudioSnapshot } from '../../audioanalysis/audio-snapshot'
import { getResolvedSpriteUrl } from '../../utils/spriteCache'
import { acquireSpriteTexture, releaseSpriteTexture } from '../../utils/textureCache'
import { logoConfig } from '../../config/logo.config'
import { getParticleCrossfadeDurationMs } from '../../config/visualizer.config'
import { userConfig } from '../../config/user.config'
import { logoHeading, wrapAngle } from '../../config/heading'
import { HeadingFollower } from '../../config/headingFollower'
import { CameraManager } from '../camera-manager'
import { getMusicSpeedMultiplier } from '../music-speed'
import { createBicubicUniforms, enableBicubicMap } from './bicubic-map'
import { fillFromEdges } from './edge-fill'
import { Layer } from './layer'
import { traceWalls, type WallMesh } from './logo-walls'

// Local distance in front of the camera. The logo fills `logoConfig.baseHeightFraction` of the viewport height at Size 1.
const LOGO_DISTANCE = 10
const SHAKE_VIEWPORT_FRACTION = 0.05

// Thickness: the image's front and back faces sit `DEPTH_FRACTION` of the logo's height apart, blended so the image keeps its soft
// edges, and joined by walls traced from the image's alpha at `SIDE_ALPHA_CUTOFF` (logo-walls.ts), each wall in the color of the
// edge it stands on. Just inside each face is a cap: the shape cut out at the same cutoff and drawn solid with depth, from a copy of
// the image with every solid pixel recolored to the nearest edge (edge-fill.ts). Caps and walls close the solid, so where a face is
// faded out (below) or see-through, a turned logo shows a solid in its edge colors instead of its hollow inside and the far face.
const DEPTH_FRACTION = 0.1
const SIDE_ALPHA_CUTOFF = 0.5
// How far each cap sits inside its face, as a fraction of the thickness, so a face never fights its own cap for depth.
const CAP_INSET = 1 / 63
// The walls are traced from, and the caps cut from, a copy of the image at most this many pixels across: the trace and the edge fill
// each run once over every pixel when the logo loads.
const SIDE_TEXTURE_MAX_PX = 512

// Seen nearly edge-on, a face is a sliver so thin that each pixel spans most of the texture, and the GPU falls back to
// the smallest mipmap: the average of the whole image, which is dim and part transparent. That drew a faint line
// across the full image height, transparent margins included. So the faces fade out as the logo turns edge-on: fully
// visible while |cos(spin)| is above `FACE_FADE_START`, gone below `FACE_FADE_END`. The caps and walls carry the shape.
const FACE_FADE_START = 0.3
const FACE_FADE_END = 0.05

// How the lean at the edge of the swing grows with Sway: (Sway / max Sway) to this power. 1 is linear (Sway 100 leans a
// fifth as far as 500); lower lifts the small Sways, so at 0.5 Sway 100 leans about 45% as far and Sway 20 about 20%.
const SWAY_LEAN_EXPONENT = 0.5

// Endless zoom: flying into a point of the image. The image is drawn as a chain of copies, each `ZOOM_RATIO` times
// smaller than the one before and placed so the focus point of every copy lands on the focus point of the one it sits
// in (a Droste). Zooming scales the whole chain up around the focus. A copy fades out around the logo's own size (what
// Size sets, the same as with Zoom off): it is fully opaque until `ZOOM_FADE_START` levels (the logo's own size) and
// is gone at `ZOOM_FADE_END` levels. By the time it is a whole level (`ZOOM_RATIO` times) bigger,
// the next copy inside it has grown to the logo's own size and the chain starts over, which is invisible because it
// looks the same one level in. The copies inside are only faded in while they are still too small to see, so nothing
// pops. Copy `j` sits `phase - j` levels from full size.
// Where the zoom dives in, as 0..1 across the image (y down); the pad sets it.
type FocusPoint = { x: number, y: number }
// How fast the zoom runs: doublings of the image's size per second at User Speed 1, whatever the ratio.
const ZOOM_DOUBLINGS_PER_SPEED = 0.2
const ZOOM_RATIO = 16
const ZOOM_FADE_START = 0 // levels from the logo's own size where a copy starts to fade out (a level is a growth of ZOOM_RATIO)
const ZOOM_FADE_END = 0.5 // levels where it is gone; a copy is fully opaque at the logo's own size
const ZOOM_COPIES = 4 // the levels from full size down to a speck, with the fade-in just past it
const ZOOM_FADE_IN_START = -3 // levels below the logo's own size where the next copy starts to fade in; down here it is a speck
const ZOOM_FADE_IN_END = -2
const ZOOM_FIRST_COPY = 0 // the biggest copy is the one at full size, since the one above it would already be gone

const clamp = (value: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, value))

const moveToward = (value: number, target: number, step: number): number =>
  value < target ? Math.min(target, value + step) : Math.max(target, value - step)

const wrap01 = (value: number): number => value - Math.floor(value)

// What a canvas can draw the loaded logo image from.
const isDrawable = (image: unknown): image is HTMLImageElement | HTMLCanvasElement | ImageBitmap =>
  (typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement)
  || (typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement)
  || (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap)

type ReadBack = { context: CanvasRenderingContext2D; pixels: ImageData }

/**
 * The image drawn on a canvas at most `SIDE_TEXTURE_MAX_PX` across, and its pixels. Null when the image cannot be read back (a
 * cross-origin image taints the canvas).
 */
const readBack = (image: HTMLImageElement | HTMLCanvasElement | ImageBitmap, width: number, height: number): ReadBack | null => {
  const scale = Math.min(1, SIDE_TEXTURE_MAX_PX / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  try {
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return { context, pixels: context.getImageData(0, 0, canvas.width, canvas.height) }
  } catch {
    return null
  }
}

/** The traced walls as one geometry: positions, vertex colors and triangles in the logo group's unit space. */
const toGeometry = ({ positions, colors, indices }: WallMesh): THREE.BufferGeometry => {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  return geometry
}

/** A plane of the logo at depth `z` (unit space) drawn with `material`, which is returned. */
const addPlane = (parent: THREE.Group, geometry: THREE.PlaneGeometry, material: THREE.MeshBasicMaterial, z: number): THREE.MeshBasicMaterial => {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.z = z
  parent.add(mesh)
  return material
}

const assignMap = (materials: THREE.MeshBasicMaterial[], map: THREE.Texture | null): void => {
  materials.forEach((material) => {
    material.map = map
    material.needsUpdate = true
  })
}

const hasSize = (image: unknown): image is { width: number; height: number } =>
  typeof image === 'object' && image !== null && 'width' in image && 'height' in image
  && typeof image.width === 'number' && typeof image.height === 'number' && image.width > 0 && image.height > 0

/**
 * Logo as a layer: two textured faces joined by traced walls, parented to its own camera, so it ignores `sway` panning (the
 * camera is never steered) and `scaleFactor`. Reacts to the shared beat: scale pulse, shake, glow (the Effects glow
 * switch), and a spin (speed 0 is still) that turns the whole logo around its vertical axis.
 */
export class LogoLayer implements Layer {
  private readonly scene = new THREE.Scene()
  private readonly cameraManager = new CameraManager()
  // Planes, not a Sprite (which always faces the camera), so the logo can turn on its vertical axis. Both faces draw,
  // so the back shows the image mirrored. The group's scale sets the logo size and, on z, the thickness; the faces
  // sit at unit z -0.5 and 0.5, and the walls run between them.
  private readonly geometry = new THREE.PlaneGeometry(1, 1)
  // The lean toward the camera position turns this pivot, and the spin turns `logo` inside it, so the two compose
  // (the spin stays about the logo's own axis, whichever way it leans).
  private readonly pivot = new THREE.Group()
  private readonly logo = new THREE.Group()
  private readonly faceNormal = new THREE.Vector3()
  // Back then front: transparent without depth writes, so their soft edges blend over what is behind.
  private readonly faces: THREE.MeshBasicMaterial[] = [-0.5, 0.5].map((z) =>
    addPlane(this.logo, this.geometry, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }), z))
  // Opaque cutouts that write depth, just inside the faces, so nothing behind a face shows through the shape.
  private readonly caps: THREE.MeshBasicMaterial[] = [-0.5 + CAP_INSET, 0.5 - CAP_INSET].map((z) =>
    addPlane(this.logo, this.geometry, new THREE.MeshBasicMaterial({ alphaTest: SIDE_ALPHA_CUTOFF, side: THREE.DoubleSide }), z))
  // Unlit and opaque, in the vertex colors the trace gives each wall. Only the outside draws: every wall faces out of the solid.
  private readonly wallMaterial = new THREE.MeshBasicMaterial({ vertexColors: true })
  private readonly walls = new THREE.Mesh(new THREE.BufferGeometry(), this.wallMaterial)
  private hasWalls = false
  // The chain of copies for the endless zoom, biggest first so each draws over the one it sits in.
  private readonly zoomCopies: THREE.Mesh[] = []
  private readonly zoomMaterials: THREE.MeshBasicMaterial[] = Array.from({ length: ZOOM_COPIES }, (_, i): THREE.MeshBasicMaterial => {
    const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide })
    const mesh = new THREE.Mesh(this.geometry, material)
    mesh.renderOrder = i
    mesh.visible = false
    this.logo.add(mesh)
    this.zoomCopies.push(mesh)
    return material
  })
  private zoomPhase = 0
  // 0 is the plain logo, 1 is the zoom chain; it follows the Zoom switch over the Crossfade Duration so toggling it fades.
  private zoomMix = 0
  // The first frame with an image takes the Zoom switch as it is, so a logo that loads zoomed does not start plain and fade.
  private zoomMixPlaced = false
  /** How far the logo has turned (radians clockwise): the spin in the screen plane when flat, around the vertical axis in 3D. */
  private bearing = 0
  private readonly headingFollower = new HeadingFollower(logoHeading)
  // Every material the glow brightens.
  private readonly glowing: THREE.MeshBasicMaterial[] = [...this.faces, ...this.caps, this.wallMaterial, ...this.zoomMaterials]
  private spriteUrl = ''
  private texture: THREE.Texture | null = null
  // The caps' own copy of the image without mipmaps. Seen nearly edge-on, a mipmapped lookup averages the whole image
  // down to a partly transparent blur, which falls under `SIDE_ALPHA_CUTOFF` and cuts the middle of the sliver out.
  // Without mipmaps each pixel samples real texels, so the caps keep their coverage (a little aliasing, briefly).
  private capTexture: THREE.Texture | null = null
  // Ultra samples the faces and the zoom copies bicubically where the image is drawn larger than its own size.
  private readonly bicubic = createBicubicUniforms()

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    // The bicubic lookup needs fragment derivatives, which only WebGL2 has without an extension.
    if (renderer.capabilities.isWebGL2) [...this.faces, ...this.zoomMaterials].forEach((material) => enableBicubicMap(material, this.bicubic))
    this.cameraManager.init()
    const camera = this.cameraManager.getCamera()
    this.walls.visible = false
    this.logo.add(this.walls)
    this.pivot.add(this.logo)
    camera.add(this.pivot)
    this.pivot.position.z = -LOGO_DISTANCE
    this.scene.add(camera)
    this.logo.visible = false
  }

  render = (target: THREE.WebGLRenderTarget, deltaTime: number, audio: AudioSnapshot): void => {
    this.syncSprite()
    if (this.texture) this.animate(deltaTime, audio)
    const camera = this.cameraManager.getCamera()
    this.renderer.setRenderTarget(target)
    // Transparent, not black: the compositor covers what is behind the logo by its alpha (the `over` blend).
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.clear()
    this.renderer.render(this.scene, camera)
    this.renderer.setClearColor(0x000000, 1)
    this.renderer.setRenderTarget(null)
  }

  /** How much the faces and zoom copies are sampled bicubically where they are drawn larger than the image itself: 0 is the GPU's bilinear filter, 1 is fully bicubic, in between mixes the two. */
  setSmoothMagnification = (amount: number): void => {
    this.bicubic.uBicubic.value = amount
  }

  resize = (): void => {
    this.cameraManager.onResize()
  }

  dispose = (): void => {
    this.releaseTexture()
    this.glowing.forEach((material) => material.dispose())
    this.walls.geometry.dispose()
    this.geometry.dispose()
  }

  /** Follows `logo.sprite`; an empty value just hides the logo. */
  private syncSprite = (): void => {
    const [url = ''] = window.config.logo.sprite.value
    if (url === this.spriteUrl) return
    this.releaseTexture()
    this.spriteUrl = url
    if (!url) return
    this.texture = acquireSpriteTexture(getResolvedSpriteUrl(url))
    this.setMap(this.texture)
  }

  private releaseTexture = (): void => {
    if (this.texture) releaseSpriteTexture(this.texture)
    this.texture = null
    this.capTexture?.dispose()
    this.capTexture = null
    assignMap(this.caps, null)
    this.setWalls(null)
    this.setMap(null)
    this.logo.visible = false
  }

  private setMap = (map: THREE.Texture | null): void => {
    assignMap(this.faces, map)
    assignMap(this.zoomMaterials, map)
  }

  /** Swaps in the walls of a newly traced image, or none. */
  private setWalls = (walls: WallMesh | null): void => {
    this.walls.geometry.dispose()
    this.walls.geometry = walls ? toGeometry(walls) : new THREE.BufferGeometry()
    this.hasWalls = walls !== null && walls.indices.length > 0
  }

  /** Lays out the chain of copies at the current zoom phase; the unit plane spans [-0.5, 0.5], so the focus is an offset from the middle. */
  private updateZoom = (focus: FocusPoint, opacity: number): void => {
    const px = focus.x - 0.5
    const py = 0.5 - focus.y // image y runs down, the plane's runs up
    this.zoomCopies.forEach((mesh, i) => {
      const level = this.zoomPhase - (i + ZOOM_FIRST_COPY)
      const scale = Math.pow(ZOOM_RATIO, level)
      mesh.scale.set(scale, scale, 1)
      mesh.position.set(px * (1 - scale), py * (1 - scale), 0)
      const fadeOut = 1 - THREE.MathUtils.smoothstep(level, ZOOM_FADE_START, ZOOM_FADE_END)
      const fadeIn = THREE.MathUtils.smoothstep(level, ZOOM_FADE_IN_START, ZOOM_FADE_IN_END)
      const material = this.zoomMaterials[i]
      if (material) material.opacity = fadeOut * fadeIn * opacity
    })
  }

  /**
   * Once per loaded image: traces the walls from its pixels and gives the caps their copy of it, without mipmaps and with its inside
   * recolored to the nearest edge; the original (shared, mipmapped) stays on the faces. When the image cannot be read back (a
   * cross-origin image) there are no walls, and the caps get a plain copy.
   */
  private createSides = (source: THREE.Texture): void => {
    const image: unknown = source.image
    const read = isDrawable(image) && hasSize(image) ? readBack(image, image.width, image.height) : null
    if (read) {
      const { context, pixels: { data, width, height } } = read
      this.setWalls(traceWalls(data, width, height, SIDE_ALPHA_CUTOFF * 255))
      data.set(fillFromEdges(data, width, height, SIDE_ALPHA_CUTOFF * 255))
      context.putImageData(read.pixels, 0, 0)
    }
    const texture = read ? new THREE.CanvasTexture(read.context.canvas) : source.clone()
    if (read) {
      texture.encoding = source.encoding
      texture.flipY = source.flipY
    }
    texture.generateMipmaps = false
    texture.minFilter = THREE.LinearFilter
    texture.needsUpdate = true
    this.capTexture = texture
    assignMap(this.caps, texture)
  }

  private animate = (deltaTime: number, audio: AudioSnapshot): void => {
    const { beat } = audio
    const { logo } = window.config
    const image: unknown = this.texture?.image
    if (!this.texture || !hasSize(image)) return // still loading
    this.bicubic.uMapSize.value.set(image.width, image.height)
    if (!this.capTexture) this.createSides(this.texture)
    const camera = this.cameraManager.getCamera()
    const viewHeight = 2 * LOGO_DISTANCE * Math.tan((camera.fov / 2) * (Math.PI / 180))
    // The beat only swells the logo while the Effects Wob Wob switch is on, like the particles' recoil.
    const swell = window.config.effects.wobWob.value ? beat.value * logoConfig.beatScale : 0
    const size = viewHeight * logoConfig.baseHeightFraction * logo.size.value * (1 + swell)
    this.logo.scale.set(size * (image.width / image.height), size, size * DEPTH_FRACTION)
    this.logo.visible = true

    // The pad's spot on the screen, 0..1 across the view with y down. The pivot sits at LOGO_DISTANCE, so a fraction of
    // the view there is a fraction of the screen.
    const viewWidth = viewHeight * camera.aspect
    this.pivot.position.x = (logo.positionX.value - 0.5) * viewWidth
    this.pivot.position.y = (0.5 - logo.positionY.value) * viewHeight

    const shake = beat.value * logo.shake.value * viewHeight * SHAKE_VIEWPORT_FRACTION
    this.logo.position.x = shake ? (Math.random() - 0.5) * 2 * shake : 0
    this.logo.position.y = shake ? (Math.random() - 0.5) * 2 * shake : 0

    // Speed 0 is still, negative turns the other way, and the music speeds it up by the same multiplier Orbit uses.
    const spin = logo.spinSpeed.value * getMusicSpeedMultiplier(audio) * (deltaTime / 1000)
    const is3D = logo.threeD.value
    // Flat: only the near face draws and the image rolls in the screen plane (positive is clockwise, like Rotation).
    // 3D: turns around the vertical axis through the logo's center, like a planet on its axis.
    // Zoom swaps the thick logo for the chain of flat copies (they spin and lean with the rest), crossfading over the
    // Crossfade Duration. The chain starts at the logo's own size, so it takes over from the plain logo without a jump.
    const crossfadeMs = getParticleCrossfadeDurationMs()
    const zoomTarget = logo.zoom.value ? 1 : 0
    if (!this.zoomMixPlaced) {
      this.zoomMix = zoomTarget
      this.zoomMixPlaced = true
    }
    this.zoomMix = crossfadeMs > 0 ? moveToward(this.zoomMix, zoomTarget, deltaTime / crossfadeMs) : zoomTarget
    const isZooming = this.zoomMix > 0
    if (!isZooming) this.zoomPhase = 0
    // The caps and walls cannot fade (they are opaque, not blended), so they give way as soon as the chain starts.
    const showSides = is3D && !isZooming
    this.caps.forEach((material) => { material.visible = showSides })
    this.walls.visible = showSides && this.hasWalls
    this.faces.forEach((material, i) => { material.visible = this.zoomMix < 1 && (is3D || i === this.faces.length - 1) })
    this.zoomCopies.forEach((mesh) => { mesh.visible = isZooming })
    // A drag on the Spin dial turns the logo by the difference at once; the speed carries on from there.
    this.bearing = wrapAngle(this.bearing + this.headingFollower.takeTurn(this.bearing) + spin)
    logoHeading.report(this.bearing)
    this.logo.rotation.y = is3D ? this.bearing : 0
    this.logo.rotation.z = is3D ? 0 : -this.bearing
    // Turns toward where the camera has got to: its direction sets the way the logo leans (pad units, y down) and how
    // far it is through its swing sets how far. The angle at the edge of the swing also grows with Sway, but on a
    // curve (see SWAY_LEAN_EXPONENT), so a small Sway still leans clearly and none leans not at all.
    const range = window.config.user.sway.value
    const steer = window.getCameraSteer?.() ?? { x: 0, y: 0 }
    const swayFactor = Math.pow(clamp(range / userConfig.sway_MAX, 0, 1), SWAY_LEAN_EXPONENT)
    // Leans toward the pad, like the fractal steers, unless Reverse Lean is on, which turns it the other way
    // (the same way the Orbit camera then goes).
    const leanDirection = window.config.user.reverseLean.value ? -1 : 1
    const lean = logo.lean.value && range > 0 ? leanDirection * logoConfig.lean_MAX_RADIANS * swayFactor / range : 0
    this.pivot.rotation.set(
      clamp(steer.y, -range, range) * lean,
      clamp(steer.x, -range, range) * lean,
      0,
    )
    // Fades by how edge-on the faces are to the viewer, whether the turn came from the spin or the lean.
    this.faceNormal.set(0, 0, 1).applyQuaternion(this.logo.quaternion).applyQuaternion(this.pivot.quaternion)
    const faceOpacity = is3D
      ? THREE.MathUtils.smoothstep(Math.abs(this.faceNormal.z), FACE_FADE_END, FACE_FADE_START)
      : 1
    this.faces.forEach((material) => { material.opacity = faceOpacity * (1 - this.zoomMix) })
    if (isZooming) {
      // The user Speed sets the zoom rate, and the music speeds it up like it does Orbit.
      const levelsPerSecond = window.config.user.speed.value * ZOOM_DOUBLINGS_PER_SPEED / Math.log2(ZOOM_RATIO) * getMusicSpeedMultiplier(audio)
      this.zoomPhase = wrap01(this.zoomPhase + levelsPerSecond * (deltaTime / 1000))
      this.updateZoom({ x: logo.focusX.value, y: logo.focusY.value }, faceOpacity * this.zoomMix)
    }
    // The Effects glow switch drives the logo too, with the same formula as the global bloom.
    const glow = window.config.effects.glow.value ? Math.min(1, beat.value * beat.energy) : 0
    this.glowing.forEach((material) => material.color.setScalar(1 + glow))
  }
}
