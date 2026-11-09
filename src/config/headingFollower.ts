import { Heading, shortestTurn } from './heading'

/** One visualizer's view of a Heading: hands it the turn it still owes the user's last drag, once. */
export class HeadingFollower {
  private seen: number

  constructor(private readonly heading: Heading) {
    this.seen = heading.revision
  }

  /** Radians (clockwise positive) to add to `current` to honor a drag since the last call, else 0. */
  takeTurn = (current: number): number => {
    if (this.heading.revision === this.seen) return 0
    this.seen = this.heading.revision
    return shortestTurn(current, this.heading.requested)
  }
}
