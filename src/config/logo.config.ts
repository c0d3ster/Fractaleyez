export const logoConfig = {
  sprite_DEFAULT: 'fractaleye.png',

  threeD_DEFAULT: true, // off is a flat logo that spins in the screen plane
  tilt_DEFAULT: true, // leans toward the camera position
  tilt_MAX_RADIANS: 0.55, // the lean with the camera at the edge of the largest Sway (about 31 degrees)

  baseHeightFraction: 0.3, // the fraction of the view height the logo fills at Size 1 and no beat

  size_MIN: 0.25,
  size_MAX: 3,
  size_DEFAULT: 1, // 1 fills baseHeightFraction of the view
  size_STEP_SIZE: 0.01,

  spinSpeed_MIN: -5, // negative spins the other way
  spinSpeed_MAX: 5,
  spinSpeed_DEFAULT: 0, // 0 is no spin
  spinSpeed_STEP_SIZE: 0.1,

  beatScale: 1, // how far a full beat swells the logo (1 grows it by its own size), while Wob Wob is on

  shake_MIN: 0,
  shake_MAX: 1,
  shake_DEFAULT: 0,
  shake_STEP_SIZE: 0.01,

  zoom_DEFAULT: false, // endless zoom into the image, its rate follows the user Speed

  // Where the logo sits on the screen, as 0..1 across the view (y down), set by the pad. The range is the limit on the
  // logo's center: 0..1 keeps the center on screen while an edge can hang off; widen it to let the logo leave entirely.
  positionX_MIN: 0,
  positionX_MAX: 1,
  positionX_DEFAULT: 0.5,
  positionX_STEP_SIZE: 0.01,
  positionY_MIN: 0,
  positionY_MAX: 1,
  positionY_DEFAULT: 0.5,
  positionY_STEP_SIZE: 0.01,

  // The point of the image the zoom dives into, as 0..1 across the image (y down), set by the pad.
  focusX_MIN: 0,
  focusX_MAX: 1,
  focusX_DEFAULT: 0.5,
  focusX_STEP_SIZE: 0.01,
  focusY_MIN: 0,
  focusY_MAX: 1,
  focusY_DEFAULT: 0.5,
  focusY_STEP_SIZE: 0.01,
} as const
