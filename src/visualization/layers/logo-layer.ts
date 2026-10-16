import * as THREE from 'three'

import { AudioAnalysedDataForVisualization } from '../../audioanalysis/audio-analysed-data'
import { getResolvedSpriteUrl } from '../../utils/spriteCache'
import { acquireSpriteTexture, releaseSpriteTexture } from '../../utils/textureCache'
import { logoConfig } from '../../config/logo.config'
import { userConfig } from '../../config/user.config'
import { CameraManager } from '../camera-manager'
import { getMusicSpeedMultiplier } from '../music-speed'
import { Layer } from './layer'

// Local distance in front of the camera. The logo fills `logoConfig.baseHeightFraction` of the viewport height at Size 1.
const LOGO_DISTANCE = 10
const SHAKE_VIEWPORT_FRACTION = 0.05

// Fake thickness: the image is drawn as this many parallel slices spread over `DEPTH_FRACTION` of the logo's height.
// The two outer slices are the front and back faces, blended so the image keeps its soft edges. The slices between
// are cut out at `SIDE_ALPHA_CUTOFF` and drawn solid with depth, so where the stack turns away the sides show the
// image's own edge colors instead of see-through layers. More slices hide the gaps between them when seen nearly
// edge-on.
const SLICE_COUNT = 64
const DEPTH_FRACTION = 0.1
const SIDE_ALPHA_CUTOFF = 0.5

// Seen nearly edge-on, a face is a sliver so thin that each pixel spans most of the texture, and the GPU falls back to
// the smallest mipmap: the average of the whole image, which is dim and part transparent. That drew a faint line
// across the full image height, transparent margins included. So the faces fade out as the logo turns edge-on: fully
// visible while |cos(spin)| is above `FACE_FADE_START`, gone below `FACE_FADE_END`. The cutout sides carry the shape.
const FACE_FADE_START = 0.3
const FACE_FADE_END = 0.05

// How the lean at the edge of the swing grows with Sway: (Sway / max Sway) to this power. 1 is linear (Sway 100 leans a
// fifth as far as 500); lower lifts the small Sways, so at 0.5 Sway 100 leans about 45% as far and Sway 20 about 20%.
const SWAY_LEAN_EXPONENT = 0.5

// Endless zoom: flying into a point of the image. The image is drawn as a chain of copies, each `ZOOM_RATIO` times
// smaller than the one before and placed so the focus point of every copy lands on the focus point of the one it sits
// in (a Droste). The ratio is big, so the nested copies are small and the current one is the logo itself, almost always
// at about its own size or magnified past it. Zooming scales the whole chain up around the
// focus; when a copy has grown to the size of the one before it, the chain starts over, which is invisible because it
// looks the same one level in. A copy is only faded out once it is a whole level past that handover (`ZOOM_RATIO`
// times full size and more, as if behind the camera), and the next one is only faded in while it is still too small
// to see, so nothing pops. Copy `j` sits `phase - j` levels from full size.
// Where the zoom dives in, as 0..1 across the image (y down); the pad sets it.
type FocusPoint = { x: number, y: number }
// How fast the zoom runs: doublings of the image's size per second at User Speed 1, whatever the ratio.
const ZOOM_DOUBLINGS_PER_SPEED = 0.2
const ZOOM_RATIO = 4
const ZOOM_COPIES = 7 // enough to cover the levels from one above full size down to where a copy is a speck, with the fade-in just past it
const ZOOM_FADE_OUT_START = 1 // levels above full size where a copy starts to fade out
const ZOOM_FADE_OUT_END = 2
const ZOOM_FADE_IN_START = -5 // levels below full size where the next copy starts to fade in; down here it is a speck
const ZOOM_FADE_IN_END = -4
const ZOOM_FIRST_COPY = -1 // the first copy starts one level above full size, so the chain is complete at every phase

const clamp = (value: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, value))

const wrap01 = (value: number): number => value - Math.floor(value)

const isFace = (slice: number): boolean => slice === 0 || slice === SLICE_COUNT - 1

