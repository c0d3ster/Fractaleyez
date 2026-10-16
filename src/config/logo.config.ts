export const logoConfig = {
  sprite_DEFAULT: 'fractaleye.png',

  threeD_DEFAULT: true, // off is a flat logo that spins in the screen plane
  tilt_DEFAULT: true, // leans toward the camera position
  tilt_MAX_RADIANS: 0.55, // the lean with the camera at the edge of the largest Sway (about 31 degrees)

  size_MIN: 0.25,
  size_MAX: 3,
  size_DEFAULT: 1, // 1 fills LOGO_HEIGHT_FRACTION of the view
  size_STEP_SIZE: 0.01,

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

  zoom_DEFAULT: false, // endless Droste-style zoom into a point of the image
  zoomSpeed_MIN: -3, // negative zooms back out
  zoomSpeed_MAX: 3,
  zoomSpeed_DEFAULT: 0.4, // levels per second; one level is a factor of ZOOM_RATIO in the logo layer
  zoomSpeed_STEP_SIZE: 0.05,

  autoFocus_DEFAULT: true, // pick the most detailed spot of the image instead of focusX / focusY
  focusX_MIN: 0, // 0 is the image's left edge
  focusX_MAX: 1,
  focusX_DEFAULT: 0.5,
  focusX_STEP_SIZE: 0.01,
  focusY_MIN: 0, // 0 is the image's top edge
  focusY_MAX: 1,
  focusY_DEFAULT: 0.5,
  focusY_STEP_SIZE: 0.01,
} as const
