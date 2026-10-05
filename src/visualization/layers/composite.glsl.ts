import { BlendMode } from '../../config/configDefaults'
import { layerConfig } from '../../config/layers.config'

export const MAX_COMPOSITE_LAYERS = layerConfig.CAP

/** The value each layer's `uBlend` slot carries for its blend mode; the shader branches on these. */
export const BLEND_CODES: Record<BlendMode, number> = { mask: 0, screen: 1, over: 2 }

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
      vec4 texel = texture2D(uLayer${i}, vUv);
      vec3 color = texel.rgb * uOpacity[${i}];
      if (uBlend[${i}] > ${BLEND_CODES.screen + 0.5}) {
        float visible = (1.0 - cover) * (1.0 - smoothstep(0.0, MASK_EDGE, max(masked.r, max(masked.g, masked.b))));
        masked += color * visible;
        cover += (1.0 - cover) * texel.a * uOpacity[${i}];
      } else if (uBlend[${i}] > ${BLEND_CODES.mask + 0.5}) {
        screened = 1.0 - (1.0 - screened) * (1.0 - color);
      } else {
        float visible = (1.0 - cover) * (1.0 - smoothstep(0.0, MASK_EDGE, max(masked.r, max(masked.g, masked.b))));
        masked += color * visible;
      }
    }`).join('')

const samplers = Array.from({ length: MAX_COMPOSITE_LAYERS }, (_, i) => `uniform sampler2D uLayer${i};`).join('\n  ')

/**
 * Three blends, walked front to back. `mask`: each layer shows only where the layers in front of it are dark (a
 * luminance key), the same rule Julia's shader used to fill its black areas with the video; the front layer
 * adds in full. `over`: like mask, but the layer also covers what is behind it by its own alpha (its target is cleared
 * transparent, colors premultiplied by that alpha), so a dark logo still hides the layers behind it. `screen`:
 * `1-(1-a)(1-b)` over the result. Screen layers never feed the key or the coverage, so they don't knock out what is
 * behind them (Orbit particles keep the fractal glowing through their soft edges, as the old canvas blend did), and
 * one lands the same wherever it sits in `layers.order`.
 */
export const compositeFragmentShader = /* glsl */ `
  precision highp float;

  ${samplers}
  uniform float uOpacity[${MAX_COMPOSITE_LAYERS}];
  uniform float uBlend[${MAX_COMPOSITE_LAYERS}];
  uniform int uCount;

  varying vec2 vUv;

  const float MASK_EDGE = ${layerConfig.MASK_EDGE.toFixed(2)};

  void main() {
    vec3 masked = vec3(0.0);
    vec3 screened = vec3(0.0);
    float cover = 0.0;
    ${slots}
    vec3 base = min(masked, vec3(1.0));
    gl_FragColor = vec4(1.0 - (1.0 - base) * (1.0 - screened), 1.0);
  }
`
