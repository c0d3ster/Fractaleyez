import React, { useRef, useEffect } from 'react'
import './BeatHud.css'

import { BeatSample } from '../../audioanalysis/beat'
import { DEFAULT_ENABLED_BANDS, ONSET_BANDS } from '../../audioanalysis/onset-bands'
import { subscribeUiTick } from '../../utils/uiTicker'

const W = 360
const PLOT_H = 90
const H = PLOT_H
const WINDOW_MS = 4000
const MIN_Y_MAX = 4
const Y_HEADROOM = 1.15
const LAMP_FADE_MS = 200

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

const traceBand = (ctx: CanvasRenderingContext2D, samples: BeatSample[], band: number, scale: Scale, pick: 'level' | 'trigger'): void => {
  samples.forEach((sample, i) => {
    const value = sample.bands[band]?.[pick] ?? 0
    if (i === 0) ctx.moveTo(scale.toX(sample.t), scale.toY(value))
    else ctx.lineTo(scale.toX(sample.t), scale.toY(value))
  })
}

const drawBand = (ctx: CanvasRenderingContext2D, samples: BeatSample[], band: number, look: BandLook, scale: Scale): void => {
  const first = samples[0]
  const last = samples[samples.length - 1]
  if (!first || !last) return

  ctx.beginPath()
  ctx.moveTo(scale.toX(first.t), PLOT_H)
  traceBand(ctx, samples, band, scale, 'level')
  ctx.lineTo(scale.toX(last.t), PLOT_H)
  ctx.closePath()
  ctx.fillStyle = look.fill
  ctx.fill()

  ctx.beginPath()
  traceBand(ctx, samples, band, scale, 'level')
  ctx.strokeStyle = look.line
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.beginPath()
  traceBand(ctx, samples, band, scale, 'trigger')
  ctx.strokeStyle = look.trigger
  ctx.lineWidth = 1
  ctx.setLineDash([4, 3])
  ctx.stroke()
  ctx.setLineDash([])
}

// Each band is scaled to its own recent peak, since the bands sit at very different levels.
const scaleFor = (samples: BeatSample[], band: number, now: number): Scale => {
  const peak = Math.max(MIN_Y_MAX, ...samples.map(({ bands }) => Math.max(bands[band]?.level ?? 0, bands[band]?.trigger ?? 0)))
  const yMax = peak * Y_HEADROOM
  return {
    toX: (t: number): number => W - ((now - t) / WINDOW_MS) * W,
    toY: (v: number): number => PLOT_H - Math.min(1, v / yMax) * PLOT_H,
  }
}

export const BeatHud = (): React.ReactElement => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = (): void => {
      ctx.clearRect(0, 0, W, H)

      const source = mainWindow()
      const timeline = source.getBeatTimeline?.()
      const latest = timeline?.samples[timeline.samples.length - 1]
      if (!timeline || !latest) return

      const now = latest.t
      const samples = timeline.samples.filter(({ t }) => now - t <= WINDOW_MS)
      const toX = (t: number): number => W - ((now - t) / WINDOW_MS) * W

      // Ignore Time after each beat: the detector is blind in this stretch, so a hit that lands in it is dropped.
      const ignoreMs = source.config.audio.ignoreTime.value
      const beats = samples.filter(({ beatBand }) => beatBand !== null)
      ctx.fillStyle = COLORS.ignore
      beats.forEach(({ t }) => {
        const x = toX(t)
        ctx.fillRect(x, 0, Math.min(W - x, (ignoreMs / WINDOW_MS) * W), PLOT_H)
      })

      // Only the bands that can trigger a beat are drawn, so the strip shows what the effects are listening to.
      const enabled = source.enabledFreqBands ?? DEFAULT_ENABLED_BANDS
      BAND_LOOKS.forEach((look, band) => {
        if (enabled[band]) drawBand(ctx, samples, band, look, scaleFor(samples, band, now))
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
      const lastBeat = [...beats].reverse()[0]
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

    return subscribeUiTick(draw)
  }, [])

  return (
    <div className='beat-hud-wrapper'>
      <span className='beat-hud-label'>Beat</span>
      <div className='beat-hud'>
        <canvas ref={canvasRef} width={W} height={H} className='beat-hud-canvas' />
      </div>
      <span className='beat-hud-hint'>colored ticks are beats, dashed lines are what each band had to pass</span>
    </div>
  )
}