const hasSize = (image: unknown): image is { width: number; height: number } =>
  typeof image === 'object' && image !== null && 'width' in image && 'height' in image
  && typeof image.width === 'number' && typeof image.height === 'number' && image.width > 0 && image.height > 0

/**
 * Logo as a layer: a stack of textured planes parented to its own camera, so it ignores `cameraBound` panning (the
 * camera is never steered) and `scaleFactor`. Reacts to the shared beat: scale pulse, shake, glow (the Effects glow
 * switch), and a spin (speed 0 is still) that turns the whole stack around its vertical axis.
 */
export class LogoLayer implements Layer {
  private readonly scene = new THREE.Scene()
  private readonly cameraManager = new CameraManager()
  // Planes, not a Sprite (which always faces the camera), so the logo can turn on its vertical axis. Both faces draw,
  // so the back shows the image mirrored. The group's scale sets the logo size and, on z, the thickness; the slices
  // sit at unit z offsets in [-0.5, 0.5]. Swappable for a real extrusion later.
  private readonly geometry = new THREE.PlaneGeometry(1, 1)
  // The tilt toward the camera position turns this pivot, and the spin turns `logo` inside it, so the two compose
  // (the spin stays about the logo's own axis, whichever way it leans).
  private readonly pivot = new THREE.Group()
  private readonly logo = new THREE.Group()
  private readonly faceNormal = new THREE.Vector3()
  private readonly slices: THREE.MeshBasicMaterial[] = Array.from({ length: SLICE_COUNT }, (_, i): THREE.MeshBasicMaterial => {
    // Faces: transparent without depth writes, so their soft edges blend over what is behind. Slices between: opaque
    // cutouts that write depth, so the nearest one wins and nothing beneath shows through the side.
    const material = isFace(i)
      ? new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide })
      : new THREE.MeshBasicMaterial({ alphaTest: SIDE_ALPHA_CUTOFF, side: THREE.DoubleSide })
    const mesh = new THREE.Mesh(this.geometry, material)
    mesh.position.z = i / (SLICE_COUNT - 1) - 0.5
    this.logo.add(mesh)
    return material
  })
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
  private readonly faces: THREE.MeshBasicMaterial[] = this.slices.filter((_, i) => isFace(i))
  private readonly sides: THREE.MeshBasicMaterial[] = this.slices.filter((_, i) => !isFace(i))
  private spriteUrl = ''
  private texture: THREE.Texture | null = null
  // The sides' own copy of the image without mipmaps. Seen nearly edge-on, a mipmapped lookup averages the whole image
  // down to a partly transparent blur, which falls under `SIDE_ALPHA_CUTOFF` and cuts the middle of the sliver out.
  // Without mipmaps each pixel samples real texels, so the sides keep their coverage (a little aliasing, briefly).
  private sideTexture: THREE.Texture | null = null

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.cameraManager.init()
    const camera = this.cameraManager.getCamera()
    this.pivot.add(this.logo)
    camera.add(this.pivot)
    this.pivot.position.z = -LOGO_DISTANCE
    this.scene.add(camera)
    this.logo.visible = false
  }

  render = (target: THREE.WebGLRenderTarget, deltaTime: number, audio: AudioAnalysedDataForVisualization): void => {
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

  resize = (): void => {
    this.cameraManager.onResize()
  }

  dispose = (): void => {
    this.releaseTexture()
    this.slices.forEach((material) => material.dispose())
    this.zoomMaterials.forEach((material) => material.dispose())
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
    this.sideTexture?.dispose()
    this.sideTexture = null
    this.setMap(null)
    this.logo.visible = false
  }

  private setMap = (map: THREE.Texture | null): void => {
    const materials = [...this.slices, ...this.zoomMaterials]
    materials.forEach((material) => {
      material.map = map
      material.needsUpdate = true
    })
  }

  /** Lays out the chain of copies at the current zoom phase; the unit plane spans [-0.5, 0.5], so the focus is an offset from the middle. */
  private updateZoom = (focus: FocusPoint, faceOpacity: number): void => {
    const px = focus.x - 0.5
    const py = 0.5 - focus.y // image y runs down, the plane's runs up
    this.zoomCopies.forEach((mesh, i) => {
      const level = this.zoomPhase - (i + ZOOM_FIRST_COPY)
      const scale = Math.pow(ZOOM_RATIO, level)
      mesh.scale.set(scale, scale, 1)
      mesh.position.set(px * (1 - scale), py * (1 - scale), 0)
      const fadeOut = 1 - THREE.MathUtils.smoothstep(level, ZOOM_FADE_OUT_START, ZOOM_FADE_OUT_END)
      const fadeIn = THREE.MathUtils.smoothstep(level, ZOOM_FADE_IN_START, ZOOM_FADE_IN_END)
      const material = this.zoomMaterials[i]
      if (material) material.opacity = fadeOut * fadeIn * faceOpacity
    })
  }

  /** Copies the loaded image for the sides without mipmaps; the original (shared, mipmapped) stays on the faces. */
  private createSideTexture = (source: THREE.Texture): void => {
    const texture = source.clone()
    texture.generateMipmaps = false
    texture.minFilter = THREE.LinearFilter
    texture.needsUpdate = true
    this.sideTexture = texture
    this.sides.forEach((material) => {
      material.map = texture
      material.needsUpdate = true
    })
  }

  private animate = (deltaTime: number, audio: AudioAnalysedDataForVisualization): void => {
    const { beat } = audio
    const { logo } = window.config
    const image: unknown = this.texture?.image
    if (!this.texture || !hasSize(image)) return // still loading
    if (!this.sideTexture) this.createSideTexture(this.texture)
    const camera = this.cameraManager.getCamera()
    const viewHeight = 2 * LOGO_DISTANCE * Math.tan((camera.fov / 2) * (Math.PI / 180))
    const size = viewHeight * logoConfig.baseHeightFraction * logo.size.value * (1 + beat.value * logoConfig.beatScale)
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
    // Zoom swaps the thick stack for the chain of flat copies (they spin and lean with the rest).
    const isZooming = logo.zoom.value
    this.sides.forEach((material) => { material.visible = is3D && !isZooming })
    this.faces.forEach((material, i) => { material.visible = !isZooming && (is3D || i === this.faces.length - 1) })
    this.zoomCopies.forEach((mesh) => { mesh.visible = isZooming })
    this.logo.rotation.y = is3D ? (this.logo.rotation.y + spin) % (2 * Math.PI) : 0
    this.logo.rotation.z = is3D ? 0 : (this.logo.rotation.z - spin) % (2 * Math.PI)
    // Turns toward where the camera has got to: its direction sets the way the logo leans (pad units, y down) and how
    // far it is through its swing sets how far. The angle at the edge of the swing also grows with Sway, but on a
    // curve (see SWAY_LEAN_EXPONENT), so a small Sway still leans clearly and none leans not at all.
    const range = window.config.user.cameraBound.value
    const steer = window.getCameraSteer?.() ?? { x: 0, y: 0 }
    const swayFactor = Math.pow(clamp(range / userConfig.cameraBound_MAX, 0, 1), SWAY_LEAN_EXPONENT)
    const lean = logo.tilt.value && range > 0 ? logoConfig.tilt_MAX_RADIANS * swayFactor / range : 0
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
    this.faces.forEach((material) => { material.opacity = faceOpacity })
    if (isZooming) {
      // The user Speed sets the zoom rate, and the music speeds it up like it does Orbit.
      const zoomStep = window.config.user.speed.value * ZOOM_DOUBLINGS_PER_SPEED / Math.log2(ZOOM_RATIO) * getMusicSpeedMultiplier(audio) * (deltaTime / 1000)
      this.zoomPhase = wrap01(this.zoomPhase + zoomStep)
      this.updateZoom({ x: logo.focusX.value, y: logo.focusY.value }, faceOpacity)
    }
    // The Effects glow switch drives the logo too, with the same formula as the global bloom.
    const glow = window.config.effects.glow.value ? Math.min(1, beat.value * beat.energy) : 0
    this.slices.forEach((material) => material.color.setScalar(1 + glow))
    this.zoomMaterials.forEach((material) => material.color.setScalar(1 + glow))
  }
}
