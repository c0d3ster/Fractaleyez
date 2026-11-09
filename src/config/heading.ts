export const TAU = Math.PI * 2

/** Any angle in radians, wrapped to 0..TAU. */
export const wrapAngle = (angle: number): number => ((angle % TAU) + TAU) % TAU

/** The shortest signed turn (radians, -PI..PI) that takes `from` to `to`. */
export const shortestTurn = (from: number, to: number): number => wrapAngle(to - from + Math.PI) - Math.PI

/**
 * Which way something that spins is pointing right now, in radians clockwise from straight up.
 *
 * The visualizers own their motion: each one reports the angle it has reached every frame (`report`), and the dial in
 * the config UI draws it. Dragging the dial calls `set`, which bumps the revision so every visualizer turns itself to
 * the new bearing the next time it updates (see HeadingFollower).
 */
export class Heading {
  private shown = 0
  private wanted = 0
  private turns = 0

  /** The bearing to draw. */
  get angle(): number {
    return this.shown
  }

  /** The bearing the last drag asked for. */
  get requested(): number {
    return this.wanted
  }

  /** Counts drags, so a follower can tell a new request from one it has already carried out. */
  get revision(): number {
    return this.turns
  }

  /** The user points it somewhere: shown at once, and every follower turns to it. */
  set = (angle: number): void => {
    this.wanted = wrapAngle(angle)
    this.shown = this.wanted
    this.turns += 1
  }

  /** A visualizer says where it has got to. Only changes what is drawn. */
  report = (angle: number): void => {
    this.shown = wrapAngle(angle)
  }
}

/** Which way the user Rotation has the Orbit and fractal layers pointing. */
export const userHeading = new Heading()

/** Which way the logo's Spin Speed has it pointing (in 3D, the turn around its vertical axis, 0 facing the viewer). */
export const logoHeading = new Heading()
