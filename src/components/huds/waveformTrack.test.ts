import { describe, expect, it } from 'vitest'
import type { GridState } from '../../audioanalysis/beat-grid'
import { WAVEFORM_H, WaveformContext, WaveformTrack } from './waveformTrack'

type Rect = { x: number; y: number; w: number; h: number; alpha: number }

// Records the solid rectangles the grid draws (fillRect), so the test can tell beat ticks, bar lines and phrase lines apart.
const recorder = (): { ctx: WaveformContext; rects: Rect[] } => {
  const rects: Rect[] = []
  const noop = (): void => {}
  const ctx = {
    clearRect: noop, beginPath: noop, rect: noop, fill: noop, moveTo: noop, lineTo: noop, closePath: noop, fillStyle: '', globalAlpha: 1,
    fillRect(x: number, y: number, w: number, h: number): void {
      rects.push({ x, y, w, h, alpha: this.globalAlpha })
    },
  }
  return { ctx, rects }
}

const state = (lastBeatMs: number, beatInBar: number, barInPhrase: number, confidence: number): GridState => ({
  beat: 1, beatInBar, barInPhrase, periodMs: 500, lastBeatMs, nextBeatMs: lastBeatMs + 500, downbeatConfidence: confidence, phraseConfidence: confidence,
})

describe('WaveformTrack', () => {
  it('draws a sure phrase line wide, a sure bar line thin, and an unsure one as a plain beat', () => {
    const track = new WaveformTrack()
    track.recordGrid(state(1000, 1, 1, 0.9))
    track.recordGrid(state(3000, 1, 2, 0.9))
    track.recordGrid(state(5000, 1, 1, 0.05))
    const { ctx, rects } = recorder()
    track.draw(ctx, 6000, [true, true, true, true, true])
    const full = rects.filter(({ h }) => h === WAVEFORM_H)
    expect(full.map(({ w }) => w).sort()).toEqual([1, 2])
    // Every beat has its two edge ticks, confident or not.
    expect(rects.filter(({ h }) => h < WAVEFORM_H)).toHaveLength(6)
  })

  it('records each beat once, however many ticks see it', () => {
    const track = new WaveformTrack()
    for (let i = 0; i < 5; i++) track.recordGrid(state(1000, 2, 1, 0.9))
    const { ctx, rects } = recorder()
    track.draw(ctx, 2000, [true, true, true, true, true])
    expect(rects).toHaveLength(2)
  })
})
