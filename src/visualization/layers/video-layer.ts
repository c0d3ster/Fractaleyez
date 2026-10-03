import * as THREE from 'three'

import { Layer } from './layer'

const VIDEO_RESUME_DELAY_MS = 250
const VIDEO_RESUME_MAX_ATTEMPTS = 5

const isClipsDetail = (detail: unknown): detail is { clips: string[] } =>
  typeof detail === 'object' && detail !== null && 'clips' in detail && Array.isArray(detail.clips)

/**
 * Video as a layer: a fullscreen quad textured from the current clip. The clip list comes from `window.config.video`;
 * ConfigProvider dispatches `videoClipsRestored` with the effective clips (empty when the layer is disabled), which
 * creates or tears down the <video> element, so a disabled layer decodes nothing.
 */
export class VideoLayer implements Layer {
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly material = new THREE.MeshBasicMaterial({ color: 0xffffff })
  private readonly quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
  private video: HTMLVideoElement | null = null
  private texture: THREE.Texture | null = null
  private frameHandle: number | null = null
  private resumeAttempts = 0
  private resumeTimer: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.scene.add(this.quad)
    window.addEventListener('videoClipsRestored', this.onClipsRestored)
    const { clips } = window.config.video
    if (window.config.layers.meta.video.enabled.value && clips.length) this.createVideo(clips)
  }

  /** Only has something to draw while a clip is loaded (the layer gate is `video.enabled && clips.length`). */
  isActive = (): boolean => this.video !== null

  render = (target: THREE.WebGLRenderTarget): void => {
    this.renderer.setRenderTarget(target)
    this.renderer.setClearColor(0x000000, 1)
    this.renderer.clear()
    this.renderer.render(this.scene, this.camera)
    this.renderer.setRenderTarget(null)
  }

  resize = (): void => {}

  dispose = (): void => {
    window.removeEventListener('videoClipsRestored', this.onClipsRestored)
    this.disposeVideo()
    this.material.dispose()
    this.quad.geometry.dispose()
  }

  private onClipsRestored = (event: Event): void => {
    if (!(event instanceof CustomEvent) || !isClipsDetail(event.detail)) return
    this.createVideo(event.detail.clips)
  }

  private createVideo = (clips: string[]): void => {
    this.disposeVideo()
    const [first] = clips
    if (first === undefined) return

    const video = document.createElement('video')
    video.src = first
    // Started with play() rather than the autoplay attribute: Chrome auto-pauses muted autoplay videos that
    // aren't sufficiently in view, and this one is only a 2px dot. Muted so playback is always allowed (and the clip's audio can't feed back into the mic).
    video.muted = true
    video.playsInline = true
    // Chrome only keeps decoding a video that is attached, fully opaque and not covered: a detached one
    // stalls after its first ~14 frames (so the texture froze after about a second), and one that is hidden,
    // translucent or under a canvas stalls the same way. So it lives on the page as a 2px dot in the corner,
    // above everything, and the texture below samples from it.
    Object.assign(video.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: '2px',
      height: '2px',
      zIndex: '2147483647',
      pointerEvents: 'none',
    })
    document.body.appendChild(video)
    video.play().catch(() => undefined)
    window.config.video.index = 0
    video.addEventListener('ended', this.onEnded)
    video.addEventListener('pause', this.onPaused)
    video.addEventListener('playing', this.onPlaying)

    // A plain texture with our own frame callback instead of THREE.VideoTexture: that one starts a
    // requestVideoFrameCallback loop that dispose() never cancels. The callback only marks the texture dirty
    // when the video shows a new frame, so a 4K frame is uploaded at the video's frame rate, not the render rate.
    const texture = new THREE.Texture(video)
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.generateMipmaps = false
    texture.needsUpdate = true
    const onFrame = (): void => {
      texture.needsUpdate = true
      this.frameHandle = video.requestVideoFrameCallback(onFrame)
    }
    this.frameHandle = video.requestVideoFrameCallback(onFrame)
    this.video = video
    this.texture = texture
    this.material.map = texture
    this.material.needsUpdate = true
  }

  private disposeVideo = (): void => {
    const { video } = this
    if (!video) return
    if (this.frameHandle !== null) video.cancelVideoFrameCallback(this.frameHandle)
    this.frameHandle = null
    video.removeEventListener('ended', this.onEnded)
    video.removeEventListener('pause', this.onPaused)
    video.removeEventListener('playing', this.onPlaying)
    clearTimeout(this.resumeTimer)
    this.resumeTimer = undefined
    this.resumeAttempts = 0
    video.pause()
    video.removeAttribute('src')
    video.load()
    video.remove()
    this.texture?.dispose()
    this.material.map = null
    this.material.needsUpdate = true
    this.texture = null
    this.video = null
  }

  private onEnded = (): void => {
    const { video } = this
    if (!video) return
    const { clips } = window.config.video
    if (!clips.length) {
      this.disposeVideo()
      return
    }
    window.config.video.index = (window.config.video.index + 1) % clips.length
    video.src = clips[window.config.video.index]!
    video.play().catch(() => undefined)
  }

  // Resume if the browser pauses the clip on its own (it never stops for a reason we want). Only while the page
  // is visible, after a short delay, one request at a time, and a few tries in a row (reset once it plays again),
  // so a browser that keeps pausing it can't turn this into a tight retry loop.
  private onPaused = (): void => {
    const { video } = this
    if (!video || video.ended || !window.config.video.clips.length || document.visibilityState !== 'visible') return
    if (this.resumeTimer !== undefined || this.resumeAttempts >= VIDEO_RESUME_MAX_ATTEMPTS) return
    this.resumeAttempts++
    this.resumeTimer = setTimeout(() => {
      this.resumeTimer = undefined
      if (this.video === video && video.paused && !video.ended) video.play().catch(() => undefined)
    }, VIDEO_RESUME_DELAY_MS)
  }

  private onPlaying = (): void => {
    this.resumeAttempts = 0
  }
}
