import * as THREE from 'three'
import { Effect } from 'postprocessing'

import { getParticleCrossfadeDurationMs } from '../../config/visualizer.config'

// A radial (kaleidoscope) mirror around the screen center: the circle is cut into `count` equal wedges, the first
// one starting straight up and running counterclockwise through the left, and every wedge after it is the
// previous one's reflection. At 2 that is the left half mirrored onto the right. 1 is off. Odd counts would leave one
// seam where the last reflection meets the first wedge, since the reflections only close up evenly on even counts.
// Works in the UV stage, so it folds whatever the effects before it produced. `aspect` keeps the wedges true
// angles on a wide screen.
// Changing the count morphs between the two folds, over the same crossfade duration as the other layers use (the user's
// Crossfade setting; 0 is a plain cut): both are computed for the same pixel and their sample positions
// are blended, so the wedges swirl into place instead of snapping.
const fragmentShader = `
  uniform float countFrom;
  uniform float countTo;
  uniform float blend;

  vec2 fold(vec2 uv, float count) {
    if (count < 1.5) return uv;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float radius = length(p);
    float wedge = PI2 / count;
    // Angle from the left axis, shifted so wedge 0 starts at the top and sweeps through the left side.
    float t = mod(atan(p.y, -p.x) + PI * 0.5, PI2);
    float segment = floor(t / wedge);
    float local = t - segment * wedge;
    if (mod(segment, 2.0) > 0.5) local = wedge - local;
    float folded = local - PI * 0.5;
    vec2 q = radius * vec2(-cos(folded), sin(folded));
    // Folding keeps the radius, so on a wide screen a point can land past the top or bottom; bounce it back in
    // instead of letting the edge pixel smear.
    vec2 foldedUv = q / vec2(aspect, 1.0) + 0.5;
    return 1.0 - abs(1.0 - mod(foldedUv, 2.0));
  }

  void mainUv(inout vec2 uv) {
    if (countFrom < 1.5 && countTo < 1.5) return;
    uv = mix(fold(uv, countFrom), fold(uv, countTo), blend);
  }
`

const easeInOut = (t: number): number => t * t * (3 - 2 * t)

export class KaleidoscopeEffect extends Effect {
  private readonly fromUniform: THREE.Uniform
  private readonly toUniform: THREE.Uniform
  private readonly blendUniform: THREE.Uniform
  private target = 1
  private progress = 1

  constructor() {
    const fromUniform = new THREE.Uniform(1)
    const toUniform = new THREE.Uniform(1)
    const blendUniform = new THREE.Uniform(1)
    super('KaleidoscopeEffect', fragmentShader, {
      uniforms: new Map([['countFrom', fromUniform], ['countTo', toUniform], ['blend', blendUniform]]),
    })
    this.fromUniform = fromUniform
    this.toUniform = toUniform
    this.blendUniform = blendUniform
  }

  /** Safe to call every frame: only a change of target starts a morph (from whichever fold is closer if one is mid-way). */
  setCount = (count: number): void => {
    if (count === this.target) return
    if (this.progress > 0.5) this.fromUniform.value = this.target
    this.target = count
    this.toUniform.value = count
    this.progress = 0
  }

  override update(_renderer: THREE.WebGLRenderer, _inputBuffer: THREE.WebGLRenderTarget, deltaTime: number): void {
    if (this.progress >= 1) return
    // Read each frame so a change to the setting applies to the next morph, and to one already under way.
    const durationSeconds = getParticleCrossfadeDurationMs() / 1000
    this.progress = durationSeconds > 0 ? Math.min(1, this.progress + deltaTime / durationSeconds) : 1
    this.blendUniform.value = easeInOut(this.progress)
    if (this.progress >= 1) this.fromUniform.value = this.target
  }
}
