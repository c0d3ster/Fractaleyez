/* eslint-disable max-classes-per-file */
// Causal features of the last couple of minutes of audio, one vector every 250 ms, for the section model (section-model.ts).
//
// The input is the five onset-band levels the app already measures every frame. They are pooled into 50 ms ticks first, so
// nothing here depends on the frame rate (30 fps on Saver, 120 on Quality), then into 250 ms slots. Every level is in dB
// against the song's own top level (the 90th percentile of its 2 s means over the last 90 s), so a quiet mic and a loud
// feed give the same numbers. What the features describe, per band:
//  - where the band sits now and over the last 8 s, against that top level (a break and a buildup pull the bass far under it)
//  - the step from a few seconds ago to now (a drop is the bass and the whole mix stepping back up)
//  - the trend over 8 and 16 s (a buildup climbs in the mids and highs, often while a filter sweep thins the bass)
//  - how much it pumps from tick to tick (a kick or sidechain pumping, gone in a break) and how often it jumps (snare rolls)
//  - the lowest it went in the last 15 s (a drop comes out of a dip)
// plus the beat rate, the song's age and how long since the bass was last full or last gone.

export const TICK_MS = 50
export const SLOT_MS = 250
const TICKS_PER_SLOT = SLOT_MS / TICK_MS
const BANDS = 5
// Two minutes of slots and the last few seconds of ticks are all the features look at.
const SLOT_CAPACITY = 480
const TICK_CAPACITY = 64
const PEAK_REF_SLOTS = 360
const PEAK_BOX_SLOTS = 8
const PEAK_PERCENTILE = 0.9
const FLOOR_POWER = 1e-6
const BASS_FULL_DB = -3
const BASS_GONE_DB = -10
const SINCE_CAP_S = 60
const AGE_CAP_S = 240
const RECENT_SINCE_SLOTS = 12
// Silence: the whole mix this far under the song's top level (a paused player, the gap between two songs, a stop before a drop),
// or under an absolute floor for a feed that is digitally silent. Quiet is the same with a shallower line, for a fade into a mic's noise floor.
const SILENCE_DB = -30
const QUIET_DB = -15
const SILENCE_FLOOR_DB = -30
const RUN_CAP_S = 10
// The song's usual band shape (each band against the mean of the five) follows the music this slowly, and holds still in silence.
const SHAPE_TAU_SLOTS = 120

export const FEATURE_NAMES: readonly string[] = [
  ...['rel2', 'rel8', 'step', 'slope8', 'slope16', 'pump', 'flux', 'fluxSlope', 'min15', 'rel05', 'jump', 'recover'].flatMap((name) =>
    ['bass', 'lo', 'mid', 'hi', 'air'].map((band) => `${name}_${band}`)),
  'relTotal', 'stepTotal', 'beats2', 'beats8', 'beatTrend', 'age', 'sinceBassFull', 'sinceBassGone', 'tilt', 'tiltSlope',
  'pumpReturn_bass', 'pumpReturn_lo', 'beatReturn', 'gap4', 'bassOutJustEnded', 'bassInJustEnded',
  'silenceNow', 'silenceLast', 'sinceSilence', 'quietNow', 'quietLast', 'sinceQuiet', 'levelBeforeQuiet', 'shapeShift', 'shapeShiftNow',
]
export const FEATURE_COUNT = FEATURE_NAMES.length
const SINCE_BASS_FULL = FEATURE_NAMES.indexOf('sinceBassFull')
const SINCE_BASS_GONE = FEATURE_NAMES.indexOf('sinceBassGone')

const toDb = (power: number): number => 10 * Math.log10(Math.max(power, FLOOR_POWER))

// Slope (per step) of a least-squares line through evenly spaced values.
const slopeOf = (values: readonly number[]): number => {
  const n = values.length
  const meanX = (n - 1) / 2
  let meanY = 0
  for (const v of values) meanY += v / n
  let sxy = 0
  let sxx = 0
  values.forEach((y, x) => {
    sxy += (x - meanX) * (y - meanY)
    sxx += (x - meanX) ** 2
  })
  return sxx === 0 ? 0 : sxy / sxx
}

