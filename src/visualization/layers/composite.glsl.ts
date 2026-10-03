import { layerConfig } from '../../config/layers.config'

export const MAX_COMPOSITE_LAYERS = layerConfig.CAP

export const compositeVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

// Sampler arrays can't be indexed dynamically in GLSL ES 3.00, so each slot is unrolled with a literal index.
const slots = Array.from({ length: MAX_COMPOSITE_LAYERS }, (_, i) => /* glsl */ `
    if (uCount > ${i}) {
      float key = 1.0 - smoothstep(0.0, MASK_EDGE, max(acc.r, max(acc.g, acc.b)));
      acc += texture2D(uLayer${i}, vUv).rgb * uOpacity[${i}] * key;
    }`).join('')

const samplers = Array.from({ length: MAX_COMPOSITE_LAYERS }, (_, i) => `uniform sampler2D uLayer${i};`).join('\n  ')

/**
 * `mask` blend, front to back: each layer shows only where everything in front of it is dark (a luminance key), the
 * same rule Julia's shader used to fill its black areas with the video. The front layer (key = 1) adds in full.
 */
export const compositeFragmentShader = /* glsl */ `
  precision highp float;

  ${samplers}
  uniform float uOpacity[${MAX_COMPOSITE_LAYERS}];
  uniform int uCount;

  varying vec2 vUv;

  const float MASK_EDGE = ${layerConfig.MASK_EDGE.toFixed(2)};

  void main() {
    vec3 acc = vec3(0.0);
    ${slots}
    gl_FragColor = vec4(min(acc, vec3(1.0)), 1.0);
  }
`
