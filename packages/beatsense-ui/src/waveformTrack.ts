import { type BeatSample, DRUM_KINDS, type DrumKind, type GridState, ONSET_BANDS } from 'beatsense'
import { bandColor } from './bandColors'
import { drawDrumMark, drumMarkY } from './drumMarks'

// The Beat HUD's plot: a scrolling waveform of the five onset bands, with what each band had to pass to count as a hit, the hits
// themselves, and the beat grid along a ruler on top. Kept apart from the React component so the bench can time it on its own
// (scripts/section-eval/bench-cpu.mts). Everything is allocated once: a tick only writes into typed arrays and issues draw calls.

export const WAVEFORM_W = 360
export const WAVEFORM_H = 120
// How much is kept, and how much is shown: 6 s (three bars at dance tempos) unless zoomed, between MIN_VIEW_MS and the whole history.
export const WAVEFORM_HISTORY_MS = 16000
export const DEFAULT_VIEW_MS = 6000
export const MIN_VIEW_MS = 2000

const BANDS = ONSET_BANDS.length
// About a column per pixel at 4 s; zoomed in to 2 s, each column is two pixels wide.
const COLUMN_MS = 10
const COLUMNS = WAVEFORM_HISTORY_MS / COLUMN_MS
// A gap between samples longer than this is a real gap (the HUD was off screen, the tab was hidden), so it is left empty. A shorter one is
// a slow frame, and the sample is held across it so the waveform has no holes.
const HOLD_MS = 250
const RULER_H = 20
// Hits are marked on a strip along the bottom, so nothing cuts through the waveform but the grid's bar and phrase lines.
const HIT_STRIP_H = 8
// The drum row, when on, under the hit strip: a mark per drum the classifier calls (drumMarks.ts), taken from the waveform's height.
const DRUM_ROW_H = 14
const DRUM_MARK_SIZE = 6.5
const DRUM_CAPACITY = 256

/** Where each part of the plot sits, in the HUD's units, with the drum row or without it. */
export type WaveformLayout = {
  plotTop: number
  plotBottom: number
  plotH: number
  mid: number
  hitTop: number
  /** The drum row's top, or null when it is off. */
  drumTop: number | null
}

export const waveformLayout = (drumRow: boolean): WaveformLayout => {
  const drumH = drumRow ? DRUM_ROW_H : 0
  const plotTop = RULER_H + 2
  const hitTop = WAVEFORM_H - drumH - HIT_STRIP_H
  const plotBottom = hitTop - 2
  return {
    plotTop,
    plotBottom,
    plotH: plotBottom - plotTop,
    mid: plotTop + (plotBottom - plotTop) / 2,
    hitTop,
    drumTop: drumRow ? WAVEFORM_H - DRUM_ROW_H : null,
  }
}

export type WaveformOptions = {
  /** A row under the hit strip marking each drum the hit classifier calls (feed it with recordDrums). Off by default. */
  drumRow?: boolean
}
// A column is the band's level against its own recent loudness (as the Frequency HUD's bars are), so every band uses the full height.
const HEADROOM = 1.1
// The higher bands are drawn smaller and on top of the lower ones, so each band's color shows as its own layer rather than one hiding another.
const BAND_SCALE = ONSET_BANDS.map((_, band) => 1 - band * 0.11)
const ENABLED_FILLS = ONSET_BANDS.map((_, band) => bandColor(band, 58, 0.9))
const DISABLED_FILLS = ONSET_BANDS.map((_, band) => bandColor(band, 30, 0.35))
const HIT_COLORS = ONSET_BANDS.map((_, band) => bandColor(band, 62))
// Thresholds are faint and thin, there to check a hit against rather than to read at a glance.
const TRIGGER_COLORS = ONSET_BANDS.map((_, band) => bandColor(band, 88, 0.55))
const DASH = [4, 3]
const NO_DASH: number[] = []
const IGNORE_FILL = 'rgba(255, 255, 255, 0.07)'
const RULER_FILL = 'rgba(255, 255, 255, 0.07)'
const LINE_COLOR = '#fff'
const LABEL_COLOR = '#999'
const LABEL_FONT = '11px sans-serif'
const HIT_CAPACITY = 256

// The grid's lines are only drawn once the grid is fairly sure of them: below LOW they are not drawn as bar or phrase lines at all, and they
// fade in up to HIGH. Measured on synthetic 4/4 tracks, both confidences sit under 0.3 for the first bars and above 0.8 once locked.
const CONFIDENCE_LOW = 0.2
const CONFIDENCE_HIGH = 0.5
const BEAT_CAPACITY = 128
const BEAT_TICK_PX = 8
const PHRASE_MARK_PX = 7

