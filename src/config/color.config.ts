export const colorConfig = {
  saturation_DEFAULT: 0.5,
  saturation_MIN: 0,
  saturation_MAX: 1,
  saturation_STEP_SIZE: 0.1,

  // The hue window (see hueWindow.ts): where on the wheel it starts and how much of the wheel it covers.
  // The defaults (whole wheel from red) are the unrestricted look. The ring in the Color config edits both together.
  hueStart_DEFAULT: 0,
  hueStart_MIN: 0,
  hueStart_MAX: 1,
  hueStart_STEP_SIZE: 0.01,

  hueSpan_DEFAULT: 1,
  hueSpan_MIN: 0.01,
  hueSpan_MAX: 1,
  hueSpan_STEP_SIZE: 0.01,
} as const
