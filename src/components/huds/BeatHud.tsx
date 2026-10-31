import React, { useRef, useEffect, useState } from 'react'
import { useInfo } from '../config/info/info'
import './BeatHud.css'

import { BeatSample } from '../../audioanalysis/beat'
import { DEFAULT_ENABLED_BANDS, ONSET_BANDS } from '../../audioanalysis/onset-bands'
import { estimateTempo, TempoEstimate } from '../../audioanalysis/tempo'
import { subscribeUiTick } from '../../utils/uiTicker'

const W = 360
const PLOT_H = 90
const H = PLOT_H
const WINDOW_MS = 4000
const MIN_Y_MAX = 4
const Y_HEADROOM = 1.15
const LAMP_FADE_MS = 200
// The tempo moves slowly, so it is re-read twice a second, and only drawn again when the number shown changes.
const TEMPO_UPDATE_INTERVAL_MS = 500

const sameTempo = (a: TempoEstimate | null, b: TempoEstimate | null): boolean =>
  a === null || b === null ? a === b : Math.round(a.bpm) === Math.round(b.bpm) && Math.round(a.consistency * 100) === Math.round(b.consistency * 100)

// One look per band, in the order of ONSET_BANDS, spread around the color wheel so neighbors are easy to tell apart.
type BandLook = { label: string; fill: string; line: string; trigger: string }
const BAND_LOOKS: BandLook[] = ONSET_BANDS.map(({ label }, i) => {
  const hue = Math.round((i * 360) / ONSET_BANDS.length + 200) % 360
  return {
    label,
    fill: `hsla(${hue}, 80%, 60%, 0.16)`,
    line: `hsl(${hue}, 80%, 62%)`,
    trigger: `hsla(${hue}, 80%, 62%, 0.7)`,
  }
})

const COLORS = {
  ignore: 'rgba(255, 255, 255, 0.06)',
  text: '#555',
}

// The visualizer lives in the main window; a popped-out config window reads it through window.opener.
const mainWindow = (): Window => window.opener ?? window

type Scale = { toX: (t: number) => number; toY: (v: number) => number }

// The samples are the monitor's whole history, oldest first; `from` is where the visible stretch starts, so nothing is copied to draw it.
const traceBand = (ctx: CanvasRenderingContext2D, samples: readonly BeatSample[], from: number, band: number, scale: Scale, pick: 'level' | 'trigger'): void => {
  for (let i = from; i < samples.length; i++) {
    const sample = samples[i]!
    const value = sample.bands[band]?.[pick] ?? 0
    if (i === from) ctx.moveTo(scale.toX(sample.t), scale.toY(value))
    else ctx.lineTo(scale.toX(sample.t), scale.toY(value))
  }
}

const drawBand = (ctx: CanvasRenderingContext2D, samples: readonly BeatSample[], from: number, band: number, look: BandLook, scale: Scale): void => {
  const first = samples[from]
  const last = samples[samples.length - 1]
  if (!first || !last) return

  ctx.beginPath()
  ctx.moveTo(scale.toX(first.t), PLOT_H)
  traceBand(ctx, samples, from, band, scale, 'level')
  ctx.lineTo(scale.toX(last.t), PLOT_H)
  ctx.closePath()
  ctx.fillStyle = look.fill
  ctx.fill()

  ctx.beginPath()
  traceBand(ctx, samples, from, band, scale, 'level')
  ctx.strokeStyle = look.line
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.beginPath()
  traceBand(ctx, samples, from, band, scale, 'trigger')
  ctx.strokeStyle = look.trigger
  ctx.lineWidth = 1
  ctx.setLineDash([4, 3])
  ctx.stroke()
  ctx.setLineDash([])
}

// Each band is scaled to its own recent peak, since the bands sit at very different levels.
const scaleFor = (samples: readonly BeatSample[], from: number, band: number, now: number): Scale => {
  let peak = MIN_Y_MAX
  for (let i = from; i < samples.length; i++) {
    const sample = samples[i]!.bands[band]
    peak = Math.max(peak, sample?.level ?? 0, sample?.trigger ?? 0)
  }
  const yMax = peak * Y_HEADROOM
  return {
    toX: (t: number): number => W - ((now - t) / WINDOW_MS) * W,
    toY: (v: number): number => PLOT_H - Math.min(1, v / yMax) * PLOT_H,
  }
}

