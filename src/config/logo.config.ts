export const logoConfig = {
  sprite_DEFAULT: 'fractaleye.png',

  threeD_DEFAULT: true, // off is a flat logo that spins in the screen plane

  size_MIN: 0.25,
  size_MAX: 3,
  size_DEFAULT: 1, // 1 fills LOGO_HEIGHT_FRACTION of the view
  size_STEP_SIZE: 0.01,

  tilt_MIN: 0,
  tilt_MAX: 1, // 1 turns the logo a quarter turn with the camera at the edge of the largest Sway, 0 keeps it facing front
  tilt_DEFAULT: 0.35,
  tilt_STEP_SIZE: 0.01,

  spinSpeed_MIN: -5, // negative spins the other way
  spinSpeed_MAX: 5,
  spinSpeed_DEFAULT: 0, // 0 is no spin
  spinSpeed_STEP_SIZE: 0.1,

  beatScale_MIN: 0,
  beatScale_MAX: 2,
  beatScale_DEFAULT: 0.5,
  beatScale_STEP_SIZE: 0.01,

  shake_MIN: 0,
  shake_MAX: 1,
  shake_DEFAULT: 0,
  shake_STEP_SIZE: 0.01,
} as const
