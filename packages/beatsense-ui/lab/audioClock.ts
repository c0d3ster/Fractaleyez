// The analysis runs on the audio clock (a frame's time is its sample count, see beatsense's toAudioFrame), so the HUDs need "now" on that
// clock too, between frames and at the display's rate. It is the page's performance.now() minus an offset: the lowest delivery delay seen
// between a frame's audio time and its arrival. The offset falls quickly (a late first frame) but is capped per frame, so a stalled
// thread's burst of queued frames does not squash their spacing, and it creeps up slowly to follow the audio clock drifting from the page's.
// The same tracking as the Fractaleyez app's FrameClock, which maps the other way (frames onto the page clock).

const MAX_DROP_MS_PER_FRAME = 0.5
const CREEP_MS_PER_FRAME = 0.01

export class AudioClock {
  /** The page clock minus the audio clock, ms; null before the first frame. */
  private offsetMs: number | null = null

  constructor(private readonly pageNow: () => number = () => performance.now()) {}

  /** Call with each frame's audio time (ms) as it arrives. */
  observe = (frameMs: number): void => {
    const observed = this.pageNow() - frameMs
    if (this.offsetMs === null) this.offsetMs = observed
    else if (observed < this.offsetMs) this.offsetMs = Math.max(observed, this.offsetMs - MAX_DROP_MS_PER_FRAME)
    else this.offsetMs = Math.min(observed, this.offsetMs + CREEP_MS_PER_FRAME)
  }

  /** The audio clock now, ms: the newest frame's time as it arrives, moving on smoothly between frames. 0 before the first frame. */
  now = (): number => (this.offsetMs === null ? 0 : this.pageNow() - this.offsetMs)
}