export const BeatHud = (): React.ReactElement => {
  const info = useInfo()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [tempo, setTempo] = useState<TempoEstimate | null>(null)

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
      setTempo((previous) => (sameTempo(previous, estimate) ? previous : estimate))
    }

    const draw = (): void => {
      ctx.clearRect(0, 0, W, H)

      const source = mainWindow()
      updateTempo(source)
      const timeline = source.getBeatTimeline?.()
      const latest = timeline?.samples[timeline.samples.length - 1]
      if (!timeline || !latest) return
      const history = timeline.samples

      // The timeline's clock is the main window's, so read "now" from there: a popped-out config window has its own
      // clock, and the last sample's time would freeze the strip and the lamp if sampling ever stopped.
      const now = source.performance.now()
      // Samples come in time order, so the visible stretch starts where walking back from the newest leaves the window.
      let from = history.length
      while (from > 0 && now - history[from - 1]!.t <= WINDOW_MS) from--
      const toX = (t: number): number => W - ((now - t) / WINDOW_MS) * W

      // Ignore Time after each beat: the detector is blind in this stretch, so a hit that lands in it is dropped.
      const ignoreMs = source.config.audio.ignoreTime.value
      const beats: BeatSample[] = []
      for (let i = from; i < history.length; i++) {
        const sample = history[i]!
        if (sample.beatBand !== null) beats.push(sample)
      }
      ctx.fillStyle = COLORS.ignore
      beats.forEach(({ t }) => {
        const x = toX(t)
        ctx.fillRect(x, 0, Math.min(W - x, (ignoreMs / WINDOW_MS) * W), PLOT_H)
      })

      // Only the bands that can trigger a beat are drawn, so the strip shows what the effects are listening to.
      const enabled = source.enabledFreqBands ?? DEFAULT_ENABLED_BANDS
      BAND_LOOKS.forEach((look, band) => {
        if (enabled[band]) drawBand(ctx, history, from, band, look, scaleFor(history, from, band, now))
      })

      // A beat tick takes the color of the band that set it off.
      ctx.lineWidth = 1.5
      beats.forEach(({ t, beatBand }) => {
        ctx.strokeStyle = BAND_LOOKS[beatBand ?? 0]?.line ?? '#fff'
        const x = Math.round(toX(t)) + 0.5
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, PLOT_H)
        ctx.stroke()
      })

      // Beat lamp, colored by the band that last fired.
      const lastBeat = beats[beats.length - 1]
      const lampAlpha = lastBeat ? Math.max(0, 1 - (now - lastBeat.t) / LAMP_FADE_MS) : 0
      ctx.globalAlpha = 0.15 + lampAlpha * 0.85
      ctx.fillStyle = BAND_LOOKS[lastBeat?.beatBand ?? 0]?.line ?? '#fff'
      ctx.beginPath()
      ctx.arc(10, 10, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1

      // Which line is which band.
      ctx.font = '13px monospace'
      ctx.textAlign = 'left'
      let labelX = 24
      BAND_LOOKS.forEach(({ label, line }, band) => {
        if (!enabled[band]) return
        ctx.fillStyle = line
        ctx.fillText(label, labelX, 14)
        labelX += ctx.measureText(label).width + 8
      })
    }

    return subscribeUiTick(draw, canvas)
  }, [])

  return (
    <div className='beat-hud-wrapper'>
      <div className='beat-hud-title-row'>
        <span className='beat-hud-bpm' {...info('Tempo read from the last 12 seconds of detected beats')}>
          {tempo ? `${Math.round(tempo.bpm)} BPM` : '— BPM'}
        </span>
        <span className='beat-hud-label'>Beat</span>
        <span className='beat-hud-consistency' {...info('How steady the detected beats are: the share of gaps between them that are one beat (or one step of the rhythm grid) long, give or take 15%. Missed or extra beats lower it.')}>
          {tempo ? `${Math.round(tempo.consistency * 100)}% cons` : '—'}
        </span>
      </div>
      <div className='beat-hud' {...info('Colored ticks are beats. The dashed lines are what each band had to pass to count as a hit.')}>
        <canvas ref={canvasRef} width={W} height={H} className='beat-hud-canvas' />
      </div>
    </div>
  )
}
