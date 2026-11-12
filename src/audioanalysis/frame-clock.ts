// Puts the worklet's frames (timed by their sample count, which is steady) on the page's `performance.now()` timeline, which the beat
// monitor's consumers (the HUDs, the lag probe) read against. The offset between the two is the lowest delivery delay seen: it can fall
// quickly (a late first frame) but is capped per frame, so a stalled thread's burst of queued frames does not squash their spacing, and
// it creeps up slowly to follow the audio clock drifting from the page's clock.

const MAX_DROP_MS_PER_FRAME = 0.5
const CREEP_MS_PER_FRAME = 0.01

export class FrameClock {
  private offsetMs: number | null = null

  /** The frame's time on the page's clock, given its audio-clock time and the page's clock now. */
  toPageMs = (frameMs: number, nowMs: number): number => {
    const observed = nowMs - frameMs
    if (this.offsetMs === null) this.offsetMs = observed
    else if (observed < this.offsetMs) this.offsetMs = Math.max(observed, this.offsetMs - MAX_DROP_MS_PER_FRAME)
    else this.offsetMs = Math.min(observed, this.offsetMs + CREEP_MS_PER_FRAME)
    return frameMs + this.offsetMs
  }
}
