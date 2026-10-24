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
// The other two modes cut the screen into `count` equal strips instead. Every strip shows the same slice of the picture,
// one strip wide, around the source position (the exact middle unless the user picks another), and each strip is the
// reflection of the one next to it: horizontal stacks the strips (mirror lines are horizontal), vertical puts them side by
// side (mirror lines are vertical). When the source sits at a strip's own center, that strip is the picture as it is and the
// rest are its reflections. Moving the source morphs like a change of count does.
const fragmentShader = `
  uniform float countFrom;
  uniform float countTo;
  uniform float modeFrom;
  uniform float modeTo;
  uniform float blend;
  uniform float sourceFrom;
  uniform float sourceTo;

  // Where a point t (0 to 1) along the screen reads from: the matching spot in the slice around source (0 to 1 across the
  // screen). With source at a strip's own center that strip is left as it is and the strips an odd number away from it are
  // flipped; anywhere else (the default, the exact middle) it is the first strip that is left as it is.
  float strip(float t, float count, float source) {
    float scaled = t * count;
    float segment = floor(scaled);
    float local = scaled - segment;
    float sourcePlace = source * count;
    float anchor = abs(fract(sourcePlace) - 0.5) < 0.02 ? clamp(floor(sourcePlace), 0.0, count - 1.0) : 0.0;
    if (mod(segment - anchor, 2.0) > 0.5) local = 1.0 - local;
    float center = clamp(source, 0.5 / count, 1.0 - 0.5 / count);
    return center + (local - 0.5) / count;
  }

  vec2 fold(vec2 uv, float count, float mode, float source) {
    if (count < 1.5) return uv;
    if (mode > 1.5) return vec2(strip(uv.x, count, source), uv.y);
    if (mode > 0.5) return vec2(uv.x, 1.0 - strip(1.0 - uv.y, count, source));
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
    uv = mix(fold(uv, countFrom, modeFrom, sourceFrom), fold(uv, countTo, modeTo, sourceTo), blend);
  }
`

const easeInOut = (t: number): number => t * t * (3 - 2 * t)

export class KaleidoscopeEffect extends Effect {
  private readonly fromUniform: THREE.Uniform
  private readonly toUniform: THREE.Uniform
  private readonly modeFromUniform: THREE.Uniform
  private readonly modeToUniform: THREE.Uniform
  private readonly blendUniform: THREE.Uniform
  private readonly sourceFromUniform: THREE.Uniform
  private readonly sourceToUniform: THREE.Uniform
  private target = 1
  private targetMode = 0
  private targetSource = 0.5
  private progress = 1

  constructor() {
    const fromUniform = new THREE.Uniform(1)
    const toUniform = new THREE.Uniform(1)
    const modeFromUniform = new THREE.Uniform(0)
    const modeToUniform = new THREE.Uniform(0)
    const blendUniform = new THREE.Uniform(1)
    const sourceFromUniform = new THREE.Uniform(0.5)
    const sourceToUniform = new THREE.Uniform(0.5)
    super('KaleidoscopeEffect', fragmentShader, {
      uniforms: new Map([['countFrom', fromUniform], ['countTo', toUniform], ['modeFrom', modeFromUniform], ['modeTo', modeToUniform], ['blend', blendUniform], ['sourceFrom', sourceFromUniform], ['sourceTo', sourceToUniform]]),
    })
    this.fromUniform = fromUniform
    this.toUniform = toUniform
    this.modeFromUniform = modeFromUniform
    this.modeToUniform = modeToUniform
    this.blendUniform = blendUniform
    this.sourceFromUniform = sourceFromUniform
    this.sourceToUniform = sourceToUniform
  }

  /** Safe to call every frame: only a change of target starts a morph (from whichever fold is closer if one is mid-way); count 1 is off, mode is 0 radial, 1 horizontal, 2 vertical, and source (0 to 1) is where the strip modes' untouched strip sits. */
  setFold = (count: number, mode: number, source: number): void => {
    if (count === this.target && mode === this.targetMode && source === this.targetSource) return
    if (this.progress > 0.5) {
      this.fromUniform.value = this.target
      this.modeFromUniform.value = this.targetMode
      this.sourceFromUniform.value = this.targetSource
    }
    this.target = count
    this.targetMode = mode
    this.targetSource = source
    this.toUniform.value = count
    this.modeToUniform.value = mode
    this.sourceToUniform.value = source
    this.progress = 0
  }

  override update(_renderer: THREE.WebGLRenderer, _inputBuffer: THREE.WebGLRenderTarget, deltaTime: number): void {
    if (this.progress >= 1) return
    // Read each frame so a change to the setting applies to the next morph, and to one already under way.
    const durationSeconds = getParticleCrossfadeDurationMs() / 1000
    this.progress = durationSeconds > 0 ? Math.min(1, this.progress + deltaTime / durationSeconds) : 1
    this.blendUniform.value = easeInOut(this.progress)
    if (this.progress >= 1) {
      this.fromUniform.value = this.target
      this.modeFromUniform.value = this.targetMode
      this.sourceFromUniform.value = this.targetSource
    }
  }
}
