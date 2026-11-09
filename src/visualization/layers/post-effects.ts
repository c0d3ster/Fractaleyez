import * as THREE from 'three'
import { BloomEffect, EffectComposer, EffectPass, Pass, RenderPass, ShockWaveEffect } from 'postprocessing'

import { AudioAnalysedDataForVisualization } from '../../audioanalysis/audio-analysed-data'
import { CAMERA_STEER_SCREEN_FRACTION_PER_PAD_UNIT } from '../../config/visualizer.config'
import { perfProbe } from '../perf'
import { KaleidoscopeEffect } from './kaleidoscope-effect'
import { autoMode, snareRoll } from '../../automode'
import { beatMonitor } from '../../audioanalysis/beat'
import { tempoTracker } from '../../audioanalysis/tempo-tracker'
import { sectionTracker } from '../../audioanalysis/sections'

// The shockwave effect projects its position through a fixed camera at this distance and field of view,
// onto a plane at this depth (the camera's focus point depth).
const SHOCKWAVE_CAMERA_FOV = 60
const SHOCKWAVE_CAMERA_Z = 7
const SHOCKWAVE_PLANE_Z = -5
// Added to the Speed slider and beat terms so the wave never crawls at a low Speed.
// Auto's kaleidoscope change shows on a beat, so it morphs quickly: a slow crossfade started on the beat would finish between beats.
const AUTO_FOLD_MORPH_MS = 250
const SHOCKWAVE_BASE_SPEED = 0.05

/** postprocessing sets `active` while a wave is running (true from `explode()` until it has crossed `maxRadius`) but leaves it out of its type definitions. */
type RunningShockWave = ShockWaveEffect & { readonly active: boolean }

/** Times a pass's render call (CPU and GPU) under a name in the perf probe; a no-op while the probe is off. */
const timePass = (pass: Pass, name: string): void => {
  const render = pass.render.bind(pass)
  pass.render = (...args: Parameters<Pass['render']>): void => {
    perfProbe.begin(name, true)
    render(...args)
    perfProbe.end(name)
  }
}