/** Fixed-size ring of numbers, newest last. */
class Ring {
  private readonly data: Float64Array
  private head = 0
  size = 0

  constructor(readonly capacity: number) {
    this.data = new Float64Array(capacity)
  }

  push = (value: number): void => {
    this.data[this.head] = value
    this.head = (this.head + 1) % this.capacity
    this.size = Math.min(this.size + 1, this.capacity)
  }

  /** The value `back` steps before the newest (0 is the newest). */
  at = (back: number): number => this.data[(this.head - 1 - back + this.capacity * 2) % this.capacity] ?? 0

  clear = (): void => {
    this.head = 0
    this.size = 0
  }
}

/** Runs of slots where something holds (silence, quiet): how long the current one has lasted, how long the last one lasted, and how long since it ended, in seconds. */
class RunTracker {
  now = 0
  last = 0
  since = RUN_CAP_S

  step = (holds: boolean): void => {
    if (holds) {
      this.now = Math.min(RUN_CAP_S, this.now + SLOT_MS / 1000)
      return
    }
    if (this.now > 0) {
      this.last = this.now
      this.since = 0
      this.now = 0
      return
    }
    this.since = Math.min(RUN_CAP_S, this.since + SLOT_MS / 1000)
    if (this.since >= RUN_CAP_S) this.last = 0
  }

  clear = (): void => {
    this.now = 0
    this.last = 0
    this.since = RUN_CAP_S
  }
}

export class SectionFeatures {
  // Per tick: mean power per band. Per slot: mean power per band, tick-to-tick pumping and jumps per band, beats.
  private readonly tickPower = Array.from({ length: BANDS }, () => new Ring(TICK_CAPACITY))
  private readonly slotPower = Array.from({ length: BANDS }, () => new Ring(SLOT_CAPACITY))
  private readonly slotPump = Array.from({ length: BANDS }, () => new Ring(SLOT_CAPACITY))
  private readonly slotFlux = Array.from({ length: BANDS }, () => new Ring(SLOT_CAPACITY))
  private readonly slotBeats = new Ring(SLOT_CAPACITY)
  private readonly sums = new Float64Array(BANDS)
  private readonly lastTickDb = new Float64Array(BANDS)
  private readonly pumpSums = new Float64Array(BANDS)
  private readonly pumpSquares = new Float64Array(BANDS)
  private readonly fluxSums = new Float64Array(BANDS)
  private frames = 0
  private beatsInTick = 0
  private readonly tickInput = new Float64Array(BANDS)
  private readonly lastTick = new Float64Array(BANDS)
  private lastTickBeats = 0
  private ticksInSlot = 0
  /** How many ticks have been added since the start (or the last reset). */
  ticks = 0
  private beatsInSlot = 0
  private tickStart: number | null = null
  private slots = 0
  private lastBassFull = 0
  private lastBassGone = 0
  // The last few values of how long the bass had been out (or in): the moment it comes back, that length is what tells a drop from a fill.
  private readonly recentBassOut = new Ring(RECENT_SINCE_SLOTS)
  private readonly recentBassIn = new Ring(RECENT_SINCE_SLOTS)
  private readonly silence = new RunTracker()
  private readonly quiet = new RunTracker()
  private levelBeforeQuiet = 0
  private readonly usualShape = new Float64Array(BANDS)
  private readonly shapeBefore = new Float64Array(BANDS)
  private shapeSlots = 0
  private readonly features = new Float64Array(FEATURE_COUNT)
  private readonly scratch: number[] = []

  /** Adds one frame. Returns the feature vector when a 250 ms slot closes (the same array every time: read it before the next push), otherwise null. */
  push = (t: number, levels: readonly number[], beat: boolean): Float64Array | null => {
    this.tickStart ??= t
    for (let b = 0; b < BANDS; b++) this.sums[b]! += (levels[b] ?? 0) ** 2
    this.frames++
    if (beat) this.beatsInTick++
    if (t - this.tickStart < TICK_MS) return null
    this.tickStart = t
    const frames = Math.max(this.frames, 1)
    for (let b = 0; b < BANDS; b++) this.tickInput[b] = this.sums[b]! / frames
    const beats = this.beatsInTick
    this.sums.fill(0)
    this.frames = 0
    this.beatsInTick = 0
    return this.tick(this.tickInput, beats)
  }

