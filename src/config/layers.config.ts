export const layerConfig = {
  CAP: 5,
  ORDER_DEFAULT: ['video', 'fractal', 'orbit', 'logo'],

  OPACITY_MIN: 0,
  OPACITY_MAX: 1,
  OPACITY_DEFAULT: 1,
  OPACITY_STEP_SIZE: 0.01,

  // Luminance-key edge for the `mask` blend: a lower layer is fully hidden once the layers in front reach this
  // brightness.
  MASK_EDGE: 0.22,
} as const