/** Bloom and shockwave, run once over the compositor's output (not per layer) and drawn to the screen. */
export class PostEffects {
  private readonly composer: EffectComposer
  private readonly bloomEffect = new BloomEffect()
  private readonly kaleidoscopeEffect = new KaleidoscopeEffect()
  private readonly shockwaveEffect: RunningShockWave
  // Two passes over the same kaleidoscope and shockwave, one with bloom and one without; Glow picks which runs. A bloom held at
  // zero opacity still blurs the whole frame, so with Glow off it is not in the pass at all. The one not in use never renders, so it never compiles.
  private readonly glowPass: EffectPass
  private readonly plainPass: EffectPass
  // The shockwave's own world position (not the camera's focus point, which the camera looks at and so
  // always projects to screen center). Moved to the camera pointer before each explosion.
  private readonly shockwavePosition = new THREE.Vector3(0, 0, SHOCKWAVE_PLANE_Z)
  private readonly clock = new THREE.Clock()

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    private readonly getCameraPosition: () => { x: number; y: number },
  ) {
    // The composite is one full-screen quad, so the composer's buffers need no depth.
    this.composer = new EffectComposer(renderer, { depthBuffer: false })
    const compositePass = new RenderPass(scene, camera)
    this.composer.addPass(compositePass)
    this.bloomEffect.kernelSize = 1

    const fakeCamera = new THREE.PerspectiveCamera(SHOCKWAVE_CAMERA_FOV, window.innerWidth / window.innerHeight)
    fakeCamera.position.z = SHOCKWAVE_CAMERA_Z

    const options = { waveSize: .15, speed: .5, amplitude: .2, maxRadius: 2 }
    // The library sets `active` at runtime, so the instance is the wider type (see RunningShockWave).
    this.shockwaveEffect = new ShockWaveEffect(fakeCamera, this.shockwavePosition, options) as RunningShockWave

    // Kaleidoscope goes first so the shockwave and bloom act on the folded image and repeat symmetrically.
    this.glowPass = new EffectPass(camera, this.kaleidoscopeEffect, this.shockwaveEffect, this.bloomEffect)
    this.plainPass = new EffectPass(camera, this.kaleidoscopeEffect, this.shockwaveEffect)
    this.glowPass.renderToScreen = true
    this.plainPass.renderToScreen = true
    this.plainPass.enabled = false
    this.composer.addPass(this.glowPass)
    this.composer.addPass(this.plainPass)
    timePass(compositePass, 'post.composite')
    timePass(this.glowPass, 'post.effects')
    timePass(this.plainPass, 'post.effects')
  }

  private syncGlow = (glow: boolean): void => {
    this.glowPass.enabled = glow
    this.plainPass.enabled = !glow
  }

  // Fires the shockwave on demand (the S key), regardless of the audio, for testing and tuning.
  triggerShockwave = (): void => {
    this.aimShockwaveAtCameraPointer()
    this.shockwaveEffect.explode()
  }

  // Puts the shockwave's source where the Julia visualizer's is: shifted off screen center toward the camera
  // by the same small amount per pad unit (so a modest Camera Position stays near the middle, not
  // out in a corner). Screen y grows downward. The effect projects its position through a fixed camera at
  // z = 7 with a 60 degree field of view, so the matching world point on the shockwave's plane follows
  // from that frustum.
  private aimShockwaveAtCameraPointer = (): void => {
    const range = window.config.user.sway.value
    // Use where the camera has actually got to, not the pointer's target: the camera eases toward the pointer
    // (and stores y negated), and the Julia wave likewise uses its eased steering.
    const position = this.getCameraPosition()
    const padX = Math.max(-range, Math.min(range, position.x))
    const padY = Math.max(-range, Math.min(range, position.y))
    // Normalized device offset from center: the screen fraction shift times two (NDC spans -1 to 1).
    const normX = 2 * padX * CAMERA_STEER_SCREEN_FRACTION_PER_PAD_UNIT
    const normY = 2 * padY * CAMERA_STEER_SCREEN_FRACTION_PER_PAD_UNIT
    const halfHeight = Math.tan((SHOCKWAVE_CAMERA_FOV / 2) * Math.PI / 180) * (SHOCKWAVE_CAMERA_Z - SHOCKWAVE_PLANE_Z)
    const halfWidth = halfHeight * (window.innerWidth / window.innerHeight)
    this.shockwavePosition.set(normX * halfWidth, -normY * halfHeight, SHOCKWAVE_PLANE_Z)
  }

  /** Beat-driven effect state, then renders the composite scene through the effects to the screen. */
  render = (audio: AudioAnalysedDataForVisualization): void => {
    const { kaleidoscope, kaleidoscopeCount, kaleidoscopeMode, kaleidoscopeSource } = window.config.effects
    const mode = Math.round(kaleidoscopeMode.value)
    // Auto, while it is on, decides the fold (on and how many wedges); the stored settings stay as they are. Mode and source are still the user's.
    const section = sectionTracker.getState()
    const now = performance.now()
    // The snare's roll is read all the time (20 times a second), so the Beat HUD always shows it; Auto steers by it only in a buildup.
    const heard = snareRoll.tick(beatMonitor.getBandOnsets, tempoTracker.getPeriodMs(), now)
    const roll = section.section === 'buildup' ? heard : null
    const auto = autoMode.kaleidoscope(section, now, audio.beat.fresh, roll)
    const count = auto ? (auto.on ? auto.count : 1) : kaleidoscope.value ? Math.round(kaleidoscopeCount.value) : 1
    this.kaleidoscopeEffect.setFold(count, mode, kaleidoscopeSource.value, auto ? AUTO_FOLD_MORPH_MS : undefined)
    this.shockwaveEffect.speed =SHOCKWAVE_BASE_SPEED + (window.config.user.speed.value / 15) + audio.beat.value * 1.25
    const glow = window.config.effects.glow.value
    this.syncGlow(glow)
    if (glow) this.bloomEffect.blendMode.opacity.value = audio.beat.value * audio.beat.energy
    // The wave's source follows the camera while it is out (the effect re-projects its position every frame).
    this.aimShockwaveAtCameraPointer()
    // Which bands can set off a beat is chosen in the Frequency HUD and applied by the beat detector itself.
    if (audio.beat.fresh && window.config.effects.shockwave.value) this.triggerShockwave()
    // Auto marks the jump to the drop's big fold with a single wave, Shockwave on or off.
    else if (autoMode.dropShockwave()) this.triggerShockwave()
    // Read every frame, drawn through the composer or not: the clock hands out the time since its last read, and a morph or a wave that
    // starts after a long idle stretch must not get all of that time in its first frame and finish at once.
    const deltaTime = this.clock.getDelta()
    if (!glow && this.isIdle()) this.drawCompositeDirect()
    else this.composer.render(deltaTime)
  }

  /** With nothing to add, the effect pass would copy the composite to the screen unchanged, at the cost of a second full-screen pass and its buffer. */
  private isIdle = (): boolean => this.kaleidoscopeEffect.isIdle() && !this.shockwaveEffect.active

  private drawCompositeDirect = (): void => {
    perfProbe.begin('post.composite', true)
    this.renderer.setRenderTarget(null)
    this.renderer.render(this.scene, this.camera)
    perfProbe.end('post.composite')
  }

  /**
   * Draws one frame through each effect pass (with and without Glow) so their shaders compile now, behind the startup load, instead of the
   * first time Glow is switched. Nothing shows: the composite is black until a layer has drawn.
   */
  warm = (): void => {
    const glow = this.glowPass.enabled
    ;[true, false].forEach((withGlow) => {
      this.syncGlow(withGlow)
      this.composer.render(0)
    })
    this.syncGlow(glow)
  }

  /** The glow's blur runs at this fraction of the screen size. */
  setBloomScale = (scale: number): void => {
    this.bloomEffect.resolution.scale = scale
  }

  resize = (width: number, height: number): void => {
    this.composer.setSize(width, height)
  }

  dispose = (): void => {
    this.composer.dispose()
  }
}
