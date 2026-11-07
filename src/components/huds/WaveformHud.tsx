import React, { useEffect, useRef, useState } from 'react'
import { useInfo } from '../config/info/info'
import './WaveformHud.css'

import { DEFAULT_ENABLED_BANDS } from '../../audioanalysis/onset-bands'
import { subscribeUiTick } from '../../utils/uiTicker'
import { confidenceAlpha, WAVEFORM_H, WAVEFORM_W, WaveformTrack } from './waveformTrack'

// The visualizer lives in the main window; a popped-out config window reads it through window.opener.
const mainWindow = (): Window => window.opener ?? window

// The readout under the title: where in the phrase and bar the grid is, and how sure it is. Kept as numbers, so a tick that changes
// nothing builds no strings and sets no state.
type GridShown = { beatInBar: number; barInPhrase: number; downbeat: number; phrase: number } | null

const sameGrid = (a: GridShown, b: GridShown): boolean =>
  a === null || b === null
    ? a === b
    : a.beatInBar === b.beatInBar && a.barInPhrase === b.barInPhrase && a.downbeat === b.downbeat && a.phrase === b.phrase

const placeLabel = (grid: GridShown): string => {
  if (!grid) return '—'
  // An unsure downbeat makes the beat's place in the bar a guess, and the bar's place in the phrase more so: only what is known is shown.
  if (confidenceAlpha(grid.downbeat / 100) <= 0) return '…'
  if (confidenceAlpha(grid.phrase / 100) <= 0) return `?.${grid.beatInBar}`
  return `${grid.barInPhrase}.${grid.beatInBar}`
}

export const WaveformHud = (): React.ReactElement => {
  const info = useInfo()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [grid, setGrid] = useState<GridShown>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const track = new WaveformTrack()
    let shown: GridShown = null
    const draw = (): void => {
      const source = mainWindow()
      const timeline = source.getBeatTimeline?.()
      if (timeline) track.ingest(timeline.samples)
      const state = source.getBeatGrid?.() ?? null
      track.recordGrid(state)
      // The timeline's clock is the main window's, so "now" is read there too (a popped-out window has its own).
      track.draw(ctx, source.performance.now(), source.enabledFreqBands ?? DEFAULT_ENABLED_BANDS)

      const beatInBar = state?.beatInBar ?? 0
      const barInPhrase = state?.barInPhrase ?? 0
      const downbeat = state ? Math.round(state.downbeatConfidence * 100) : 0
      const phrase = state ? Math.round(state.phraseConfidence * 100) : 0
      const changed = shown === null
        ? state !== null
        : state === null || shown.beatInBar !== beatInBar || shown.barInPhrase !== barInPhrase || shown.downbeat !== downbeat || shown.phrase !== phrase
      if (!changed) return
      const next: GridShown = state ? { beatInBar, barInPhrase, downbeat, phrase } : null
      shown = next
      setGrid((previous) => (sameGrid(previous, next) ? previous : next))
    }

    return subscribeUiTick(draw, canvas)
  }, [])

  return (
    <div className='waveform-hud-wrapper'>
      <div className='waveform-hud-title-row'>
        <span className='waveform-hud-place' {...info('Bar of the 8-bar phrase, then beat of the bar: 3.2 is the second beat of the third bar. Only what the grid is sure of is shown: ? while it is still placing the phrase line, … while it is still placing beat 1.')}>
          {placeLabel(grid)}
        </span>
        <span className='waveform-hud-label'>Waveform</span>
        <span className='waveform-hud-confidence' {...info('How sure the grid is of beat 1 of the bar, then of the first bar of the 8-bar phrase. Bar and phrase lines fade in as these rise.')}>
          {grid ? `${grid.downbeat} · ${grid.phrase}%` : ''}
        </span>
      </div>
      <div className='waveform-hud' {...info('The last 16 seconds of each band, bass outermost and air innermost, in the Frequency HUD\'s colors; the bands that cannot set off a beat are dimmed. Ticks at the edges are beats, thin lines are bar lines and wide lines with a marker are 8-bar phrase lines. Bar and phrase lines only show once the grid is sure of them.')}>
        <canvas ref={canvasRef} width={WAVEFORM_W} height={WAVEFORM_H} className='waveform-hud-canvas' />
      </div>
    </div>
  )
}
