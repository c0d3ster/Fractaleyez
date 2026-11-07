import { SectionTick } from './sections'

const BANDS = 5

/**
 * The last `capacity` ticks of a session (time, the five band powers, beats), in fixed typed arrays: about 30 bytes a tick whatever the
 * session length (1.4 MB for 40 minutes). Kept as one object per tick it was about ten times that, for a recording only ever read on export.
 */
export class TickRecorder {
  private readonly times: Float64Array
  private readonly power: Float32Array
  private readonly beats: Uint8Array
  private head = 0
  private size = 0

  constructor(private readonly capacity: number) {
    this.times = new Float64Array(capacity)
    this.power = new Float32Array(capacity * BANDS)
    this.beats = new Uint8Array(capacity)
  }

  push = (t: number, power: ArrayLike<number>, beats: number): void => {
    this.times[this.head] = t
    for (let b = 0; b < BANDS; b++) this.power[this.head * BANDS + b] = power[b] ?? 0
    this.beats[this.head] = Math.min(255, beats)
    this.head = (this.head + 1) % this.capacity
    this.size = Math.min(this.size + 1, this.capacity)
  }

  get length(): number {
    return this.size
  }

  /** The recorded ticks, oldest first, as new objects (for an export or a test, not every frame). */
  toTicks = (): SectionTick[] => {
    const start = (this.head - this.size + this.capacity) % this.capacity
    return Array.from({ length: this.size }, (_, i) => {
      const at = (start + i) % this.capacity
      return {
        t: this.times[at]!,
        power: Array.from(this.power.subarray(at * BANDS, at * BANDS + BANDS)),
        beats: this.beats[at]!,
      }
    })
  }

  clear = (): void => {
    this.head = 0
    this.size = 0
  }
}
