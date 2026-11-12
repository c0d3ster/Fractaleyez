// Defaults and ranges for the Audio section's sliders (configDefaults.ts), and the beat's fade.
export const audioConfig = {
  threshold_DEFAULT: 2,
  threshold_MIN: 0,
  threshold_MAX: 5,
  threshold_STEP_SIZE: 0.1,

  ignoreTime_DEFAULT: 250,
  ignoreTime_MIN: 0,
  ignoreTime_MAX: 2500,
  ignoreTime_STEP_SIZE: 50,

  /** How long a beat's value takes to fade from 1 to 0. */
  beatDecayMs: 300,
}
