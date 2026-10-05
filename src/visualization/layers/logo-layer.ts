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

const hasSize = (image: unknown): image is { width: number; height: number } =>
  typeof image === 'object' && image !== null && 'width' in image && 'height' in image
  && typeof image.width === 'number' && typeof image.height === 'number' && image.width > 0 && image.height > 0

/**
 * Logo as a layer: a textured plane parented to its own camera, so it ignores `cameraBound` panning (the camera is never
 * steered) and `scaleFactor`. Reacts to the shared beat: scale pulse, shake, glow (the Effects glow switch), and a spin (speed 0 is still).
 */
export class LogoLayer implements Layer {
  private readonly scene = new THREE.Scene()
  private readonly cameraManager = new CameraManager()
  // A unit plane (not a Sprite, which always faces the camera) so the logo can turn on its vertical axis. Both faces
  // draw, so the back shows the image mirrored. Swappable for thicker geometry (stacked slices, extrusion) later.
  private readonly geometry = new THREE.PlaneGeometry(1, 1)
  private readonly material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide })
  private readonly mesh = new THREE.Mesh(this.geometry, this.material)
  private spriteUrl = ''
  private texture: THREE.Texture | null = null

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.cameraManager.init()
    const camera = this.cameraManager.getCamera()
    camera.add(this.mesh)
    this.mesh.position.z = -LOGO_DISTANCE
    this.scene.add(camera)
    this.mesh.visible = false
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
    this.material.dispose()
    this.geometry.dispose()
  }

  /** Follows `logo.sprite`; an empty value just hides the sprite. */
  private syncSprite = (): void => {
    const [url = ''] = window.config.logo.sprite.value
    if (url === this.spriteUrl) return
    this.releaseTexture()
    this.spriteUrl = url
    if (!url) return
    this.texture = acquireSpriteTexture(getResolvedSpriteUrl(url))
    this.material.map = this.texture
    this.material.needsUpdate = true
  }

  private releaseTexture = (): void => {
    if (this.texture) releaseSpriteTexture(this.texture)
    this.texture = null
    this.material.map = null
    this.mesh.visible = false
  }

  private animate = (deltaTime: number, { beat }: AudioAnalysedDataForVisualization): void => {
    const { logo } = window.config
    const image: unknown = this.texture?.image
    if (!hasSize(image)) return // still loading
    const camera = this.cameraManager.getCamera()
    const viewHeight = 2 * LOGO_DISTANCE * Math.tan((camera.fov / 2) * (Math.PI / 180))
    const size = viewHeight * LOGO_HEIGHT_FRACTION * (1 + beat.value * logo.beatScale.value)
    this.mesh.scale.set(size * (image.width / image.height), size, 1)
    this.mesh.visible = true

    const shake = beat.value * logo.shake.value * viewHeight * SHAKE_VIEWPORT_FRACTION
    this.mesh.position.x = shake ? (Math.random() - 0.5) * 2 * shake : 0
    this.mesh.position.y = shake ? (Math.random() - 0.5) * 2 * shake : 0

    // Turns around the vertical axis through the logo's center, like a planet on its axis (speed 0 is still).
    this.mesh.rotation.y = (this.mesh.rotation.y + logo.spinSpeed.value * (deltaTime / 1000)) % (2 * Math.PI)
    // The Effects glow switch drives the logo too, with the same formula as the global bloom.
    const glow = window.config.effects.glow.value ? Math.min(1, beat.value * beat.energy) : 0
    this.material.color.setScalar(1 + glow)
  }
}
