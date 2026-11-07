import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useInfo } from '../config/info/info'
import './BeatHud.css'

import { DEFAULT_ENABLED_BANDS, ONSET_BANDS } from '../../audioanalysis/onset-bands'
import { estimateTempo } from '../../audioanalysis/tempo'
import { subscribeUiTick } from '../../utils/uiTicker'
import { bandColor } from './bandColors'
import { DEFAULT_VIEW_MS, MIN_VIEW_MS, WAVEFORM_H, WAVEFORM_HISTORY_MS, WAVEFORM_W, WaveformTrack, WaveformView } from './waveformTrack'

// The tempo moves slowly, so it is re-read twice a second, and only drawn again when the number shown changes.
const TEMPO_UPDATE_INTERVAL_MS = 500
const MIRRORED_KEY = 'beatHudMirrored'
// How far one notch of the wheel zooms (a notch is a deltaY of about 100): about 20%.
const ZOOM_PER_DELTA = 0.002
// A click waits this long before switching the view, so the two clicks of a double-click (which resets the zoom) do not switch it twice.
const CLICK_DELAY_MS = 250
// On a hit the Beat title glows in the color of the band that set it off, fading in a few steps. The styles are made once per band and step,
// and set on the element directly, so a hit does not re-render anything.
const GLOW_STEPS = 4
type GlowStyle = { color: string; textShadow: string }
const GLOW_STYLES: GlowStyle[][] = ONSET_BANDS.map((_, band) =>
  Array.from({ length: GLOW_STEPS + 1 }, (__, step) => ({
    color: step === 0 ? '' : bandColor(band, 50, 0.4 + (0.6 * step) / GLOW_STEPS),
    textShadow: step === 0 ? '' : `0 0 ${2 + 2 * step}px ${bandColor(band, 60, step / GLOW_STEPS)}`,
  })))

// The BPM comes from the tempo tracker (steady, read from the onset bands) and the consistency from the last 12 s of detected beats. The rhythm
// name comes held from the main window (RhythmLabeler, window.getRhythmLabel), so it is the same in a popped-out config window.
type TempoShown = { bpm: number | null; consistency: number | null }

const sameTempo = (a: TempoShown, b: TempoShown): boolean =>
  (a.bpm === null ? b.bpm === null : b.bpm !== null && Math.round(a.bpm) === Math.round(b.bpm)) &&
  (a.consistency === null ? b.consistency === null : b.consistency !== null && Math.round(a.consistency * 100) === Math.round(b.consistency * 100))

// The visualizer lives in the main window; a popped-out config window reads it through window.opener.
const mainWindow = (): Window => window.opener ?? window

// Storage can be blocked (a private window, cleared site data); the view then just starts mirrored.
const readMirrored = (): boolean => {
  try {
    return window.localStorage.getItem(MIRRORED_KEY) !== 'false'
  } catch {
    return true
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
  const viewMsRef = useRef(DEFAULT_VIEW_MS)
  const redrawRef = useRef<(() => void) | null>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // A click switches between the mirrored view and the one growing up from the bottom, and draws it right away.
  const handleClick = useCallback((): void => {
    if (clickTimerRef.current !== null) clearTimeout(clickTimerRef.current)
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null
      mirroredRef.current = !mirroredRef.current
      saveMirrored(mirroredRef.current)
      redrawRef.current?.()
    }, CLICK_DELAY_MS)
  }, [])

  // A double-click puts the zoom back to the default, and cancels the click that came with it.
  const handleDoubleClick = useCallback((): void => {
    if (clickTimerRef.current !== null) clearTimeout(clickTimerRef.current)
    clickTimerRef.current = null
    viewMsRef.current = DEFAULT_VIEW_MS
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
    let glowStep = 0
    let glowBand = 0
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
      view.viewMs = viewMsRef.current
      track.draw(ctx, view)

      const step = Math.ceil(track.glow(view.now) * GLOW_STEPS)
      const band = track.glowBand()
      const label = labelRef.current
      if (!label || (step === glowStep && (step === 0 || band === glowBand))) return
      glowStep = step
      glowBand = band
      const style = GLOW_STYLES[band]?.[step]
      label.style.color = style?.color ?? ''
      label.style.textShadow = style?.textShadow ?? ''
    }
    redrawRef.current = draw

    // The wheel zooms the time shown. It is a native listener, not React's onWheel, which is passive and so cannot stop the column scrolling.
    const zoom = (event: WheelEvent): void => {
      event.preventDefault()
      viewMsRef.current = Math.min(WAVEFORM_HISTORY_MS, Math.max(MIN_VIEW_MS, viewMsRef.current * Math.exp(event.deltaY * ZOOM_PER_DELTA)))
      draw()
    }
    canvas.addEventListener('wheel', zoom, { passive: false })
    const unsubscribe = subscribeUiTick(draw, canvas)
    return () => {
      canvas.removeEventListener('wheel', zoom)
      unsubscribe()
      if (clickTimerRef.current !== null) clearTimeout(clickTimerRef.current)
    }
  }, [])

  return (
    <div className='beat-hud-wrapper'>
      <div className='beat-hud-title-row'>
        <span className='beat-hud-bpm' {...info('Tempo read from the last 12 seconds of the onset bands. It is held steady: it follows small drifts, changes only once a different tempo has clearly taken over for a couple of seconds, and holds through a breakdown with no beat.')}>
          {tempo.bpm !== null ? `${Math.round(tempo.bpm)} BPM` : '— BPM'}
        </span>
        <span ref={labelRef} className='beat-hud-label'>Beat</span>
        <span className='beat-hud-consistency' {...info('How steady the detected beats are: the share of gaps between them that are one beat (or one step of the rhythm grid) long, give or take 15%. Missed or extra beats lower it.')}>
          {tempo.consistency !== null ? `${Math.round(tempo.consistency * 100)}% cons` : '—'}
        </span>
      </div>
      <div className='beat-hud' {...info('Each band over time, dimmed if it cannot trigger a beat. Dashed: the level a hit must pass. Bottom marks: hits, in the band\'s color (the title glows with each). Top ruler: beats, bars and 8-bar phrases. Scroll to zoom, double-click to reset, click to flip mirrored.')}>
        <canvas ref={canvasRef} width={WAVEFORM_W} height={WAVEFORM_H} className='beat-hud-canvas' onClick={handleClick} onDoubleClick={handleDoubleClick} />
      </div>
      <span className='beat-hud-feel' {...info('The rhythm the drums play, read from the kick, snare and hat bands: a kick on every beat (four on the floor) or a broken kick (breakbeat), or, when it is sure, the drum and bass kick on 1 and the "and" of 3 (two-step), with the tempo range it is played at. It only names a rhythm it is sure of, so it is often blank: in a breakdown, without a clear beat, or for rhythms it cannot tell apart. A name shows after 2 seconds and clears after 3.')}>
        {rhythm}
      </span>
    </div>
  )
}
