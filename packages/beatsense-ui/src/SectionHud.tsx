import React, { useCallback, useEffect, useRef, useState } from 'react'
import './SectionHud.css'

import type { SectionState, SectionSlot, SongSection } from 'beatsense'
import { sourceNow, useHud } from './HudContext'
import { listenWheel, zoomView } from './wheelZoom'
import { trackCanvasResolution } from './canvasResolution'
import { agoTicks, formatAgo } from './agoTicks'

const W = 360
const H = 56
// A minute shown unless zoomed (the section now and the one before it, at dance tempos), from 30 s up to the whole two minutes the tracker keeps.
const DEFAULT_VIEW_MS = 60000
const ZOOM_RANGE = { minMs: 30000, maxMs: 120000 }
// Only drawn again when the label or the intensity (to the nearest percent) changes.
const STATE_UPDATE_INTERVAL_MS = 250

const SECTION_COLORS: Record<SongSection, string> = {
  intro: 'rgba(80, 190, 210, 0.30)',
  quiet: 'rgba(120, 130, 150, 0.22)',
  groove: 'rgba(90, 160, 120, 0.16)',
  buildup: 'rgba(240, 190, 60, 0.38)',
  turnaround: 'rgba(255, 255, 255, 0.45)',
  break: 'rgba(90, 140, 220, 0.30)',
  drop: 'rgba(235, 80, 110, 0.48)',
  outro: 'rgba(160, 110, 210, 0.34)',
}

const LINE_COLOR = 'rgba(255, 255, 255, 0.75)'
const TICK_COLOR = 'rgba(255, 255, 255, 0.35)'
// CSS pixels, whatever size the strip is shown at (its drawing scales with it, so this is converted to its units when drawn).
const TICK_CSS_PX = 4

// Whole seconds, so the readout is not drawn again between ticks of the clock.
const songSeconds = (state: SectionState): number | null => (state.songMs === null ? null : Math.floor(state.songMs / 1000))

