// A pad pixel is a few units of Sway (about 3 at Sway 500), so a drag can straddle 0 without ever landing on it.
const CENTER_SNAP_FRACTION_OF_RANGE = 0.01

/** Pulls a pad value within a pixel or so of the center onto exactly 0. Per axis, so X can be 0 while Y is off center. */
export const snapToCenter = (value: number, range: number): number =>
  Math.abs(value) <= range * CENTER_SNAP_FRACTION_OF_RANGE ? 0 : value
