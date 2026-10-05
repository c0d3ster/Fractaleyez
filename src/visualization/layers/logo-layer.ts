import * as THREE from 'three'

import { AudioAnalysedDataForVisualization } from '../../audioanalysis/audio-analysed-data'
import { getResolvedSpriteUrl } from '../../utils/spriteCache'
import { acquireSpriteTexture, releaseSpriteTexture } from '../../utils/textureCache'
import { CameraManager } from '../camera-manager'
import { Layer } from './layer'

// Local distance in front of the camera, and the fraction of the viewport height the logo fills at beatScale 0.
const LOGO_DISTANCE = 10
const LOGO_HEIGHT_FRACTION = 0.3
const SHAKE_VIEWPORT_FRACTION = 0.05

// Fake thickness: the image is drawn as this many parallel slices spread over `DEPTH_FRACTION` of the logo's height.
// The two outer slices are the front and back faces, blended so the image keeps its soft edges. The slices between
// are cut out at `SIDE_ALPHA_CUTOFF` and drawn solid with depth, so where the stack turns away the sides show the
// image's own edge colors instead of see-through layers. More slices hide the gaps between them when seen nearly
// edge-on.
const SLICE_COUNT = 64
const DEPTH_FRACTION = 0.15
const SIDE_ALPHA_CUTOFF = 0.5

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
  private readonly logo = new THREE.Group()
  private readonly slices: THREE.MeshBasicMaterial[] = Array.from({ length: SLICE_COUNT }, (_, i): THREE.MeshBasicMaterial => {
    const face = i === 0 || i === SLICE_COUNT - 1
    // Faces: transparent without depth writes, so their soft edges blend over what is behind. Slices between: opaque
    // cutouts that write depth, so the nearest one wins and nothing beneath shows through the side.
    const material = face
      ? new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide })
      : new THREE.MeshBasicMaterial({ alphaTest: SIDE_ALPHA_CUTOFF, side: THREE.DoubleSide })
    const mesh = new THREE.Mesh(this.geometry, material)
    mesh.position.z = i / (SLICE_COUNT - 1) - 0.5
    this.logo.add(mesh)
    return material
  })
  private spriteUrl = ''
  private texture: THREE.Texture | null = null

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.cameraManager.init()
    const camera = this.cameraManager.getCamera()
    camera.add(this.logo)
    this.logo.position.z = -LOGO_DISTANCE
    this.scene.add(camera)
    this.logo.visible = false
  }

  render = (target: THREE.WebGLRenderTarget, deltaTime: number, audio: AudioAnalysedDataForVisualization): void => {
    this.syncSprite()
    if (this.texture) this.animate(deltaTime, audio)
    const camera = this.cameraManager.getCamera()
    this.renderer.setRenderTarget(target)
    this.renderer.setClearColor(0x000000, 1)
    this.renderer.clear()
    this.renderer.render(this.scene, camera)
    this.renderer.setRenderTarget(null)
  }

  resize = (): void => {
    this.cameraManager.onResize()
  }

  dispose = (): void => {
    this.releaseTexture()
    this.slices.forEach((material) => material.dispose())
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
    this.setMap(null)
    this.logo.visible = false
  }

  private setMap = (map: THREE.Texture | null): void => {
    this.slices.forEach((material) => {
      material.map = map
      material.needsUpdate = true
    })
  }

  private animate = (deltaTime: number, { beat }: AudioAnalysedDataForVisualization): void => {
    const { logo } = window.config
    const image: unknown = this.texture?.image
    if (!hasSize(image)) return // still loading
    const camera = this.cameraManager.getCamera()
    const viewHeight = 2 * LOGO_DISTANCE * Math.tan((camera.fov / 2) * (Math.PI / 180))
    const size = viewHeight * LOGO_HEIGHT_FRACTION * (1 + beat.value * logo.beatScale.value)
    this.logo.scale.set(size * (image.width / image.height), size, size * DEPTH_FRACTION)
    this.logo.visible = true

    const shake = beat.value * logo.shake.value * viewHeight * SHAKE_VIEWPORT_FRACTION
    this.logo.position.x = shake ? (Math.random() - 0.5) * 2 * shake : 0
    this.logo.position.y = shake ? (Math.random() - 0.5) * 2 * shake : 0

    // Turns around the vertical axis through the logo's center, like a planet on its axis (speed 0 is still).
    this.logo.rotation.y = (this.logo.rotation.y + logo.spinSpeed.value * (deltaTime / 1000)) % (2 * Math.PI)
    // The Effects glow switch drives the logo too, with the same formula as the global bloom.
    const glow = window.config.effects.glow.value ? Math.min(1, beat.value * beat.energy) : 0
    this.slices.forEach((material) => material.color.setScalar(1 + glow))
  }
}
