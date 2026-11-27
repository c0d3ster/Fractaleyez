export const fractalConfig = {
  tour_DEFAULT: 50,
  tour_MIN: 0,
  tour_MAX: 100,
  tour_STEP_SIZE: 0.1,

  // Which fractal family (FRACTAL_FAMILIES in visualization/fractal-families), picked on the Type row above the Shape pad, not a slider.
  // The max is the last family's index; fractal-families.test.ts keeps it in step with the list.
  family_DEFAULT: 0,
  family_MIN: 0,
  family_MAX: 5,
  family_STEP_SIZE: 1,
} as const
