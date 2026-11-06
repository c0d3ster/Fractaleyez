import React, { useEffect, useRef, useState } from 'react'
import { useInfo } from '../config/info/info'
import './SectionHud.css'

import { SectionState, SectionSlot, SongSection } from '../../audioanalysis/sections'
import { subscribeUiTick } from '../../utils/uiTicker'

const W = 360
const H = 56
const WINDOW_MS = 120000
// Only drawn again when the label or the intensity (to the nearest percent) changes.
const STATE_UPDATE_INTERVAL_MS = 250

const SECTION_COLORS: Record<SongSection, string> = {
  quiet: 'rgba(120, 130, 150, 0.22)',
  groove: 'rgba(90, 160, 120, 0.16)',
  buildup: 'rgba(240, 190, 60, 0.38)',
  break: 'rgba(90, 140, 220, 0.30)',
  drop: 'rgba(235, 80, 110, 0.48)',
}

const LINE_COLOR = 'rgba(255, 255, 255, 0.75)'

// The visualizer lives in the main window; a popped-out config window reads it through window.opener.
const mainWindow = (): Window => window.opener ?? window

const sameState = (a: SectionState | null, b: SectionState | null): boolean =>
  a === null || b === null ? a === b : a.section === b.section && Math.round(a.intensity * 100) === Math.round(b.intensity * 100)

const drawStrip = (ctx: CanvasRenderingContext2D, slots: readonly SectionSlot[], now: number): void => {
  const toX = (t: number): number => W - ((now - t) / WINDOW_MS) * W
  const slotWidth = (250 / WINDOW_MS) * W + 1

  let peak = 0
  for (const slot of slots) peak = Math.max(peak, slot.total)
  if (peak <= 0) return

  slots.forEach((slot) => {
    if (now - slot.t > WINDOW_MS) return
    ctx.fillStyle = SECTION_COLORS[slot.section]
    ctx.fillRect(toX(slot.t) - slotWidth, 0, slotWidth, H)
  })

  // The energy trace is in dB against the loudest slot shown, so a quiet mic and a loud one read the same.
  ctx.beginPath()
  let started = false
  slots.forEach((slot) => {
    if (now - slot.t > WINDOW_MS) return
    const db = 20 * Math.log10(Math.max(slot.total, 1e-3) / peak)
    const y = H - Math.min(1, Math.max(0, (db + 36) / 36)) * (H - 4) - 2
    if (started) ctx.lineTo(toX(slot.t), y)
    else ctx.moveTo(toX(slot.t), y)
    started = true
  })
  ctx.strokeStyle = LINE_COLOR
  ctx.lineWidth = 1.25
  ctx.stroke()
}

export const SectionHud = (): React.ReactElement => {
  const info = useInfo()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<SectionState | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let lastStateAt = 0
    const draw = (): void => {
      ctx.clearRect(0, 0, W, H)
      const source = mainWindow()
      const now = source.performance.now()
      if (now - lastStateAt >= STATE_UPDATE_INTERVAL_MS) {
        lastStateAt = now
        const next = source.getSongSection?.() ?? null
        setState((previous) => (sameState(previous, next) ? previous : next))
      }
      const slots = source.getSectionHistory?.()
      if (slots && slots.length > 0) drawStrip(ctx, slots, now)
    }

    return subscribeUiTick(draw, canvas)
  }, [])

  return (
    <div className='section-hud-wrapper'>
      <div className='section-hud-title-row'>
        <span className='section-hud-name' {...info('The part of the song this looks like: quiet, groove, buildup (hits getting denser, highs climbing), break (low end cut) or drop (the low end coming back hard after a buildup or break).')}>
          {state?.section ?? '—'}
        </span>
        <span className='section-hud-label'>Section</span>
        <span className='section-hud-intensity' {...info('How loud the song is now against its own recent peak.')}>
          {state ? `${Math.round(state.intensity * 100)}%` : '—'}
        </span>
      </div>
      <div className='section-hud' {...info('The last two minutes. The line is the song\'s level against its loudest moment, the colors are the sections: green groove, yellow buildup, blue break, red drop, grey quiet.')}>
        <canvas ref={canvasRef} width={W} height={H} className='section-hud-canvas' />
      </div>
    </div>
  )
}