const formatSongTime = (ms: number): string => {
  const seconds = Math.floor(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

const sameState = (a: SectionState | null, b: SectionState | null): boolean =>
  a === null || b === null
    ? a === b
    : a.section === b.section &&
      Math.round(a.intensity * 100) === Math.round(b.intensity * 100) &&
      songSeconds(a) === songSeconds(b)

/**
 * A short mark at the bottom edge for each time label (the labels are text over the canvas, so they stay sharp when it is scaled). The
 * marks are one CSS pixel wide and TICK_CSS_PX tall at any size: the context's scale says how many of its units that is.
 */
const drawTicks = (ctx: CanvasRenderingContext2D, viewMs: number): void => {
  const cssPx = (window.devicePixelRatio || 1) / (ctx.getTransform().a || 1)
  ctx.fillStyle = TICK_COLOR
  agoTicks(viewMs).forEach((ago) => ctx.fillRect(W - (ago / viewMs) * W, H - TICK_CSS_PX * cssPx, cssPx, TICK_CSS_PX * cssPx))
}

const drawStrip = (ctx: CanvasRenderingContext2D, slots: readonly SectionSlot[], now: number, viewMs: number): void => {
  const toX = (t: number): number => W - ((now - t) / viewMs) * W
  const slotWidth = (250 / viewMs) * W + 1
  // Slots come in time order, so the visible stretch starts where walking back from the newest leaves the view.
  let from = slots.length
  while (from > 0 && now - slots[from - 1]!.t <= viewMs) from--

  let peak = 0
  for (let i = from; i < slots.length; i++) peak = Math.max(peak, slots[i]!.total)
  if (peak <= 0) return

  for (let i = from; i < slots.length; i++) {
    const slot = slots[i]!
    ctx.fillStyle = SECTION_COLORS[slot.section]
    ctx.fillRect(toX(slot.t) - slotWidth, 0, slotWidth, H)
  }

  // The energy trace is in dB against the loudest slot shown, so a quiet mic and a loud one read the same.
  ctx.beginPath()
  for (let i = from; i < slots.length; i++) {
    const slot = slots[i]!
    const db = 20 * Math.log10(Math.max(slot.total, 1e-3) / peak)
    const y = H - Math.min(1, Math.max(0, (db + 36) / 36)) * (H - 4) - 2
    if (i === from) ctx.moveTo(toX(slot.t), y)
    else ctx.lineTo(toX(slot.t), y)
  }
  ctx.strokeStyle = LINE_COLOR
  ctx.lineWidth = 1.25
  ctx.stroke()
}

export type SectionHudProps = {
  /**
   * Called with the length of time shown (ms, its right edge is now) once on mount and whenever the wheel or a double-click changes it,
   * so something drawn beside the HUD can show the same window.
   */
  onViewChange?: (viewMs: number) => void
}

export const SectionHud = ({ onViewChange }: SectionHudProps = {}): React.ReactElement => {
  const { source, ticker, hint } = useHud()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<SectionState | null>(null)
  const viewMsRef = useRef(DEFAULT_VIEW_MS)
  // The same view as state, for the time labels; the draw reads the ref, so a zoom does not wait for a render.
  const [viewMs, setViewMs] = useState(DEFAULT_VIEW_MS)
  const redrawRef = useRef<(() => void) | null>(null)
  // The newest callback, read when the view changes, so a new function each render does not re-subscribe the drawing.
  const onViewChangeRef = useRef(onViewChange)
  onViewChangeRef.current = onViewChange

  useEffect(() => {
    onViewChangeRef.current?.(viewMsRef.current)
  }, [])

  // A double-click puts the zoom back to the default.
  const handleDoubleClick = useCallback((): void => {
    viewMsRef.current = DEFAULT_VIEW_MS
    setViewMs(DEFAULT_VIEW_MS)
    onViewChangeRef.current?.(DEFAULT_VIEW_MS)
    redrawRef.current?.()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let lastStateAt = 0
    // Redraws right away when the canvas is resized, since a resize clears it.
    const resolution = trackCanvasResolution(canvas, W, H, () => redrawRef.current?.())
    const draw = (): void => {
      resolution.apply(ctx)
      ctx.clearRect(0, 0, W, H)
      const now = sourceNow(source)
      if (now - lastStateAt >= STATE_UPDATE_INTERVAL_MS) {
        lastStateAt = now
        const next = source.getSongSection?.() ?? null
        setState((previous) => (sameState(previous, next) ? previous : next))
      }
      const slots = source.getSectionHistory?.()
      if (slots && slots.length > 0) drawStrip(ctx, slots, now, viewMsRef.current)
      drawTicks(ctx, viewMsRef.current)
    }
    redrawRef.current = draw

    const stopWheel = listenWheel(canvas, (deltaY) => {
      viewMsRef.current = zoomView(viewMsRef.current, deltaY, ZOOM_RANGE)
      setViewMs(viewMsRef.current)
      onViewChangeRef.current?.(viewMsRef.current)
      draw()
    })
    const unsubscribe = ticker(draw, canvas)
    return (): void => {
      stopWheel()
      resolution.stop()
      unsubscribe()
    }
  }, [source, ticker])

  return (
    <div className='section-hud-wrapper'>
      <div className='section-hud-title-row'>
        <span className='section-hud-time' {...hint('About how long the current song has been going. It shows once a song looks like it is playing, so not in silence or on stray noise, and it starts over when the next song does.')}>
          {state?.songMs != null ? formatSongTime(state.songMs) : ''}
        </span>
        <span className='section-hud-label'>Section</span>
        <span className='section-hud-intensity' {...hint('How loud the song is now against its own recent peak.')}>
          {state ? `${Math.round(state.intensity * 100)}%` : '—'}
        </span>
      </div>
      <div className='section-hud' {...hint('The last minute (scroll to zoom from 30 seconds to 2 minutes, double-click to reset; the marks along the bottom are seconds ago). The line is the level of the song against its loudest moment, the colors are the sections: cyan intro, green groove, yellow buildup, white turnaround, blue break, red drop, purple outro, grey quiet.')}>
        <canvas ref={canvasRef} width={W} height={H} className='section-hud-canvas' onDoubleClick={handleDoubleClick} />
        <div className='section-hud-ticks' aria-hidden='true'>
          {agoTicks(viewMs).map((ago) => (
            <span key={ago} className='section-hud-tick' style={{ left: `${(1 - ago / viewMs) * 100}%` }}>{formatAgo(ago)}</span>
          ))}
        </div>
      </div>
      <span className='section-hud-name' {...hint('The part of the song this looks like: intro (the start, before anything has built or dropped), groove, buildup (tension rising toward a drop), turnaround (the music cutting out during a buildup; about 1 in 4 turns into a drop), break (the low end pulled back, calmer), drop (the full-energy part after the drop lands, until the next break or buildup), outro (a fade late in the song) or quiet (silence, or no steady beat). A model trained on expert-labelled tracks makes the call, so it can be wrong; the next song starts over at intro.')}>
        {state?.section ?? ''}
      </span>
    </div>
  )
}
