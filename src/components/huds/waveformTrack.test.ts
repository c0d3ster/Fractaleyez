import { describe, expect, it } from 'vitest'
import type { BeatSample } from '../../audioanalysis/beat'
import type { GridState } from '../../audioanalysis/beat-grid'
import { WAVEFORM_H, WaveformContext, WaveformTrack, WaveformView } from './waveformTrack'

type Rect = { x: number; y: number; w: number; h: number; alpha: number; fill: string }

// Records the solid rectangles the track draws (fillRect), so the test can tell grid lines, hits and the ruler apart.
const recorder = (): { ctx: WaveformContext; rects: Rect[]; strokes: () => number } => {
  const rects: Rect[] = []
  let strokes = 0
  const noop = (): void => {}
  const ctx: WaveformContext = {
    clearRect: noop, beginPath: noop, rect: noop, fill: noop, moveTo: noop, lineTo: noop, closePath: noop, arc: noop, fillText: noop, setLineDash: noop,
    fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '', textBaseline: 'alphabetic',
    stroke: (): void => {
      strokes++
    },
    fillRect: (x: number, y: number, w: number, h: number): void => {
      rects.push({ x, y, w, h, alpha: ctx.globalAlpha, fill: String(ctx.fillStyle) })
    },
  }
  return { ctx, rects, strokes: (): number => strokes }
}

const view = (now: number, enabled = [true, false, false, true, false]): WaveformView => ({ now, viewMs: 8000, enabled, ignoreMs: 0, mirrored: false })

const state = (lastBeatMs: number, beatInBar: number, barInPhrase: number, confidence: number): GridState => ({
  beat: 1, beatInBar, barInPhrase, periodMs: 500, lastBeatMs, nextBeatMs: lastBeatMs + 500, downbeatConfidence: confidence, phraseConfidence: confidence,
})

const sample = (t: number, beatBand: number | null = null): BeatSample => ({
  t,
  bands: Array.from({ length: 5 }, () => ({ level: 2, loudness: 4, trigger: 3 })),
  beatBand,
})

// Everything the grid draws below the ruler is a full-height line from its bottom edge to the plot's bottom.
const gridLines = (rects: Rect[]): Rect[] => rects.filter(({ y, h, fill }) => fill === '#fff' && y > 0 && y + h === WAVEFORM_H)

describe('WaveformTrack', () => {
  it('draws a sure phrase line wide, a sure bar line thin, and an unsure one as a plain beat', () => {
    const track = new WaveformTrack()
    track.recordGrid(state(1000, 1, 1, 0.9))
    track.recordGrid(state(3000, 1, 2, 0.9))
    track.recordGrid(state(5000, 1, 1, 0.05))
    const { ctx, rects } = recorder()
    track.draw(ctx, view(6000))
    expect(gridLines(rects).map(({ w }) => w).sort()).toEqual([1, 2])
    // Every beat has its tick on the ruler, confident or not.
    expect(rects.filter(({ y, h, w }) => y === 0 && h === 4 && w === 1)).toHaveLength(3)
  })

  it('records each beat once, however many ticks see it', () => {
    const track = new WaveformTrack()
    for (let i = 0; i < 5; i++) track.recordGrid(state(1000, 2, 1, 0.9))
    const { ctx, rects } = recorder()
    track.draw(ctx, view(2000))
    expect(rects.filter(({ y, h }) => y === 0 && h === 4)).toHaveLength(1)
  })

  it('draws each hit once in its band color, and thresholds only for the bands that can trigger', () => {
    const track = new WaveformTrack()
    const samples = [sample(1000), sample(1016, 3), sample(1033)]
    track.ingest(samples)
    // A second read of the same history adds nothing.
    track.ingest(samples)
    const { ctx, rects, strokes } = recorder()
    track.draw(ctx, view(1100))
    const hits = rects.filter(({ w, fill }) => w === 1.5 && fill.startsWith('hsla'))
    expect(hits).toHaveLength(1)
    // Two enabled bands, each a dark edge and the dashed line over it.
    expect(strokes()).toBe(4)
  })
})
