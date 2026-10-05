import * as THREE from 'three'

import { getParticleCrossfadeDurationMs } from '../../config/visualizer.config'
import { isNearEnd, stepOpacity } from './fade'
import { Layer } from './layer'

const VIDEO_RESUME_DELAY_MS = 250
const VIDEO_RESUME_MAX_ATTEMPTS = 5
// HTMLMediaElement.HAVE_CURRENT_DATA: the incoming clip has a frame to show, so a crossfade never fades to black.
const HAVE_CURRENT_DATA = 2

const isClipsDetail = (detail: unknown): detail is { clips: string[] } =>
  typeof detail === 'object' && detail !== null && 'clips' in detail && Array.isArray(detail.clips)

/** One playing clip: its <video> element, the texture sampling it, and its own resume-after-pause bookkeeping. */
type VideoSlot = {
  video: HTMLVideoElement
  src: string
  texture: THREE.Texture
  frameHandle: number | null
  resumeAttempts: number
  resumeTimer: ReturnType<typeof setTimeout> | undefined
  onEnded: () => void
  onPaused: () => void
  onPlaying: () => void
}

/**
 * Video as a layer: a fullscreen quad textured from the current clip. The clip list comes from `window.config.video`;
 * ConfigProvider dispatches `videoClipsRestored` with the effective clips (empty when the layer is disabled). New clips
 * create the <video> element. An empty list does not tear it down at once: the compositor is still fading the layer out,
 * so the video keeps playing until the layer reports it is fully hidden (`onHidden`), then it is freed and a disabled
 * layer decodes nothing.
 *
 * When a clip is within the crossfade duration of its end, the next clip starts underneath it and fades in over the same
 * shared crossfade duration, then takes over. Duration 0 keeps the plain cut.
 */
