import React, { useRef, useEffect } from 'react'
import './BeatHud.css'

import { BeatEffect, BeatSample } from '../../audioanalysis/beat'
import { subscribeUiTick } from '../../utils/uiTicker'

const W = 360
const PLOT_H = 90
const MARK_H = 16
const H = PLOT_H + MARK_H
const WINDOW_MS = 4000
const MIN_Y_MAX = 8
const Y_HEADROOM = 1.15
const LAMP_FADE_MS = 200

const COLORS = {
  energyFill: 'rgba(68, 170, 255, 0.28)',
  energyLine: '#4af',
  trigger: 'rgba(255, 170, 60, 0.9)',
  beat: 'rgba(255, 255, 255, 0.85)',
  ignore: 'rgba(255, 255, 255, 0.06)',
  text: '#555',
}

const EFFECT_COLORS: Record<BeatEffect, string> = {
  shockwave: '#fa4',
  switcheroo: '#d6f',
}

// The visualizer lives in the main window; a popped-out config window reads it through window.opener.
const mainWindow = (): Window => window.opener ?? window

const drawEnergy = (ctx: CanvasRenderingContext2D, samples: BeatSample[], toX: (t: number) => number, toY: (v: number) => number): void => {
  const first = samples[0]
  if (!first) return
  ctx.beginPath()
  ctx.moveTo(toX(first.t), PLOT_H)
  samples.forEach(({ t, energy }) => ctx.lineTo(toX(t), toY(energy)))
  const last = samples[samples.length - 1] ?? first
  ctx.lineTo(toX(last.t), PLOT_H)
  ctx.closePath()
  ctx.fillStyle = COLORS.energyFill
  ctx.fill()

  ctx.beginPath()
  samples.forEach(({ t, energy }, i) => (i === 0 ? ctx.moveTo(toX(t), toY(energy)) : ctx.lineTo(toX(t), toY(energy))))
  ctx.strokeStyle = COLORS.energyLine
  ctx.lineWidth = 1.5
  ctx.stroke()
}

const drawTrigger = (ctx: CanvasRenderingContext2D, samples: BeatSample[], toX: (t: number) => number, toY: (v: number) => number): void => {
  ctx.beginPath()
  samples.forEach(({ t, trigger }, i) => (i === 0 ? ctx.moveTo(toX(t), toY(trigger)) : ctx.lineTo(toX(t), toY(trigger))))
  ctx.strokeStyle = COLORS.trigger
  ctx.lineWidth = 1
  ctx.setLineDash([4, 3])
  ctx.stroke()
  ctx.setLineDash([])
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

      const yMax = Math.max(MIN_Y_MAX, ...samples.map(({ energy, trigger }) => Math.max(energy, trigger))) * Y_HEADROOM
      const toY = (v: number): number => PLOT_H - Math.min(1, v / yMax) * PLOT_H

      // Ignore Time after each beat: the detector is blind in this stretch, so a hit that lands in it is dropped.
      const ignoreMs = source.config.audio.ignoreTime.value
      ctx.fillStyle = COLORS.ignore
      samples.filter(({ beat }) => beat).forEach(({ t }) => {
        const x = toX(t)
        ctx.fillRect(x, 0, Math.min(W - x, (ignoreMs / WINDOW_MS) * W), PLOT_H)
      })

      drawEnergy(ctx, samples, toX, toY)
      drawTrigger(ctx, samples, toX, toY)

      ctx.strokeStyle = COLORS.beat
      ctx.lineWidth = 1
      samples.filter(({ beat }) => beat).forEach(({ t }) => {
        const x = Math.round(toX(t)) + 0.5
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, PLOT_H)
        ctx.stroke()
      })

      // Effect hits sit on their own row so you can compare them against the detected beats above.
      timeline.hits.filter(({ t }) => now - t <= WINDOW_MS).forEach(({ t, effect }) => {
        const x = toX(t)
        const y = PLOT_H + MARK_H / 2
        ctx.fillStyle = EFFECT_COLORS[effect]
        ctx.beginPath()
        if (effect === 'shockwave') {
          ctx.moveTo(x, y - 5)
          ctx.lineTo(x + 5, y)
          ctx.lineTo(x, y + 5)
          ctx.lineTo(x - 5, y)
          ctx.closePath()
        } else {
          ctx.arc(x, y, 4, 0, Math.PI * 2)
        }
        ctx.fill()
      })

      // Beat lamp and the live ratio against what it needs to be.
      const lastBeat = [...samples].reverse().find(({ beat }) => beat)
      const lampAlpha = lastBeat ? Math.max(0, 1 - (now - lastBeat.t) / LAMP_FADE_MS) : 0
      ctx.fillStyle = `rgba(255, 255, 255, ${0.15 + lampAlpha * 0.85})`
      ctx.beginPath()
      ctx.arc(10, 10, 5, 0, Math.PI * 2)
      ctx.fill()

      const threshold = source.config.audio.soundThreshold.value
      const average = threshold > 0 ? latest.trigger / threshold : 0
      const ratio = average > 0 ? latest.energy / average : 0
      ctx.fillStyle = COLORS.text
      ctx.font = '16px monospace'
      ctx.textAlign = 'right'
      ctx.fillText(`x${ratio.toFixed(1)} of x${threshold.toFixed(1)} needed`, W - 6, 16)
    }

    return subscribeUiTick(draw)
  }, [])

  return (
    <div className='beat-hud-wrapper'>
      <span className='beat-hud-label'>Beat</span>
      <div className='beat-hud'>
        <canvas ref={canvasRef} width={W} height={H} className='beat-hud-canvas' />
      </div>
      <span className='beat-hud-hint'>
        <span className='beat-hud-key beat-hud-key--energy'>energy</span>
        <span className='beat-hud-key beat-hud-key--trigger'>trigger</span>
        <span className='beat-hud-key beat-hud-key--beat'>beat</span>
        <span className='beat-hud-key beat-hud-key--shockwave'>shockwave</span>
        <span className='beat-hud-key beat-hud-key--switcheroo'>switcheroo</span>
      </span>
    </div>
  )
}