  /** Adds one 50 ms tick directly (mean power per band, beats in it): what `push` does once a tick of frames is in, and how a recorded session is replayed. */
  tick = (power: ArrayLike<number>, beats: number): Float64Array | null => {
    this.ticks++
    for (let b = 0; b < BANDS; b++) this.lastTick[b] = power[b] ?? 0
    this.lastTickBeats = beats
    this.closeTick(power)
    this.beatsInSlot += beats
    if (this.ticksInSlot < TICKS_PER_SLOT) return null
    this.closeSlot()
    return this.compute()
  }

  /** The tick that was just added, for recording a session. */
  getLastTick = (): { power: Float64Array; beats: number } => ({ power: this.lastTick, beats: this.lastTickBeats })

  /** Forgets everything (a new song after silence: the old song's levels say nothing about the new one). */
  reset = (): void => {
    for (const rings of [this.tickPower, this.slotPower, this.slotPump, this.slotFlux]) rings.forEach((ring) => ring.clear())
    this.slotBeats.clear()
    this.sums.fill(0)
    this.pumpSums.fill(0)
    this.pumpSquares.fill(0)
    this.fluxSums.fill(0)
    this.frames = 0
    this.beatsInTick = 0
    this.ticksInSlot = 0
    this.ticks = 0
    this.beatsInSlot = 0
    this.tickStart = null
    this.slots = 0
    this.lastBassFull = 0
    this.lastBassGone = 0
    this.recentBassOut.clear()
    this.recentBassIn.clear()
    this.silence.clear()
    this.quiet.clear()
    this.levelBeforeQuiet = 0
    this.usualShape.fill(0)
    this.shapeBefore.fill(0)
    this.shapeSlots = 0
  }

  private closeTick = (input: ArrayLike<number>): void => {
    for (let b = 0; b < BANDS; b++) {
      const power = input[b] ?? 0
      const db = toDb(power)
      this.tickPower[b]!.push(power)
      this.pumpSums[b]! += db
      this.pumpSquares[b]! += db * db
      if (this.tickPower[b]!.size > 1) this.fluxSums[b]! += Math.max(0, db - this.lastTickDb[b]!)
      this.lastTickDb[b] = db
    }
    this.ticksInSlot++
  }

  private closeSlot = (): void => {
    const n = this.ticksInSlot
    for (let b = 0; b < BANDS; b++) {
      let power = 0
      for (let k = 0; k < n; k++) power += this.tickPower[b]!.at(k) / n
      this.slotPower[b]!.push(power)
      const mean = this.pumpSums[b]! / n
      this.slotPump[b]!.push(Math.sqrt(Math.max(0, this.pumpSquares[b]! / n - mean * mean)))
      this.slotFlux[b]!.push(this.fluxSums[b]! / n)
    }
    this.slotBeats.push(this.beatsInSlot)
    this.pumpSums.fill(0)
    this.pumpSquares.fill(0)
    this.fluxSums.fill(0)
    this.ticksInSlot = 0
    this.beatsInSlot = 0
    this.slots++
  }

  // Mean of a ring over the slots `from` to `to` back (inclusive start, exclusive end), clipped to what there is.
  private meanOf = (ring: Ring, from: number, to: number): number => {
    const end = Math.min(to, ring.size)
    if (end <= from) return ring.size > 0 ? ring.at(Math.min(from, ring.size - 1)) : 0
    let sum = 0
    for (let k = from; k < end; k++) sum += ring.at(k)
    return sum / (end - from)
  }

  // The five bands over the last 2 s, each against their mean: what the mix sounds like, whatever its loudness.
  private shapeNow = (): number[] => {
    const db = Array.from({ length: BANDS }, (_, b) => this.levelDb(b, 0, 8))
    const mean = db.reduce((sum, v) => sum + v, 0) / BANDS
    return db.map((v) => v - mean)
  }

