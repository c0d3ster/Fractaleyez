import type { BeatSample } from '../../audioanalysis/beat'
import type { GridState } from '../../audioanalysis/beat-grid'
import { ONSET_BANDS } from '../../audioanalysis/onset-bands'
import { bandColor } from './bandColors'

// The scrolling band waveform and the beat grid laid over it, kept apart from the React component so the bench can time it on its own
// (scripts/section-eval/bench-cpu.mts). Everything is allocated once: a tick only writes into typed arrays and issues draw calls.

export const WAVEFORM_W = 360
export const WAVEFORM_H = 80
// Long enough for a whole 8-bar phrase at any usual dance tempo (15 s at 128 BPM), so phrase lines come round on screen.
export const WAVEFORM_WINDOW_MS = 16000

const BANDS = ONSET_BANDS.length
const COLUMN_PX = 2
const COLUMNS = WAVEFORM_W / COLUMN_PX
const COLUMN_MS = WAVEFORM_WINDOW_MS / COLUMNS
const MID = WAVEFORM_H / 2
// The top and bottom margins are left clear for the beat ticks.
const BEAT_TICK_PX = 7
const HALF = MID - BEAT_TICK_PX - 2
// A column is the band's level against its own recent loudness (as the Frequency HUD's bars are), so every band uses the full height.
const HEADROOM = 1.1
// The higher bands are drawn smaller and on top of the lower ones, so each band's color shows as its own layer rather than one hiding another.
const BAND_SCALE = ONSET_BANDS.map((_, band) => 1 - band * 0.11)
const ENABLED_FILLS = ONSET_BANDS.map((_, band) => bandColor(band, 58, 0.9))
const DISABLED_FILLS = ONSET_BANDS.map((_, band) => bandColor(band, 30, 0.35))

// The grid's lines are only drawn once the grid is fairly sure of them: below LOW they are not drawn as bar or phrase lines at all, and they
// fade in up to HIGH. Measured on synthetic 4/4 tracks, both confidences sit under 0.3 for the first bars and above 0.8 once locked.
const CONFIDENCE_LOW = 0.2
const CONFIDENCE_HIGH = 0.5
const BEAT_CAPACITY = 128
const PHRASE_MARK_PX = 5

const LINE_COLOR = '#fff'

export const confidenceAlpha = (confidence: number): number =>
  Math.max(0, Math.min(1, (confidence - CONFIDENCE_LOW) / (CONFIDENCE_HIGH - CONFIDENCE_LOW)))

/** The few canvas calls the track makes, so the bench can count and time them without a browser. */
export type WaveformContext = Pick<
  CanvasRenderingContext2D,
  'clearRect' | 'fillRect' | 'beginPath' | 'rect' | 'fill' | 'moveTo' | 'lineTo' | 'closePath' | 'fillStyle' | 'globalAlpha'
>

export class WaveformTrack {
  // Each column's peak per band (0 to 1), a ring indexed by the column's absolute number (time / COLUMN_MS).
  private readonly peaks = new Float32Array(COLUMNS * BANDS)
  private newestColumn = -1
  private readUpTo = -Infinity
  // The beats the grid fired, as it saw them then: a ring of the last BEAT_CAPACITY.
  private readonly beatTimes = new Float64Array(BEAT_CAPACITY)
  private readonly beatInBar = new Uint8Array(BEAT_CAPACITY)
  private readonly barInPhrase = new Uint8Array(BEAT_CAPACITY)
  private readonly downbeatConfidence = new Float32Array(BEAT_CAPACITY)
  private readonly phraseConfidence = new Float32Array(BEAT_CAPACITY)
  private beatHead = 0
  private beatCount = 0
  private lastBeatMs = -Infinity

