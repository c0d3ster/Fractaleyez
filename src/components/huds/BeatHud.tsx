import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useInfo } from '../config/info/info'
import './BeatHud.css'

import { DEFAULT_ENABLED_BANDS } from '../../audioanalysis/onset-bands'
import { estimateTempo } from '../../audioanalysis/tempo'
import { subscribeUiTick } from '../../utils/uiTicker'
import { DEFAULT_VIEW_MS, WAVEFORM_H, WAVEFORM_W, WaveformTrack, WaveformView } from './waveformTrack'

// The tempo moves slowly, so it is re-read twice a second, and only drawn again when the number shown changes.
const TEMPO_UPDATE_INTERVAL_MS = 500
const MIRRORED_KEY = 'beatHudMirrored'
// The BPM comes from the tempo tracker (steady, read from the onset bands) and the consistency from the last 12 s of detected beats. The rhythm
// name comes held from the main window (RhythmLabeler, window.getRhythmLabel), so it is the same in a popped-out config window.
type TempoShown = { bpm: number | null; consistency: number | null }

const sameTempo = (a: TempoShown, b: TempoShown): boolean =>
  (a.bpm === null ? b.bpm === null : b.bpm !== null && Math.round(a.bpm) === Math.round(b.bpm)) &&
  (a.consistency === null ? b.consistency === null : b.consistency !== null && Math.round(a.consistency * 100) === Math.round(b.consistency * 100))

// The visualizer lives in the main window; a popped-out config window reads it through window.opener.
const mainWindow = (): Window => window.opener ?? window

// Storage can be blocked (a private window, cleared site data); the view then just starts unmirrored.
const readMirrored = (): boolean => {
  try {
    return window.localStorage.getItem(MIRRORED_KEY) === 'true'
  } catch {
    return false
  }
}

const saveMirrored = (mirrored: boolean): void => {
  try {
    window.localStorage.setItem(MIRRORED_KEY, String(mirrored))
  } catch {
    // Not saved; it still applies until the window closes.
  }
}

export const BeatHud = (): React.ReactElement => {
  const info = useInfo()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [tempo, setTempo] = useState<TempoShown>({ bpm: null, consistency: null })
  const [rhythm, setRhythm] = useState('')
  const mirroredRef = useRef(readMirrored())
  const redrawRef = useRef<(() => void) | null>(null)

  // A click switches between the mirrored view and the one growing up from the bottom, and draws it right away.
  const toggleMirrored = useCallback((): void => {
    mirroredRef.current = !mirroredRef.current
    saveMirrored(mirroredRef.current)
    redrawRef.current?.()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let lastTempoAt = 0
    const updateTempo = (source: Window): void => {
      const now = source.performance.now()
      if (now - lastTempoAt < TEMPO_UPDATE_INTERVAL_MS) return
      lastTempoAt = now
      const estimate = estimateTempo(source.getBeatTimes?.() ?? [])
      const next: TempoShown = { bpm: source.getTempo?.()?.bpm ?? null, consistency: estimate?.consistency ?? null }
      setTempo((previous) => (sameTempo(previous, next) ? previous : next))
      setRhythm(source.getRhythmLabel?.().text ?? '')
    }

    const track = new WaveformTrack()
    const view: WaveformView = { now: 0, viewMs: DEFAULT_VIEW_MS, enabled: DEFAULT_ENABLED_BANDS, ignoreMs: 0, mirrored: mirroredRef.current }
    const draw = (): void => {
      const source = mainWindow()
      updateTempo(source)
      const timeline = source.getBeatTimeline?.()
      if (timeline) track.ingest(timeline.samples)
      track.recordGrid(source.getBeatGrid?.() ?? null)
      // The timeline's clock is the main window's, so "now" is read there too (a popped-out window has its own).
      view.now = source.performance.now()
      view.enabled = source.enabledFreqBands ?? DEFAULT_ENABLED_BANDS
      view.ignoreMs = source.config.audio.ignoreTime.value
      view.mirrored = mirroredRef.current
      track.draw(ctx, view)
    }
    redrawRef.current = draw

    return subscribeUiTick(draw, canvas)
  }, [])

  return (
    <div className='beat-hud-wrapper'>
      <div className='beat-hud-title-row'>
        <span className='beat-hud-bpm' {...info('Tempo read from the last 12 seconds of the onset bands. It is held steady: it follows small drifts, changes only once a different tempo has clearly taken over for a couple of seconds, and holds through a breakdown with no beat.')}>
          {tempo.bpm !== null ? `${Math.round(tempo.bpm)} BPM` : '— BPM'}
        </span>
        <span className='beat-hud-label'>Beat</span>
        <span className='beat-hud-consistency' {...info('How steady the detected beats are: the share of gaps between them that are one beat (or one step of the rhythm grid) long, give or take 15%. Missed or extra beats lower it.')}>
          {tempo.consistency !== null ? `${Math.round(tempo.consistency * 100)}% cons` : '—'}
        </span>
      </div>
      <div className='beat-hud' {...info('The last 8 seconds of each band, bass outermost and air innermost; the bands that cannot set off a beat are dimmed. The dashed lines are what each band had to pass to count as a hit, and a colored line is a hit, in the color of the band that set it off. The ruler on top is the beat grid: short ticks are beats, tall ticks with a faint line are bar lines, and a marker with a stronger line is an 8-bar phrase line, shown once the grid is sure of them. The number is the bar of the phrase, then the beat of the bar. Click to switch between the mirrored view and the one growing up from the bottom.')}>
        <canvas ref={canvasRef} width={WAVEFORM_W} height={WAVEFORM_H} className='beat-hud-canvas' onClick={toggleMirrored} />
      </div>
      <span className='beat-hud-feel' {...info('The rhythm the drums play, read from the kick, snare and hat bands: a kick on every beat (four on the floor) or a broken kick (breakbeat), or, when it is sure, the drum and bass kick on 1 and the "and" of 3 (two-step), with the tempo range it is played at. It only names a rhythm it is sure of, so it is often blank: in a breakdown, without a clear beat, or for rhythms it cannot tell apart. A name shows after 2 seconds and clears after 3.')}>
        {rhythm}
      </span>
    </div>
  )
}