  private maxOf = (ring: Ring): number => {
    let highest = 0
    for (let k = 0; k < ring.size; k++) highest = Math.max(highest, ring.at(k))
    return highest
  }

  private levelDb = (band: number, from: number, to: number): number => toDb(this.meanOf(this.slotPower[band]!, from, to))

  // The band's top level: the 90th percentile of its 2 s means over the last 90 s.
  private peakDb = (band: number): number => {
    const ring = this.slotPower[band]!
    const n = Math.min(ring.size, PEAK_REF_SLOTS)
    const box = Math.min(PEAK_BOX_SLOTS, n)
    const values = this.scratch
    values.length = 0
    let sum = 0
    for (let k = 0; k < n; k++) {
      sum += ring.at(k)
      if (k >= box) sum -= ring.at(k - box)
      if (k >= box - 1) values.push(sum / box)
    }
    if (values.length === 0) return toDb(0)
    values.sort((x, y) => x - y)
    return toDb(values[Math.min(values.length - 1, Math.floor(values.length * PEAK_PERCENTILE))]!)
  }

  private compute = (): Float64Array => {
    const f = this.features
    const peaks: number[] = []
    let i = 0
    for (let b = 0; b < BANDS; b++) peaks.push(this.peakDb(b))
    const perBand = (value: (b: number) => number): void => {
      for (let b = 0; b < BANDS; b++) f[i++] = value(b)
    }
    const seconds = (b: number, count: number, width: number): number[] =>
      Array.from({ length: count }, (_, s) => this.levelDb(b, (count - 1 - s) * width * 4, (count - s) * width * 4))

    perBand((b) => this.levelDb(b, 0, 8) - peaks[b]!)
    perBand((b) => this.levelDb(b, 0, 32) - peaks[b]!)
    perBand((b) => this.levelDb(b, 0, 4) - this.levelDb(b, 6, 20))
    perBand((b) => slopeOf(seconds(b, 8, 1)))
    perBand((b) => slopeOf(seconds(b, 8, 2)) / 2)
    perBand((b) => this.meanOf(this.slotPump[b]!, 0, 8))
    perBand((b) => this.meanOf(this.slotFlux[b]!, 0, 8))
    perBand((b) => slopeOf(Array.from({ length: 8 }, (_, s) => this.meanOf(this.slotFlux[b]!, (7 - s) * 4, (8 - s) * 4))))
    perBand((b) => {
      let lowest = Infinity
      for (let s = 0; s < 15; s++) lowest = Math.min(lowest, this.levelDb(b, s * 4, s * 4 + 4))
      return lowest - peaks[b]!
    })
    // The last half second: a drop lands in it, often straight out of a short stop that a longer window would average in.
    perBand((b) => this.levelDb(b, 0, 2) - peaks[b]!)
    perBand((b) => this.levelDb(b, 0, 2) - this.levelDb(b, 2, 10))
    perBand((b) => {
      let lowest = Infinity
      for (let s = 2; s < 16; s += 2) lowest = Math.min(lowest, this.levelDb(b, s, s + 2))
      return this.levelDb(b, 0, 2) - lowest
    })

    // The whole mix, as the sum of the bands' power.
    const total = (from: number, to: number): number => {
      let power = 0
      for (let b = 0; b < BANDS; b++) power += this.meanOf(this.slotPower[b]!, from, to)
      return toDb(power)
    }
    let peakTotal = 0
    for (let b = 0; b < BANDS; b++) peakTotal += 10 ** (peaks[b]! / 10)
    f[i++] = total(0, 8) - toDb(peakTotal)
    f[i++] = total(0, 4) - total(6, 20)

    const beats2 = this.meanOf(this.slotBeats, 0, 8) * 4
    const beats8 = this.meanOf(this.slotBeats, 0, 32) * 4
    f[i++] = beats2
    f[i++] = beats8
    f[i++] = beats2 - this.meanOf(this.slotBeats, 32, 64) * 4
    f[i++] = Math.min(AGE_CAP_S, this.slots / 4)

    const bassRel = f[0]!
    if (bassRel >= BASS_FULL_DB) this.lastBassFull = this.slots
    if (bassRel <= BASS_GONE_DB) this.lastBassGone = this.slots
    f[i++] = Math.min(SINCE_CAP_S, (this.slots - this.lastBassFull) / 4)
    f[i++] = Math.min(SINCE_CAP_S, (this.slots - this.lastBassGone) / 4)

    // Tilt: the highs against the lows, against how they usually sit in this song. Buildups tilt bright.
    const tilt = (from: number, to: number): number =>
      (this.levelDb(3, from, to) + this.levelDb(4, from, to)) / 2 - (this.levelDb(0, from, to) + this.levelDb(1, from, to)) / 2
    const usualTilt = (peaks[3]! + peaks[4]!) / 2 - (peaks[0]! + peaks[1]!) / 2
    f[i++] = tilt(0, 8) - usualTilt
    f[i++] = slopeOf(Array.from({ length: 8 }, (_, s) => tilt((7 - s) * 4, (8 - s) * 4)))

    // The kick coming back: the low bands pumping and the beats returning, now against a few seconds ago.
    f[i++] = this.meanOf(this.slotPump[0]!, 0, 4) - this.meanOf(this.slotPump[0]!, 8, 24)
    f[i++] = this.meanOf(this.slotPump[1]!, 0, 4) - this.meanOf(this.slotPump[1]!, 8, 24)
    f[i++] = (this.meanOf(this.slotBeats, 0, 4) - this.meanOf(this.slotBeats, 8, 24)) * 4
    // How deep the quietest slot of the last 4 s went (a stop before a drop, or the gap between songs).
    let gap = Infinity
    for (let s = 0; s < 16; s++) {
      let power = 0
      for (let b = 0; b < BANDS; b++) power += this.slotPower[b]!.size > s ? this.slotPower[b]!.at(s) : 0
      gap = Math.min(gap, toDb(power))
    }
    f[i++] = gap - toDb(peakTotal)

    this.recentBassOut.push(f[SINCE_BASS_FULL]!)
    this.recentBassIn.push(f[SINCE_BASS_GONE]!)
    f[i++] = this.maxOf(this.recentBassOut)
    f[i++] = this.maxOf(this.recentBassIn)

    // Song boundaries: how long the music has been (or just was) silent or quiet, how faded it was going in, and how different it sounds now
    // from how this song usually sounded before the gap. A stop inside a song comes back sounding like the song; the next song does not.
    const slotDb = toDb(this.slotPower.reduce((sum, ring) => sum + ring.at(0), 0))
    const rel = slotDb - toDb(peakTotal)
    const quietBefore = this.quiet.now > 0
    this.silence.step(rel <= SILENCE_DB || slotDb <= SILENCE_FLOOR_DB)
    this.quiet.step(rel <= QUIET_DB || slotDb <= SILENCE_FLOOR_DB)
    if (this.quiet.now > 0 && !quietBefore) {
      this.levelBeforeQuiet = total(4, 36) - toDb(peakTotal)
      this.shapeBefore.set(this.usualShape)
    }
    const shape = this.shapeNow()
    if (this.quiet.now === 0) {
      this.shapeSlots++
      const rate = 1 / Math.min(this.shapeSlots, SHAPE_TAU_SLOTS)
      for (let b = 0; b < BANDS; b++) this.usualShape[b]! += (shape[b]! - this.usualShape[b]!) * rate
    }
    const distance = (reference: Float64Array): number => {
      let sum = 0
      for (let b = 0; b < BANDS; b++) sum += (shape[b]! - reference[b]!) ** 2
      return Math.sqrt(sum / BANDS)
    }
    f[i++] = this.silence.now
    f[i++] = this.silence.last
    f[i++] = this.silence.since
    f[i++] = this.quiet.now
    f[i++] = this.quiet.last
    f[i++] = this.quiet.since
    f[i++] = this.quiet.since < RUN_CAP_S || this.quiet.now > 0 ? this.levelBeforeQuiet : 0
    f[i++] = this.quiet.since < RUN_CAP_S && this.shapeSlots > 0 ? distance(this.shapeBefore) : 0
    f[i++] = distance(this.usualShape)
    return f
  }
}
