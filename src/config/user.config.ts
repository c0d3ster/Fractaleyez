export const userConfig = {
  showerrors: true,
  showloginfos: true,
  hudToggleKey: 'h',
  hudDisplayed: true,
  volume: 0.5,

  speed_DEFAULT: 2,
  speed_MIN: 0,
  speed_MAX: 20,
  speed_STEP_SIZE: 0.5,

  rotationSpeed_DEFAULT: 2,
  rotationSpeed_MIN: -20,
  rotationSpeed_MAX: 20,
  rotationSpeed_STEP_SIZE: 0.25,

  scaleFactor_DEFAULT: 1500,
  scaleFactor_MIN: 100,
  scaleFactor_MAX: 2000,
  scaleFactor_STEP_SIZE: 100,

  cameraBound_DEFAULT: 100,
  cameraBound_MIN: 0,
  cameraBound_MAX: 500,
  cameraBound_SEP_SIZE: 20,
} as const