export const confidenceAlpha = (confidence: number): number =>
  Math.max(0, Math.min(1, (confidence - CONFIDENCE_LOW) / (CONFIDENCE_HIGH - CONFIDENCE_LOW)))

// Bar of the phrase, then beat of the bar ("3.2"), made once: "?" while the phrase line is unsure, and nothing while beat 1 is.
const PLACE_LABELS = Array.from({ length: 8 }, (_, bar) => Array.from({ length: 4 }, (__, beat) => `${bar + 1}.${beat + 1}`))
const BEAT_ONLY_LABELS = Array.from({ length: 4 }, (_, beat) => `?.${beat + 1}`)

/** The canvas calls the track makes, so the bench can time them without a browser. */
export type WaveformContext = Pick<
  CanvasRenderingContext2D,
  | 'clearRect' | 'fillRect' | 'beginPath' | 'rect' | 'fill' | 'moveTo' | 'lineTo' | 'closePath' | 'stroke' | 'fillText'
  | 'setLineDash' | 'fillStyle' | 'strokeStyle' | 'lineWidth' | 'globalAlpha' | 'font' | 'textBaseline'
>

export type WaveformView = {
  now: number
  /** How much of the history is shown, ms. */
  viewMs: number
  /** Which bands can set off a beat: drawn in full color with their thresholds; the rest dimmed. */
  enabled: readonly boolean[]
  ignoreMs: number
  /** Mirrored around the middle, or growing up from the bottom (twice the height for the same level). */
  mirrored: boolean
}

export class WaveformTrack {
  private readonly layout: WaveformLayout
  // Per column and band (a ring indexed by the column's absolute number, time / COLUMN_MS): the level's peak and the threshold, both 0 to 1
  // of the band's loudness. A threshold of -1 is a column with no sample.
  private readonly peaks = new Float32Array(COLUMNS * BANDS)
  private readonly triggers = new Float32Array(COLUMNS * BANDS).fill(-1)
  private newestColumn = -1
  private readUpTo = -Infinity
  // The detector's hits: when, and which band set each off.
  private readonly hitTimes = new Float64Array(HIT_CAPACITY)
  private readonly hitBands = new Uint8Array(HIT_CAPACITY)
  private hitHead = 0
  private hitCount = 0
  // The beats the grid fired, as it saw them then: a ring of the last BEAT_CAPACITY.
  private readonly beatTimes = new Float64Array(BEAT_CAPACITY)
  private readonly beatInBar = new Uint8Array(BEAT_CAPACITY)
  private readonly barInPhrase = new Uint8Array(BEAT_CAPACITY)
  private readonly downbeatConfidence = new Float32Array(BEAT_CAPACITY)
  private readonly phraseConfidence = new Float32Array(BEAT_CAPACITY)
  private beatHead = 0
  private beatCount = 0
  private lastBeatMs = -Infinity
  private gridLocked = false
  // The drum classifier's hits: when, and which drum (its index in DRUM_KINDS); and the newest seen per drum, so each is kept once.
  private readonly drumTimes = new Float64Array(DRUM_CAPACITY)
  private readonly drumKinds = new Uint8Array(DRUM_CAPACITY)
  private readonly lastDrum = new Float64Array(DRUM_KINDS.length).fill(Number.NaN)
  private drumHead = 0
  private drumCount = 0

  constructor({ drumRow = false }: WaveformOptions = {}) {
    this.layout = waveformLayout(drumRow)
  }

  /** Folds in the timeline's samples newer than the last call. The samples are the monitor's own history, oldest first. */
  ingest = (samples: readonly BeatSample[]): void => {
    let from = samples.length
    while (from > 0 && samples[from - 1]!.t > this.readUpTo) from--
    for (let i = from; i < samples.length; i++) {
      const sample = samples[i]!
      const column = Math.floor(sample.t / COLUMN_MS)
      let fillFrom = column
      if (column > this.newestColumn) {
        const start = Math.max(this.newestColumn + 1, column - COLUMNS + 1)
        for (let c = start; c <= column; c++) this.clearColumn(c)
        if (this.newestColumn >= 0 && (column - this.newestColumn) * COLUMN_MS <= HOLD_MS) fillFrom = start
        this.newestColumn = column
      } else if (column <= this.newestColumn - COLUMNS) continue
      for (let c = fillFrom; c <= column; c++) this.writeColumn(c, sample)
      if (sample.beatBand !== null) this.recordHit(sample.t, sample.beatBand)
      else if (sample.rebandTo != null && this.hitCount > 0) this.hitBands[(this.hitHead - 1 + HIT_CAPACITY) % HIT_CAPACITY] = sample.rebandTo
      this.readUpTo = sample.t
    }
  }

