import * as THREE from 'three'

/** Shared by every material that samples its map bicubically: `uBicubic` is 1 to turn it on, `uMapSize` is the map's size in texels. */
export type BicubicUniforms = {
  uBicubic: { value: number }
  uMapSize: { value: THREE.Vector2 }
}

export const createBicubicUniforms = (): BicubicUniforms => ({
  uBicubic: { value: 0 },
  uMapSize: { value: new THREE.Vector2(1, 1) },
})

// Catmull-Rom through nine bilinear taps (the weights of the four texels either side of the sample point are folded into
// five positions per axis, three used). Smoother than the GPU's bilinear filter when a texture is drawn larger than its
// own size, which shows as soft blocky diamonds at 4x.
const BICUBIC_PARS = /* glsl */ `
  uniform float uBicubic;
  uniform vec2 uMapSize;

  vec4 sampleCatmullRom( sampler2D tex, vec2 uv, vec2 size ) {
    vec2 samplePos = uv * size;
    vec2 texPos1 = floor( samplePos - 0.5 ) + 0.5;
    vec2 f = samplePos - texPos1;
    vec2 w0 = f * ( -0.5 + f * ( 1.0 - 0.5 * f ) );
    vec2 w1 = 1.0 + f * f * ( -2.5 + 1.5 * f );
    vec2 w2 = f * ( 0.5 + f * ( 2.0 - 1.5 * f ) );
    vec2 w3 = f * f * ( -0.5 + 0.5 * f );
    vec2 w12 = w1 + w2;
    vec2 offset12 = w2 / w12;
    vec2 p0 = ( texPos1 - 1.0 ) / size;
    vec2 p3 = ( texPos1 + 2.0 ) / size;
    vec2 p12 = ( texPos1 + offset12 ) / size;
    vec4 result = vec4( 0.0 );
    result += texture2D( tex, vec2( p0.x, p0.y ) ) * w0.x * w0.y;
    result += texture2D( tex, vec2( p12.x, p0.y ) ) * w12.x * w0.y;
    result += texture2D( tex, vec2( p3.x, p0.y ) ) * w3.x * w0.y;
    result += texture2D( tex, vec2( p0.x, p12.y ) ) * w0.x * w12.y;
    result += texture2D( tex, vec2( p12.x, p12.y ) ) * w12.x * w12.y;
    result += texture2D( tex, vec2( p3.x, p12.y ) ) * w3.x * w12.y;
    result += texture2D( tex, vec2( p0.x, p3.y ) ) * w0.x * w3.y;
    result += texture2D( tex, vec2( p12.x, p3.y ) ) * w12.x * w3.y;
    result += texture2D( tex, vec2( p3.x, p3.y ) ) * w3.x * w3.y;
    // The negative lobes can overshoot at sharp edges.
    return clamp( result, 0.0, 1.0 );
  }
`

// Only where the map is magnified (fewer than one texel per screen pixel); smaller than that the GPU's mipmapped lookup is right.
const BICUBIC_MAP_FRAGMENT = /* glsl */ `
  #ifdef USE_MAP
    vec4 texelColor = texture2D( map, vUv );
    if ( uBicubic > 0.5 ) {
      vec2 dx = dFdx( vUv * uMapSize );
      vec2 dy = dFdy( vUv * uMapSize );
      if ( max( dot( dx, dx ), dot( dy, dy ) ) < 1.0 ) texelColor = sampleCatmullRom( map, vUv, uMapSize );
    }
    texelColor = mapTexelToLinear( texelColor );
    diffuseColor *= texelColor;
  #endif
`

/**
 * Lets a MeshBasicMaterial sample its map bicubically while `uniforms.uBicubic` is 1. With it at 0 the lookup is the
 * stock one. Needs derivatives in the fragment shader, which WebGL2 has built in, so callers check `isWebGL2` first.
 */
export const enableBicubicMap = (material: THREE.MeshBasicMaterial, uniforms: BicubicUniforms): void => {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBicubic = uniforms.uBicubic
    shader.uniforms.uMapSize = uniforms.uMapSize
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <map_pars_fragment>', `#include <map_pars_fragment>\n${BICUBIC_PARS}`)
      .replace('#include <map_fragment>', BICUBIC_MAP_FRAGMENT)
  }
  material.needsUpdate = true
}
