export const colorConfig = {
  saturation_DEFAULT: 0.5,
  saturation_MIN: 0,
  saturation_MAX: 1,
  saturation_STEP_SIZE: 0.1,

  // The palette range (see paletteRange.ts): the two handles on the palette strip. The defaults use the whole palette.
  rangeStart_DEFAULT: 0,
  rangeStart_MIN: 0,
  rangeStart_MAX: 1,
  rangeStart_STEP_SIZE: 0.01,

  rangeEnd_DEFAULT: 1,
  rangeEnd_MIN: 0,
  rangeEnd_MAX: 1,
  rangeEnd_STEP_SIZE: 0.01,

  // Palettes (see palettes.ts). The default is the rainbow.
  palette_DEFAULT: 'rainbow',
  customStops_DEFAULT: ['#ff2d95', '#ffd23f', '#2de2e6'],
  customStops_MIN: 2,
  customStops_MAX: 12,

  paletteCycles_DEFAULT: 1,
  paletteCycles_MIN: 0.25,
  paletteCycles_MAX: 8,
  paletteCycles_STEP_SIZE: 0.25,

  palettePhase_DEFAULT: 0,
  palettePhase_MIN: 0,
  palettePhase_MAX: 1,
  palettePhase_STEP_SIZE: 0.01,
} as const