  /** Records the grid's latest beat, once. The grid's state changes only when a beat lands, so a tick that sees the same beat again adds nothing. */
  recordGrid = (state: GridState | null): void => {
    this.gridLocked = state !== null
    if (!state || state.lastBeatMs === this.lastBeatMs) return
    this.lastBeatMs = state.lastBeatMs
    const at = this.beatHead
    this.beatTimes[at] = state.lastBeatMs
    this.beatInBar[at] = state.beatInBar
    this.barInPhrase[at] = state.barInPhrase
    this.downbeatConfidence[at] = state.downbeatConfidence
    this.phraseConfidence[at] = state.phraseConfidence
    this.beatHead = (at + 1) % BEAT_CAPACITY
    this.beatCount = Math.min(BEAT_CAPACITY, this.beatCount + 1)
  }

  /**
   * Records the drum classifier's newest hit per drum (DrumHits.getLastHits), each hit once however many ticks see it. Only drawn with the
   * drum row on.
   */
  recordDrums = (lastHits: Readonly<Record<DrumKind, number | null>> | null): void => {
    if (!lastHits) return
    DRUM_KINDS.forEach((kind, k) => {
      const t = lastHits[kind]
      if (t === null || t === this.lastDrum[k]) return
      this.lastDrum[k] = t
      this.drumTimes[this.drumHead] = t
      this.drumKinds[this.drumHead] = k
      this.drumHead = (this.drumHead + 1) % DRUM_CAPACITY
      this.drumCount = Math.min(DRUM_CAPACITY, this.drumCount + 1)
    })
  }

  draw = (ctx: WaveformContext, view: WaveformView): void => {
    ctx.clearRect(0, 0, WAVEFORM_W, WAVEFORM_H)
    this.drawIgnore(ctx, view)
    this.drawBands(ctx, view)
    this.drawTriggers(ctx, view)
    this.drawHits(ctx, view)
    this.drawDrums(ctx, view)
    this.drawGrid(ctx, view)
    this.drawPlace(ctx)
  }

  private clearColumn = (column: number): void => {
    const base = (column % COLUMNS) * BANDS
    this.peaks.fill(0, base, base + BANDS)
    this.triggers.fill(-1, base, base + BANDS)
  }

  private writeColumn = (column: number, { bands }: BeatSample): void => {
    const base = (column % COLUMNS) * BANDS
    for (let b = 0; b < BANDS; b++) {
      const band = bands[b]
      if (!band || band.loudness <= 0) continue
      const scale = band.loudness * HEADROOM
      const value = Math.min(1, band.level / scale)
      if (value > this.peaks[base + b]!) this.peaks[base + b] = value
      this.triggers[base + b] = Math.min(1, band.trigger / scale)
    }
  }

  private recordHit = (t: number, band: number): void => {
    this.hitTimes[this.hitHead] = t
    this.hitBands[this.hitHead] = band
    this.hitHead = (this.hitHead + 1) % HIT_CAPACITY
    this.hitCount = Math.min(HIT_CAPACITY, this.hitCount + 1)
  }

  // The newest hit is k = 0. Returns its ring slot, or -1 once past the visible stretch.
  private hitSlot = (k: number, now: number, viewMs: number): number => {
    if (k >= this.hitCount) return -1
    const at = (this.hitHead - 1 - k + HIT_CAPACITY) % HIT_CAPACITY
    return now - this.hitTimes[at]! > viewMs ? -1 : at
  }

  private toX = (t: number, { now, viewMs }: WaveformView): number => WAVEFORM_W - ((now - t) / viewMs) * WAVEFORM_W

  // How many columns are merged into one drawn bar, so a wide view never draws more bars than there are pixels.
  private step = ({ viewMs }: WaveformView): number => Math.max(1, Math.ceil(viewMs / WAVEFORM_W / COLUMN_MS))

