// No transition takes longer than this: a long jump at low Speed speeds up to meet the cap.
const SHAPE_MAX_TRANSITION_SECONDS = 15
const SHAPE_EASE_SECONDS = 0.4
const SHAPE_EASE_MAX_JUMP_FRACTION = 0.35
const SHAPE_VELOCITY_HALF_LIFE_SECONDS = 0.1

// Moves a scalar toward a target at a steady rate (in units per second) with eased ends, finishing any
// jump within SHAPE_MAX_TRANSITION_SECONDS by speeding up when the base rate would be too slow. Used for
// the position along the Julia tour and for the distance travelled in a manual 2D glide.
export class ShapeGlider {
  position = 0
  private velocity = 0
  private lastTarget = 0
  private jumpDistance = 0
  private capRate = 0

  reset(position: number): void {
    this.position = position
    this.lastTarget = position
    this.velocity = 0
    this.jumpDistance = 0
    this.capRate = 0
  }

  // Makes the next step treat its target as new, so the jump distance and cap are measured from here.
  retarget(): void {
    this.lastTarget = Number.POSITIVE_INFINITY
  }

  step(target: number, baseRate: number, dt: number): number {
    // When the target moves, remember how fast we'd need to go to finish within the cap; the glide runs at
    // whichever is faster, the Speed-based rate or that cap rate.
    if (Math.abs(target - this.lastTarget) > 1e-6) {
      this.jumpDistance = Math.abs(target - this.position)
      this.capRate = this.jumpDistance / SHAPE_MAX_TRANSITION_SECONDS
      this.lastTarget = target
    }
    const rate = Math.max(baseRate, this.capRate)
    const remaining = target - this.position
    // The ease-out zone is a time's worth of travel, but never more than a third of the jump, so short
    // hops at high Speed stay snappy instead of being dominated by the ease.
    const easeDistance = Math.max(1e-6, Math.min(rate * SHAPE_EASE_SECONDS, SHAPE_EASE_MAX_JUMP_FRACTION * this.jumpDistance))
    const desiredVelocity = Math.sign(remaining) * rate * Math.min(1, Math.abs(remaining) / easeDistance)
    this.velocity += (desiredVelocity - this.velocity) * (1 - Math.pow(0.5, dt / SHAPE_VELOCITY_HALF_LIFE_SECONDS))
    this.position += this.velocity * dt
    // Land on the target instead of overshooting it (the smoothed velocity can carry a little momentum).
    if (Math.sign(target - this.position) !== Math.sign(remaining) || Math.abs(remaining) < 0.002) {
      this.position = target
      this.velocity = 0
    }
    return this.position
  }
}
