import * as THREE from 'three'
import { Effect } from 'postprocessing'

// A radial (kaleidoscope) mirror around the screen center: the circle is cut into `count` equal wedges, the first
// one starting straight up and running counterclockwise through the left, and every wedge after it is the
// previous one's reflection. At 2 that is the left half mirrored onto the right. 1 is off. Odd counts would leave one
// seam where the last reflection meets the first wedge, since the reflections only close up evenly on even counts.
// Works in the UV stage, so it folds whatever the effects before it produced. `aspect` keeps the wedges true
// angles on a wide screen.
const fragmentShader = `
  uniform float count;

  void mainUv(inout vec2 uv) {
    if (count < 1.5) return;
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
    uv = 1.0 - abs(1.0 - mod(foldedUv, 2.0));
  }
`

export class KaleidoscopeEffect extends Effect {
  private readonly countUniform: THREE.Uniform

  constructor() {
    const countUniform = new THREE.Uniform(1)
    super('KaleidoscopeEffect', fragmentShader, { uniforms: new Map([['count', countUniform]]) })
    this.countUniform = countUniform
  }

  setCount = (count: number): void => {
    this.countUniform.value = count
  }
}