  // The first drawn group, aligned to a multiple of the step so the groups do not shimmer as the strip scrolls.
  private firstGroup = (view: WaveformView, step: number): number => {
    const first = Math.max(this.newestColumn - COLUMNS + 1, Math.floor((view.now - view.viewMs) / COLUMN_MS), 0)
    return first - (first % step)
  }

  // Ignore Time after each hit: the detector is blind in this stretch, so a hit that lands in it is dropped.
  private drawIgnore = (ctx: WaveformContext, view: WaveformView): void => {
    const width = (view.ignoreMs / view.viewMs) * WAVEFORM_W
    ctx.fillStyle = IGNORE_FILL
    for (let k = 0, at = this.hitSlot(0, view.now, view.viewMs); at >= 0; at = this.hitSlot(++k, view.now, view.viewMs)) {
      const x = this.toX(this.hitTimes[at]!, view)
      ctx.fillRect(x, this.layout.plotTop, Math.min(WAVEFORM_W - x, width), this.layout.plotH)
    }
  }

  private drawBands = (ctx: WaveformContext, view: WaveformView): void => {
    if (this.newestColumn < 0) return
    const step = this.step(view)
    const first = this.firstGroup(view, step)
    const width = ((step * COLUMN_MS) / view.viewMs) * WAVEFORM_W
    const full = view.mirrored ? this.layout.plotH / 2 : this.layout.plotH
    for (let b = 0; b < BANDS; b++) {
      const scale = full * BAND_SCALE[b]!
      ctx.fillStyle = view.enabled[b] ? ENABLED_FILLS[b]! : DISABLED_FILLS[b]!
      // One fillRect per column, not one path of hundreds of rects filled at once: the browser rasterizes such a path as a single complex
      // shape, which in the large lab view stalled the page to a few frames a second. The bars sit side by side, so the picture is the same.
      for (let g = first; g <= this.newestColumn; g += step) {
        let peak = 0
        for (let c = g; c < g + step && c <= this.newestColumn; c++) peak = Math.max(peak, this.peaks[(c % COLUMNS) * BANDS + b]!)
        const h = peak * scale
        if (h < 0.5) continue
        const x = this.toX(g * COLUMN_MS, view)
        if (view.mirrored) ctx.fillRect(x, this.layout.mid - h, width, h * 2)
        else ctx.fillRect(x, this.layout.plotBottom - h, width, h)
      }
    }
  }

  // The dashed line is what each band that can set off a beat had to pass to count as a hit, on the same scale as its waveform.
  private drawTriggers = (ctx: WaveformContext, view: WaveformView): void => {
    if (this.newestColumn < 0) return
    const step = this.step(view)
    const first = this.firstGroup(view, step)
    const full = view.mirrored ? this.layout.plotH / 2 : this.layout.plotH
    const halfStep = ((step * COLUMN_MS) / view.viewMs) * WAVEFORM_W * 0.5
    for (let b = 0; b < BANDS; b++) {
      if (!view.enabled[b]) continue
      const scale = full * BAND_SCALE[b]!
      ctx.beginPath()
      for (let side = 0; side < (view.mirrored ? 2 : 1); side++) {
        let drawing = false
        for (let g = first; g <= this.newestColumn; g += step) {
          const trigger = this.triggers[(Math.min(g + step - 1, this.newestColumn) % COLUMNS) * BANDS + b]!
          if (trigger < 0) {
            drawing = false
            continue
          }
          const h = trigger * scale
          const y = view.mirrored ? (side === 0 ? this.layout.mid - h : this.layout.mid + h) : this.layout.plotBottom - h
          const x = this.toX(g * COLUMN_MS, view) + halfStep
          if (drawing) ctx.lineTo(x, y)
          else ctx.moveTo(x, y)
          drawing = true
        }
      }
      ctx.setLineDash(DASH)
      ctx.strokeStyle = TRIGGER_COLORS[b]!
      ctx.lineWidth = 1
      ctx.stroke()
    }
    ctx.setLineDash(NO_DASH)
  }

  // A hit is a mark on the bottom strip in the color of the band that set it off.
  private drawHits = (ctx: WaveformContext, view: WaveformView): void => {
    ctx.fillStyle = RULER_FILL
    const { hitTop } = this.layout
    ctx.fillRect(0, hitTop, WAVEFORM_W, HIT_STRIP_H)
    for (let k = 0, at = this.hitSlot(0, view.now, view.viewMs); at >= 0; at = this.hitSlot(++k, view.now, view.viewMs)) {
      ctx.fillStyle = HIT_COLORS[this.hitBands[at]!]!
      ctx.fillRect(Math.round(this.toX(this.hitTimes[at]!, view)) - 1, hitTop, 3, HIT_STRIP_H)
    }
  }

