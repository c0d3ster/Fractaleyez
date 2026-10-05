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
 * Logo as a layer: a sprite parented to its own camera, so it ignores `cameraBound` panning (the camera is never
 * steered) and `scaleFactor`. Reacts to the shared beat: scale pulse, shake, glow (the Effects glow switch), and a spin (speed 0 is still).
 */
export class LogoLayer implements Layer {
  private readonly scene = new THREE.Scene()
  private readonly cameraManager = new CameraManager()
  private readonly material = new THREE.SpriteMaterial({ color: 0xffffff, transparent: true, depthTest: false })
  private readonly sprite = new THREE.Sprite(this.material)
  private spriteUrl = ''
  private texture: THREE.Texture | null = null

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.cameraManager.init()
    const camera = this.cameraManager.getCamera()
    camera.add(this.sprite)
    this.sprite.position.z = -LOGO_DISTANCE
    this.scene.add(camera)
    this.sprite.visible = false
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
    this.sprite.visible = false
  }

  private animate = (deltaTime: number, { beat }: AudioAnalysedDataForVisualization): void => {
    const { logo } = window.config
    const image: unknown = this.texture?.image
    if (!hasSize(image)) return // still loading
    const camera = this.cameraManager.getCamera()
    const viewHeight = 2 * LOGO_DISTANCE * Math.tan((camera.fov / 2) * (Math.PI / 180))
    const size = viewHeight * LOGO_HEIGHT_FRACTION * (1 + beat.value * logo.beatScale.value)
    this.sprite.scale.set(size * (image.width / image.height), size, 1)
    this.sprite.visible = true

    const shake = beat.value * logo.shake.value * viewHeight * SHAKE_VIEWPORT_FRACTION
    this.sprite.position.x = shake ? (Math.random() - 0.5) * 2 * shake : 0
    this.sprite.position.y = shake ? (Math.random() - 0.5) * 2 * shake : 0

    this.material.rotation += logo.spinSpeed.value * (deltaTime / 1000)
    // The Effects glow switch drives the logo too, with the same formula as the global bloom.
    const glow = window.config.effects.glow.value ? Math.min(1, beat.value * beat.energy) : 0
    this.material.color.setScalar(1 + glow)
  }
}
