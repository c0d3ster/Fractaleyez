import { SectionTick } from './sections'
import { SPECTRUM_BANDS, TickExtras } from './tick-extras'

const BANDS = 5

/**
 * The last `capacity` ticks of a session (time, the five band powers, beats, the BPM shown, and the extras: band peaks, band onsets and a
 * coarse spectrum), in fixed typed arrays: about 95 bytes a tick whatever the session length (4.6 MB for 40 minutes). Kept as one object
 * per tick it was about ten times that, for a recording only ever read on export.
 */
export class TickRecorder {
  private readonly times: Float64Array
  private readonly power: Float32Array
  private readonly beats: Uint8Array
  // NaN for no BPM shown.
  private readonly bpm: Float32Array
  private readonly peak: Float32Array
  private readonly onsets: Uint8Array
  private readonly spectrum: Uint8Array
  // 1 when the tick has extras, 2 when it also has a spectrum.
  private readonly extras: Uint8Array
  private head = 0
  private size = 0

  constructor(private readonly capacity: number) {
    this.times = new Float64Array(capacity)
    this.power = new Float32Array(capacity * BANDS)
    this.beats = new Uint8Array(capacity)
    this.bpm = new Float32Array(capacity)
    this.peak = new Float32Array(capacity * BANDS)
    this.onsets = new Uint8Array(capacity)
    this.spectrum = new Uint8Array(capacity * SPECTRUM_BANDS)
    this.extras = new Uint8Array(capacity)
  }

  push = (t: number, power: ArrayLike<number>, beats: number, bpm: number | null = null, extras: TickExtras | null = null): void => {
    const at = this.head
    this.times[at] = t
    for (let b = 0; b < BANDS; b++) this.power[at * BANDS + b] = power[b] ?? 0
    this.beats[at] = Math.min(255, beats)
    this.bpm[at] = bpm ?? NaN
    this.extras[at] = extras === null ? 0 : extras.spectrum === null ? 1 : 2
    if (extras) {
      for (let b = 0; b < BANDS; b++) this.peak[at * BANDS + b] = extras.peak[b] ?? 0
      this.onsets[at] = extras.onsets
      if (extras.spectrum) this.spectrum.set(extras.spectrum.slice(0, SPECTRUM_BANDS), at * SPECTRUM_BANDS)
    }
    this.head = (this.head + 1) % this.capacity
    this.size = Math.min(this.size + 1, this.capacity)
  }

  get length(): number {
    return this.size
  }

  /** The recorded ticks, oldest first, as new objects (for an export or a test, not every frame). `from` and `to` keep only ticks in that time range. */
  toTicks = (from = -Infinity, to = Infinity): SectionTick[] => {
    const start = (this.head - this.size + this.capacity) % this.capacity
    const ticks: SectionTick[] = []
    for (let i = 0; i < this.size; i++) {
      const at = (start + i) % this.capacity
      const t = this.times[at]!
      if (t < from || t > to) continue
      const bpm = this.bpm[at]!
      const tick: SectionTick = {
        t,
        power: Array.from(this.power.subarray(at * BANDS, at * BANDS + BANDS)),
        beats: this.beats[at]!,
        bpm: Number.isNaN(bpm) ? null : bpm,
      }
      const kind = this.extras[at]!
      if (kind > 0) {
        tick.peak = Array.from(this.peak.subarray(at * BANDS, at * BANDS + BANDS))
        tick.onsets = this.onsets[at]!
        if (kind === 2) tick.spectrum = Array.from(this.spectrum.subarray(at * SPECTRUM_BANDS, (at + 1) * SPECTRUM_BANDS))
      }
      ticks.push(tick)
    }
    return ticks
  }

  clear = (): void => {
    this.head = 0
    this.size = 0
  }
}