  /** Folds in the timeline's samples newer than the last call. The samples are the monitor's own history, oldest first. */
  ingest = (samples: readonly BeatSample[]): void => {
    let from = samples.length
    while (from > 0 && samples[from - 1]!.t > this.readUpTo) from--
    for (let i = from; i < samples.length; i++) {
      const { t, bands } = samples[i]!
      const column = Math.floor(t / COLUMN_MS)
      if (column > this.newestColumn) {
        // Columns skipped (the HUD was off screen, or the frame rate dropped) are cleared, so a gap reads as a gap and not as stale audio.
        for (let c = Math.max(this.newestColumn + 1, column - COLUMNS + 1); c <= column; c++) this.peaks.fill(0, (c % COLUMNS) * BANDS, (c % COLUMNS) * BANDS + BANDS)
        this.newestColumn = column
      } else if (column <= this.newestColumn - COLUMNS) continue
      const base = (column % COLUMNS) * BANDS
      for (let b = 0; b < BANDS; b++) {
        const band = bands[b]
        if (!band || band.loudness <= 0) continue
        const value = Math.min(1, band.level / (band.loudness * HEADROOM))
        if (value > this.peaks[base + b]!) this.peaks[base + b] = value
      }
      this.readUpTo = t
    }
  }

  /** Records the grid's latest beat, once. The grid's state changes only when a beat lands, so a tick that sees the same beat again adds nothing. */
  recordGrid = (state: GridState | null): void => {
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

  draw = (ctx: WaveformContext, now: number, enabled: readonly boolean[]): void => {
    ctx.clearRect(0, 0, WAVEFORM_W, WAVEFORM_H)
    this.drawBands(ctx, now, enabled)
    this.drawGrid(ctx, now)
  }

  private drawBands = (ctx: WaveformContext, now: number, enabled: readonly boolean[]): void => {
    if (this.newestColumn < 0) return
    // Column c covers [c, c + 1) * COLUMN_MS; its left edge sits where that time is on screen, so the strip scrolls smoothly between columns.
    const nowColumns = now / COLUMN_MS
    const oldest = Math.max(0, Math.ceil(nowColumns) - COLUMNS, this.newestColumn - COLUMNS + 1)
    for (let b = 0; b < BANDS; b++) {
      const scale = HALF * BAND_SCALE[b]!
      ctx.fillStyle = enabled[b] ? ENABLED_FILLS[b]! : DISABLED_FILLS[b]!
      ctx.beginPath()
      for (let c = oldest; c <= this.newestColumn; c++) {
        const h = this.peaks[(c % COLUMNS) * BANDS + b]! * scale
        if (h < 0.5) continue
        const x = WAVEFORM_W - (nowColumns - c) * COLUMN_PX
        ctx.rect(x, MID - h, COLUMN_PX, h * 2)
      }
      ctx.fill()
    }
  }

  // Beats are short ticks in the clear margins at the top and bottom, bars a thin line through the waveform, and 8-bar phrase lines a line twice as wide
  // with a marker on top. A bar or phrase line fades with the grid's confidence in it when it fired; below CONFIDENCE_LOW it is drawn as a
  // plain beat, so an unsure grid shows only where the beats fall.
  private drawGrid = (ctx: WaveformContext, now: number): void => {
    ctx.fillStyle = LINE_COLOR
    for (let k = 0; k < this.beatCount; k++) {
      const at = (this.beatHead - 1 - k + BEAT_CAPACITY) % BEAT_CAPACITY
      const age = now - this.beatTimes[at]!
      if (age > WAVEFORM_WINDOW_MS) break
      if (age < 0) continue
      const x = Math.round(WAVEFORM_W - (age / WAVEFORM_WINDOW_MS) * WAVEFORM_W)
      const bar = this.beatInBar[at] === 1 ? confidenceAlpha(this.downbeatConfidence[at]!) : 0
      const phrase = bar > 0 && this.barInPhrase[at] === 1 ? Math.min(bar, confidenceAlpha(this.phraseConfidence[at]!)) : 0
      ctx.globalAlpha = 0.5
      ctx.fillRect(x, 0, 1, BEAT_TICK_PX)
      ctx.fillRect(x, WAVEFORM_H - BEAT_TICK_PX, 1, BEAT_TICK_PX)
      if (phrase > 0) {
        ctx.globalAlpha = phrase
        ctx.fillRect(x - 1, 0, 2, WAVEFORM_H)
        ctx.beginPath()
        ctx.moveTo(x - PHRASE_MARK_PX, 0)
        ctx.lineTo(x + PHRASE_MARK_PX, 0)
        ctx.lineTo(x, PHRASE_MARK_PX + 1)
        ctx.closePath()
        ctx.fill()
      } else if (bar > 0) {
        ctx.globalAlpha = 0.75 * bar
        ctx.fillRect(x, 0, 1, WAVEFORM_H)
      }
    }
    ctx.globalAlpha = 1
  }
}
