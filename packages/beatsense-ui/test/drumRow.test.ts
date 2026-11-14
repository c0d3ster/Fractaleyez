import { describe, expect, it } from 'vitest'

import { DRUM_COLORS, drawDrumMark, drumMarkY, type MarkContext } from '../src/drumMarks'
import { WAVEFORM_H, WaveformTrack, waveformLayout, type WaveformContext, type WaveformView } from '../src/waveformTrack'

type Mark = { color: string; kind: 'path' | 'rect'; points: Array<[number, number]> }

// Records each filled shape: a path's points, or a rectangle's corner, with the color it was filled in.
const recorder = (): { ctx: WaveformContext; marks: Mark[] } => {
  const marks: Mark[] = []
  let points: Array<[number, number]> = []
  const noop = (): void => {}
  const ctx: WaveformContext = {
    clearRect: noop, rect: noop, closePath: noop, stroke: noop, fillText: noop, setLineDash: noop,
    fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '', textBaseline: 'alphabetic',
    beginPath: (): void => {
      points = []
    },
    moveTo: (x: number, y: number): void => {
      points.push([x, y])
    },
    lineTo: (x: number, y: number): void => {
      points.push([x, y])
    },
    fill: (): void => {
      marks.push({ color: String(ctx.fillStyle), kind: 'path', points })
    },
    fillRect: (x: number, y: number): void => {
      marks.push({ color: String(ctx.fillStyle), kind: 'rect', points: [[x, y]] })
    },
  }
  return { ctx, marks }
}

const view = (now: number): WaveformView => ({ now, viewMs: 6000, enabled: [true, false, false, true, false], ignoreMs: 0, mirrored: false })
const noHits = { kick: null, hat: null, snare: null, clap: null }

describe('the drum row layout', () => {
  it('takes its height from the waveform and sits under the hit strip', () => {
    const off = waveformLayout(false)
    const on = waveformLayout(true)
    expect(off.drumTop).toBeNull()
    expect(off.hitTop).toBe(WAVEFORM_H - 8)
    expect(on.hitTop).toBe(WAVEFORM_H - 14 - 8)
    expect(on.drumTop).toBe(WAVEFORM_H - 14)
    expect(on.plotBottom).toBeLessThan(on.hitTop)
    expect(on.plotH).toBe(off.plotH - 14)
    expect(on.mid).toBe(on.plotTop + on.plotH / 2)
  })
})

describe('the drum row', () => {
  it('marks each hit once, however many ticks see it, in its drum\'s color', () => {
    const track = new WaveformTrack({ drumRow: true })
    for (let tick = 0; tick < 5; tick++) track.recordDrums({ ...noHits, kick: 1000, hat: 1100 })
    track.recordDrums({ ...noHits, kick: 1500, hat: 1100, snare: 1500 })
    const { ctx, marks } = recorder()
    track.draw(ctx, view(2000))
    const drumMarks = marks.filter(({ color }) => Object.values(DRUM_COLORS).includes(color))
    expect(drumMarks.map(({ color }) => color).sort()).toEqual(
      [DRUM_COLORS.kick, DRUM_COLORS.kick, DRUM_COLORS.hat, DRUM_COLORS.snare].sort(),
    )
  })

  it('leaves out hits older than the view, and draws nothing with the row off', () => {
    const on = new WaveformTrack({ drumRow: true })
    on.recordDrums({ ...noHits, kick: 1000 })
    on.recordDrums({ ...noHits, kick: 9000 })
    const shown = recorder()
    on.draw(shown.ctx, view(10000))
    expect(shown.marks.filter(({ color }) => color === DRUM_COLORS.kick)).toHaveLength(1)

    const off = new WaveformTrack()
    off.recordDrums({ ...noHits, kick: 9000 })
    const hidden = recorder()
    off.draw(hidden.ctx, view(10000))
    expect(hidden.marks.filter(({ color }) => color === DRUM_COLORS.kick)).toHaveLength(0)
  })

  it('puts kick and snare lower than hat and clap, so hits on the same beat do not stack', () => {
    expect(drumMarkY('kick', 100, 14)).toBe(drumMarkY('snare', 100, 14))
    expect(drumMarkY('hat', 100, 14)).toBe(drumMarkY('clap', 100, 14))
    expect(drumMarkY('kick', 100, 14)).toBeGreaterThan(drumMarkY('hat', 100, 14))
  })

  it('gives each drum its own shape', () => {
    const { ctx, marks } = recorder()
    drawDrumMark(ctx as MarkContext, 'kick', 0, 0, 6)
    drawDrumMark(ctx as MarkContext, 'snare', 0, 0, 6)
    drawDrumMark(ctx as MarkContext, 'clap', 0, 0, 6)
    drawDrumMark(ctx as MarkContext, 'hat', 0, 0, 6)
    expect(marks.map(({ points }) => points.length)).toEqual([8, 4, 3, 4])
    // The square has its corners at the sides (x and y both off center), the diamond its points on the axes.
    expect(marks[1]!.points.every(([x, y]) => x !== 0 && y !== 0)).toBe(true)
    expect(marks[3]!.points.every(([x, y]) => x === 0 || y === 0)).toBe(true)
  })

  it('draws a mark as an outline in a given color', () => {
    let stroked = ''
    const { ctx, marks } = recorder()
    ctx.stroke = (): void => {
      stroked = String(ctx.strokeStyle)
    }
    drawDrumMark(ctx as MarkContext, 'hat', 0, 0, 6, '#333', 'outline')
    expect(stroked).toBe('#333')
    expect(marks).toHaveLength(0)
  })
})
