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
  // Radians per second per unit of Rotation, shared by every visualizer so they spin at the same rate: 0.8 rad/s
  // (about 46 degrees a second) at the slider's 20. Hopalong used to add a fixed 0.001 rad per unit every frame,
  // which is 0.06 here at 60fps; Julia used 0.03. 0.04 keeps saved Hopalong configs close (about 1.5x slower at
  // 60fps) while Julia speeds up.
  rotationSpeed_RAD_PER_SEC_PER_UNIT: 0.04,

  scaleFactor_DEFAULT: 1500,
  scaleFactor_MIN: 100,
  scaleFactor_MAX: 2000,
  scaleFactor_STEP_SIZE: 10,

  sway_DEFAULT: 0,
  sway_MIN: 0,
  sway_MAX: 500,
  sway_STEP_SIZE: 20,

  // The fractal is the reference: it always steers toward the camera pad. Off, Orbit and the logo go the same way. On,
  // both go the other way: the Orbit camera moves toward the pad (the vortex look) and the logo leans away from it.
  reverseLean_DEFAULT: false,
} as const
