import * as THREE from 'three'
import { BloomEffect, EffectComposer, EffectPass, RenderPass, ShockWaveEffect } from 'postprocessing'

import { AudioAnalysedDataForVisualization } from '../../audioanalysis/audio-analysed-data'
import { CAMERA_STEER_SCREEN_FRACTION_PER_PAD_UNIT } from '../../config/visualizer.config'

// The shockwave effect projects its position through a fixed camera at this distance and field of view,
// onto a plane at this depth (the camera's focus point depth).
const SHOCKWAVE_CAMERA_FOV = 60
const SHOCKWAVE_CAMERA_Z = 7
const SHOCKWAVE_PLANE_Z = -5
// Added to the Speed slider and beat terms so the wave never crawls at a low Speed.
const SHOCKWAVE_BASE_SPEED = 0.05

/** Bloom and shockwave, run once over the compositor's output (not per layer) and drawn to the screen. */
export class PostEffects {
  private readonly composer: EffectComposer
  private readonly bloomEffect = new BloomEffect()
  private readonly shockwaveEffect: ShockWaveEffect
  // The shockwave's own world position (not the camera's focus point, which the camera looks at and so
  // always projects to screen center). Moved to the camera pointer before each explosion.
  private readonly shockwavePosition = new THREE.Vector3(0, 0, SHOCKWAVE_PLANE_Z)
  private readonly clock = new THREE.Clock()

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    private readonly getCameraPosition: () => { x: number; y: number },
  ) {
    this.composer = new EffectComposer(renderer)
    this.composer.addPass(new RenderPass(scene, camera))
    this.bloomEffect.kernelSize = 1

    const fakeCamera = new THREE.PerspectiveCamera(SHOCKWAVE_CAMERA_FOV, window.innerWidth / window.innerHeight)
    fakeCamera.position.z = SHOCKWAVE_CAMERA_Z

    const options = { waveSize: .15, speed: .5, amplitude: .2, maxRadius: 2 }
    this.shockwaveEffect = new ShockWaveEffect(fakeCamera, this.shockwavePosition, options)

    const effectPass = new EffectPass(camera, this.shockwaveEffect, this.bloomEffect)
    effectPass.renderToScreen = true
    this.composer.addPass(effectPass)
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
    const range = window.config.user.cameraBound.value
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
    this.shockwaveEffect.speed = SHOCKWAVE_BASE_SPEED + (window.config.user.speed.value / 15) + audio.beat.value * 1.25
    if (window.config.effects.glow.value) {
      this.bloomEffect.blendMode.opacity.value = audio.beat.value * audio.beat.energy
    }
    // The wave's source follows the camera while it is out (the effect re-projects its position every frame).
    this.aimShockwaveAtCameraPointer()
    // Which bands can set off a beat is chosen in the Frequency HUD and applied by the beat detector itself.
    if (audio.beat.fresh && window.config.effects.shockwave.value) this.triggerShockwave()
    this.composer.render(this.clock.getDelta())
  }

  resize = (width: number, height: number): void => {
    this.composer.setSize(width, height)
  }

  dispose = (): void => {
    this.composer.dispose()
  }
}