export class VideoLayer implements Layer {
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly geometry = new THREE.PlaneGeometry(2, 2)
  private readonly currentMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff })
  // Drawn over the current clip with its own opacity, so the result is current * (1 - t) + incoming * t.
  private readonly incomingMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
  })
  private readonly incomingQuad = new THREE.Mesh(this.geometry, this.incomingMaterial)
  private current: VideoSlot | null = null
  private incoming: VideoSlot | null = null
  private incomingIndex = 0
  private fade = 0
  private teardownWhenHidden = false

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.scene.add(new THREE.Mesh(this.geometry, this.currentMaterial))
    this.incomingQuad.visible = false
    this.incomingQuad.renderOrder = 1
    this.scene.add(this.incomingQuad)
    window.addEventListener('videoClipsRestored', this.onClipsRestored)
    window.addEventListener('videoClipsChanged', this.onClipsChanged)
    const { clips } = window.config.video
    if (window.config.layers.meta.video.enabled.value && clips.length) this.createVideo(clips)
  }

  /** Only has something to draw while a clip is loaded (the layer gate is `video.enabled && clips.length`). */
  isActive = (): boolean => this.current !== null

  /** Every clip was unselected (or the layer disabled): the compositor fades the layer out, then `onHidden` frees it. */
  isFadingOut = (): boolean => this.teardownWhenHidden

  /** Fully faded out: free the video if the clips were cleared (the layer was disabled) while it was fading. */
  onHidden = (): void => {
    if (!this.teardownWhenHidden) return
    this.teardownWhenHidden = false
    this.disposeVideo()
  }

  render = (target: THREE.WebGLRenderTarget, deltaTime: number): void => {
    this.updateCrossfade(deltaTime)
    this.renderer.setRenderTarget(target)
    this.renderer.setClearColor(0x000000, 1)
    this.renderer.clear()
    this.renderer.render(this.scene, this.camera)
    this.renderer.setRenderTarget(null)
  }

  resize = (): void => {}

  dispose = (): void => {
    window.removeEventListener('videoClipsRestored', this.onClipsRestored)
    window.removeEventListener('videoClipsChanged', this.onClipsChanged)
    this.disposeVideo()
    this.currentMaterial.dispose()
    this.incomingMaterial.dispose()
    this.geometry.dispose()
  }

  private onClipsRestored = (event: Event): void => {
    if (!(event instanceof CustomEvent) || !isClipsDetail(event.detail)) return
    const { clips } = event.detail
    if (!clips.length) {
      if (this.current) this.teardownWhenHidden = true
      return
    }
    // Re-enabled while still fading out: the clip is still playing, so just keep it.
    if (this.teardownWhenHidden && this.current) {
      this.teardownWhenHidden = false
      return
    }
    this.createVideo(clips)
  }

  /**
   * The selection changed while clips are playing. A clip that was just unselected fades out right away instead of
   * playing to its end: the crossfade to a still-selected clip starts now.
   */
  private onClipsChanged = (event: Event): void => {
    if (!(event instanceof CustomEvent) || !isClipsDetail(event.detail)) return
    const { clips } = event.detail
    const { current, incoming } = this
    if (!current || this.teardownWhenHidden || !clips.length) return
    // A pending clip that was unselected is dropped; the fade restarts below if the current one is also gone.
    if (incoming && !clips.includes(incoming.src)) this.cancelIncoming()
    const currentIndex = clips.indexOf(current.src)
    if (currentIndex !== -1) {
      // Still selected: keep "next" pointing at the right neighbour in the new list.
      window.config.video.index = currentIndex
      return
    }
    if (this.incoming) return
    const nextIndex = Math.min(window.config.video.index, clips.length - 1)
    // startIncoming steps forward from the index, so back up one to land on nextIndex itself.
    window.config.video.index = (nextIndex - 1 + clips.length) % clips.length
    this.startIncoming()
  }

  private cancelIncoming = (): void => {
    if (this.incoming) this.disposeSlot(this.incoming)
    this.incoming = null
    this.fade = 0
    this.incomingMaterial.map = null
    this.incomingMaterial.needsUpdate = true
    this.incomingMaterial.opacity = 0
    this.incomingQuad.visible = false
  }

  private createVideo = (clips: string[]): void => {
    this.disposeVideo()
    const [first] = clips
    if (first === undefined) return
    window.config.video.index = 0
    this.current = this.createSlot(first)
    this.currentMaterial.map = this.current.texture
    this.currentMaterial.needsUpdate = true
  }

  private createSlot = (src: string): VideoSlot => {
    const video = document.createElement('video')
    video.src = src
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

    // A plain texture with our own frame callback instead of THREE.VideoTexture: that one starts a
    // requestVideoFrameCallback loop that dispose() never cancels. The callback only marks the texture dirty
    // when the video shows a new frame, so a 4K frame is uploaded at the video's frame rate, not the render rate.
    const texture = new THREE.Texture(video)
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.generateMipmaps = false
    texture.needsUpdate = true

    const slot: VideoSlot = {
      video,
      src,
      texture,
      frameHandle: null,
      resumeAttempts: 0,
      resumeTimer: undefined,
      onEnded: () => this.onEnded(slot),
      onPaused: () => this.onPaused(slot),
      onPlaying: () => {
        slot.resumeAttempts = 0
      },
    }
    const onFrame = (): void => {
      texture.needsUpdate = true
      slot.frameHandle = video.requestVideoFrameCallback(onFrame)
    }
    slot.frameHandle = video.requestVideoFrameCallback(onFrame)
    video.addEventListener('ended', slot.onEnded)
    video.addEventListener('pause', slot.onPaused)
    video.addEventListener('playing', slot.onPlaying)
    return slot
  }

  private disposeSlot = (slot: VideoSlot): void => {
    const { video } = slot
    if (slot.frameHandle !== null) video.cancelVideoFrameCallback(slot.frameHandle)
    slot.frameHandle = null
    video.removeEventListener('ended', slot.onEnded)
    video.removeEventListener('pause', slot.onPaused)
    video.removeEventListener('playing', slot.onPlaying)
    clearTimeout(slot.resumeTimer)
    slot.resumeTimer = undefined
    slot.resumeAttempts = 0
    video.pause()
    video.removeAttribute('src')
    video.load()
    video.remove()
    slot.texture.dispose()
  }

  private disposeVideo = (): void => {
    if (this.current) this.disposeSlot(this.current)
    if (this.incoming) this.disposeSlot(this.incoming)
    this.current = null
    this.incoming = null
    this.fade = 0
    this.currentMaterial.map = null
    this.currentMaterial.needsUpdate = true
    this.incomingMaterial.map = null
    this.incomingMaterial.needsUpdate = true
    this.incomingMaterial.opacity = 0
    this.incomingQuad.visible = false
  }

  /** Starts the next clip underneath once the current one is near its end, fades it in, then hands over to it. */
  private updateCrossfade = (deltaMs: number): void => {
    const { current, incoming } = this
    if (!current) return
    const crossfadeMs = getParticleCrossfadeDurationMs()
    if (!incoming) {
      const { video } = current
      if (crossfadeMs > 0 && !video.paused && isNearEnd(video.duration, video.currentTime, crossfadeMs)) this.startIncoming()
      return
    }
    // Hold at 0 until the incoming clip has a frame, so the fade never goes through black.
    if (incoming.video.readyState >= HAVE_CURRENT_DATA) this.fade = stepOpacity(this.fade, 1, deltaMs, crossfadeMs)
    this.incomingMaterial.opacity = this.fade
    if (this.fade >= 1) this.promoteIncoming()
  }

  private startIncoming = (): void => {
    const { clips } = window.config.video
    if (!clips.length) return
    const nextIndex = (window.config.video.index + 1) % clips.length
    const src = clips[nextIndex]
    if (src === undefined) return
    this.incoming = this.createSlot(src)
    this.incomingIndex = nextIndex
    this.fade = 0
    this.incomingMaterial.map = this.incoming.texture
    this.incomingMaterial.opacity = 0
    this.incomingMaterial.needsUpdate = true
    this.incomingQuad.visible = true
  }

  /** The incoming clip becomes the current one and the old one is freed. */
  private promoteIncoming = (): void => {
    const { current, incoming } = this
    if (!incoming) return
    if (current) this.disposeSlot(current)
    this.current = incoming
    this.incoming = null
    this.fade = 0
    window.config.video.index = this.incomingIndex
    this.currentMaterial.map = this.current.texture
    this.currentMaterial.needsUpdate = true
    this.incomingMaterial.map = null
    this.incomingMaterial.needsUpdate = true
    this.incomingMaterial.opacity = 0
    this.incomingQuad.visible = false
  }

  private onEnded = (slot: VideoSlot): void => {
    if (slot !== this.current) return
    const { clips } = window.config.video
    if (!clips.length) {
      this.disposeVideo()
      return
    }
    // The crossfade started but is not done (the incoming clip was slow to show a frame): finish it now.
    if (this.incoming) {
      this.fade = 1
      this.promoteIncoming()
      return
    }
    // No crossfade (duration 0, or the clip was too short to reach it): a plain cut to the next clip.
    window.config.video.index = (window.config.video.index + 1) % clips.length
    slot.src = clips[window.config.video.index]!
    slot.video.src = slot.src
    slot.video.play().catch(() => undefined)
  }

  // Resume if the browser pauses the clip on its own (it never stops for a reason we want). Only while the page
  // is visible, after a short delay, one request at a time, and a few tries in a row (reset once it plays again),
  // so a browser that keeps pausing it can't turn this into a tight retry loop.
  private onPaused = (slot: VideoSlot): void => {
    const { video } = slot
    if (video.ended || !window.config.video.clips.length || document.visibilityState !== 'visible') return
    if (slot.resumeTimer !== undefined || slot.resumeAttempts >= VIDEO_RESUME_MAX_ATTEMPTS) return
    slot.resumeAttempts++
    slot.resumeTimer = setTimeout(() => {
      slot.resumeTimer = undefined
      if ((this.current === slot || this.incoming === slot) && video.paused && !video.ended) video.play().catch(() => undefined)
    }, VIDEO_RESUME_DELAY_MS)
  }
}