  // The drum row: each drum hit in the view as its mark (drumMarks.ts), newest drawn last so it sits on top.
  private drawDrums = (ctx: WaveformContext, view: WaveformView): void => {
    const { drumTop } = this.layout
    if (drumTop === null) return
    let visible = 0
    while (visible < this.drumCount) {
      const at = (this.drumHead - 1 - visible + DRUM_CAPACITY) % DRUM_CAPACITY
      if (view.now - this.drumTimes[at]! > view.viewMs) break
      visible++
    }
    for (let k = visible - 1; k >= 0; k--) {
      const at = (this.drumHead - 1 - k + DRUM_CAPACITY) % DRUM_CAPACITY
      const kind = DRUM_KINDS[this.drumKinds[at]!]!
      drawDrumMark(ctx, kind, this.toX(this.drumTimes[at]!, view), drumMarkY(kind, drumTop, DRUM_ROW_H), DRUM_MARK_SIZE)
    }
  }

  // The grid lives on the ruler along the top, so it never reads as a hit: beats are short ticks, bar lines tick the ruler's whole height with
  // a faint line down through the plot, and 8-bar phrase lines add a marker and a stronger line. A bar or phrase line fades with the grid's
  // confidence in it when it fired; below CONFIDENCE_LOW it is drawn as a plain beat, so an unsure grid only shows where the beats fall.
  private drawGrid = (ctx: WaveformContext, view: WaveformView): void => {
    ctx.fillStyle = RULER_FILL
    ctx.fillRect(0, 0, WAVEFORM_W, RULER_H)
    ctx.fillStyle = LINE_COLOR
    for (let k = 0; k < this.beatCount; k++) {
      const at = (this.beatHead - 1 - k + BEAT_CAPACITY) % BEAT_CAPACITY
      const age = view.now - this.beatTimes[at]!
      if (age > view.viewMs) break
      if (age < 0) continue
      const x = Math.round(this.toX(this.beatTimes[at]!, view))
      const bar = this.beatInBar[at] === 1 ? confidenceAlpha(this.downbeatConfidence[at]!) : 0
      const phrase = bar > 0 && this.barInPhrase[at] === 1 ? Math.min(bar, confidenceAlpha(this.phraseConfidence[at]!)) : 0
      ctx.globalAlpha = 0.55
      ctx.fillRect(x, 0, 1, BEAT_TICK_PX)
      if (phrase > 0) {
        ctx.globalAlpha = phrase
        ctx.beginPath()
        ctx.moveTo(x - PHRASE_MARK_PX, 0)
        ctx.lineTo(x + PHRASE_MARK_PX, 0)
        ctx.lineTo(x, RULER_H)
        ctx.closePath()
        ctx.fill()
        ctx.globalAlpha = 0.6 * phrase
        ctx.fillRect(x - 1, RULER_H, 2, this.layout.plotBottom - RULER_H)
      } else if (bar > 0) {
        ctx.globalAlpha = 0.85 * bar
        ctx.fillRect(x, 0, 1, RULER_H)
        ctx.globalAlpha = 0.22 * bar
        ctx.fillRect(x, RULER_H, 1, this.layout.plotBottom - RULER_H)
      }
    }
    ctx.globalAlpha = 1
  }

  // Where the grid has the music: bar of the phrase, then beat of the bar.
  private drawPlace = (ctx: WaveformContext): void => {
    const label = this.placeLabel()
    if (label === null) return
    ctx.fillStyle = LABEL_COLOR
    ctx.font = LABEL_FONT
    ctx.textBaseline = 'middle'
    ctx.fillText(label, 5, this.layout.plotTop + 8)
  }

  private placeLabel = (): string | null => {
    if (!this.gridLocked || this.beatCount === 0) return null
    const at = (this.beatHead - 1 + BEAT_CAPACITY) % BEAT_CAPACITY
    const beat = this.beatInBar[at]! - 1
    if (confidenceAlpha(this.downbeatConfidence[at]!) <= 0) return null
    if (confidenceAlpha(this.phraseConfidence[at]!) <= 0) return BEAT_ONLY_LABELS[beat] ?? null
    return PLACE_LABELS[this.barInPhrase[at]! - 1]?.[beat] ?? null
  }
}
