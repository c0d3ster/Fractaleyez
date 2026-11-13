import React, { useRef, useEffect, useCallback } from 'react'
import './FrequencyHud.css'

import { DRUM_CENTER_HZ, DRUM_KINDS, ONSET_BANDS } from 'beatsense'
import { sourceNow, useHud, type AnalysisSource } from './HudContext'
import { bandColor } from './bandColors'
import { beatFlashes } from './beatFlashes'
import { RISER_LEVELS, RiserLevel } from './riserLevel'

const VISIBLE_BANDS = ONSET_BANDS.length
const LABELS = ONSET_BANDS.map(({ label }) => label)
// A bar's top is a bit above the band's recent loudness, so a hit that is the loudest in a while nearly fills it.
const BAR_HEADROOM = 1.1

const W = 180
const LABEL_H = 14
const BAR_AREA_H = 90
// Below the labels, a light for each drum the hit classifier names (drum-hits.ts), at the frequency its hits sit at, with its name under
// it, and under the air column (which has no drum) the riser meter: signal bars that light as a riser plays (riserLevel.ts).
const BANDS_H = BAR_AREA_H + LABEL_H
const INSTRUMENT_GAP = 8
const ICON_H = 16
const INSTRUMENT_LABEL_H = 10
const INSTRUMENT_TOP = BANDS_H + INSTRUMENT_GAP
const H = INSTRUMENT_TOP + ICON_H + INSTRUMENT_LABEL_H + 4
const GAP = 4
const BAR_W = Math.floor((W - (VISIBLE_BANDS - 1) * GAP) / VISIBLE_BANDS)  // 32px
const RADIUS = 3
const INSTRUMENT_DOT_R = 5
// How long an instrument's light takes to fade after a hit.
const INSTRUMENT_FLASH_MS = 180
const INSTRUMENT_LABEL_Y = INSTRUMENT_TOP + ICON_H + 8
// The riser's signal bars: RISER_LEVELS of them, rising left to right, in the air column.
const RISER_BAR_W = 3
const RISER_BAR_GAP = 2
const RISER_MIN_BAR_H = 4
const RISER_X = (VISIBLE_BANDS - 1) * (BAR_W + GAP) + (BAR_W - (RISER_LEVELS * RISER_BAR_W + (RISER_LEVELS - 1) * RISER_BAR_GAP)) / 2
const LIT = 'rgba(242, 242, 242, 0.9)'
const UNLIT = '#333'
const LABEL_FONT = '8px monospace'

// Where a frequency falls across the bars: in its band's column, at its place between the band's edges on a log scale (each band spans a
// few times its low edge, so the chart reads roughly as a log frequency axis).
const frequencyX = (hz: number): number => {
  const band = Math.max(0, ONSET_BANDS.findIndex((spec) => hz < spec.highHz))
  const { lowHz, highHz } = ONSET_BANDS[band] ?? { lowHz: 40, highHz: 150 }
  const within = Math.min(1, Math.max(0, Math.log(hz / lowHz) / Math.log(highHz / lowHz)))
  return band * (BAR_W + GAP) + within * BAR_W
}

// A light stays this far inside its band's column, so its label and the riser bars under air never crowd it (the hats sit near hi's
// right edge, next to the riser).
const LIGHT_INSET = 9
const insideColumn = (x: number): number => {
  const column = Math.min(VISIBLE_BANDS - 1, Math.floor(x / (BAR_W + GAP)))
  const left = column * (BAR_W + GAP)
  return Math.min(left + BAR_W - LIGHT_INSET, Math.max(left + LIGHT_INSET, x))
}
const LIGHT_X = DRUM_KINDS.map((kind) => insideColumn(frequencyX(DRUM_CENTER_HZ[kind])))

const drawInstrumentLabel = (ctx: CanvasRenderingContext2D, text: string, x: number, lit: number): void => {
  ctx.font = LABEL_FONT
  ctx.textAlign = 'center'
  ctx.fillStyle = lit > 0 ? `rgba(242, 242, 242, ${0.45 + lit * 0.55})` : '#555'
  ctx.fillText(text, x, INSTRUMENT_LABEL_Y)
}

const drawInstrumentLights = (ctx: CanvasRenderingContext2D, source: AnalysisSource, now: number): void => {
  const y = INSTRUMENT_TOP + ICON_H / 2
  const last = source.getDrumHits?.()
  DRUM_KINDS.forEach((kind, i) => {
    const hit = last?.[kind] ?? null
    const flash = hit === null ? 0 : Math.max(0, 1 - (now - hit) / INSTRUMENT_FLASH_MS)
    const x = LIGHT_X[i] ?? 0
    ctx.beginPath()
    ctx.arc(x, y, INSTRUMENT_DOT_R, 0, Math.PI * 2)
    ctx.fillStyle = flash > 0 ? `rgba(242, 242, 242, ${0.25 + flash * 0.75})` : UNLIT
    ctx.fill()
    drawInstrumentLabel(ctx, kind, x, flash)
  })
}

const drawRiserMeter = (ctx: CanvasRenderingContext2D, source: AnalysisSource, meter: RiserLevel, now: number): void => {
  // Whichever reads higher: the sweep (sweep.ts, from the spectrum) catches risers the band levels (riser.ts) cannot see under the hats.
  const score = Math.min(1, Math.max(0, source.getRiser?.() ?? 0, source.getSweep?.() ?? 0))
  const level = meter.step(score, now)
  const bottom = INSTRUMENT_TOP + ICON_H
  const growth = (ICON_H - RISER_MIN_BAR_H) / (RISER_LEVELS - 1)
  for (let i = 0; i < RISER_LEVELS; i++) {
    const h = RISER_MIN_BAR_H + i * growth
    ctx.fillStyle = i < level ? LIT : UNLIT
    roundRect(ctx, RISER_X + i * (RISER_BAR_W + RISER_BAR_GAP), bottom - h, RISER_BAR_W, h, 1)
  }
  drawInstrumentLabel(ctx, 'riser', (VISIBLE_BANDS - 1) * (BAR_W + GAP) + BAR_W / 2, level > 0 ? 1 : 0)
}

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void => {
  if (h <= 0) return
  const clampedR = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + clampedR, y)
  ctx.lineTo(x + w - clampedR, y)
  ctx.arcTo(x + w, y, x + w, y + clampedR, clampedR)
  ctx.lineTo(x + w, y + h - clampedR)
  ctx.arcTo(x + w, y + h, x + w - clampedR, y + h, clampedR)
  ctx.lineTo(x + clampedR, y + h)
  ctx.arcTo(x, y + h, x, y + h - clampedR, clampedR)
  ctx.lineTo(x, y + clampedR)
  ctx.arcTo(x, y, x + clampedR, y, clampedR)
  ctx.closePath()
  ctx.fill()
}

export type FrequencyHudProps = {
  /** Which onset bands can set off a beat, one per band in `ONSET_BANDS` order; a band that is off is drawn dimmed. */
  enabledBands: readonly boolean[]
  /** Called with the whole new selection when a band is clicked; the HUD shows it once it comes back as `enabledBands`. */
  onEnabledBandsChange: (enabledBands: boolean[]) => void
}

export const FrequencyHud = ({ enabledBands, onEnabledBandsChange }: FrequencyHudProps): React.ReactElement => {
  const { source, ticker, hint } = useHud()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // The draw loop reads the selection on each tick, and a click toggles the latest one.
  const enabledBandsRef = useRef(enabledBands)
  enabledBandsRef.current = enabledBands
  const hoveredBandRef = useRef<number | null>(null)

  const toggleBand = useCallback((i: number): void => {
    onEnabledBandsChange(enabledBandsRef.current.map((on, idx) => (idx === i ? !on : on)))
  }, [onEnabledBandsChange])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const riserMeter = new RiserLevel()

    const draw = (): void => {
      ctx.clearRect(0, 0, W, H)

      // The bars show the same bands the beat detector listens to: level, the level a hit had to pass, and a flash
      // on the band that actually set off a beat.
      const timeline = source.getBeatTimeline?.()
      const samples = timeline?.samples ?? []
      const latest = samples[samples.length - 1]
      // The timeline is stamped on the source's clock, so flashes age against that and keep fading if sampling stops.
      const now = sourceNow(source)
      // The band that set off each recent beat, and bass too when its own onset is right by a beat another band took (beatFlashes.ts).
      const flashes = beatFlashes(samples, now, VISIBLE_BANDS)

      for (let i = 0; i < VISIBLE_BANDS; i++) {
        const x = i * (BAR_W + GAP)
        const enabled = enabledBandsRef.current[i] ?? true
        const hovered = hoveredBandRef.current === i
        const band = latest?.bands[i]
        const barTop = (band?.loudness ?? 0) * BAR_HEADROOM
        const energy = barTop > 0 ? Math.min(1, (band?.level ?? 0) / barTop) : 0
        const avg = barTop > 0 ? Math.min(1, (band?.trigger ?? 0) / barTop) : 0
        const peakVal = enabled ? (flashes[i] ?? 0) : 0

        // Bar background
        ctx.fillStyle = hovered ? (enabled ? '#181818' : '#0d1626') : enabled ? '#111' : '#0a0a0a'
        roundRect(ctx, x, 0, BAR_W, BAR_AREA_H, RADIUS)

        // Energy fill — gradient bottom to top
        const fillH = Math.round(energy * BAR_AREA_H)
        if (fillH > 0) {
          const grad = ctx.createLinearGradient(0, BAR_AREA_H - fillH, 0, BAR_AREA_H)
          if (hovered && enabled) {
            // Hovering an active band previews turning it off: wash it toward gray.
            grad.addColorStop(0, '#9a9a9a')
            grad.addColorStop(1, '#333')
          } else if (hovered) {
            // Hovering a disabled band previews turning it back on: a faded blue.
            grad.addColorStop(0, bandColor(i, 60, 0.45))
            grad.addColorStop(1, bandColor(i, 18, 0.45))
          } else if (!enabled) {
            grad.addColorStop(0, '#222')
            grad.addColorStop(1, '#111')
          } else if (peakVal > 0.1) {
            grad.addColorStop(0, bandColor(i, 88, 0.7 + peakVal * 0.3))
            grad.addColorStop(0.4, bandColor(i, 62, 0.8 + peakVal * 0.2))
            grad.addColorStop(1, bandColor(i, 12))
          } else {
            grad.addColorStop(0, bandColor(i, 62))
            grad.addColorStop(1, bandColor(i, 18))
          }
          ctx.fillStyle = grad
          roundRect(ctx, x, BAR_AREA_H - fillH, BAR_W, fillH, RADIUS)
        }

        // Trigger notch: the level the band has to pass to count as a hit (only when enabled)
        if (enabled && avg > 0) {
          const avgY = BAR_AREA_H - Math.round(avg * BAR_AREA_H)
          ctx.fillStyle = 'rgba(255,255,255,0.25)'
          ctx.fillRect(x, avgY, BAR_W, 1)
        }

        // Hit flash
        if (enabled && peakVal > 0.01 && fillH > 0) {
          const flashH = Math.max(3, Math.round(peakVal * 10))
          const flashY = BAR_AREA_H - fillH
          const flashGrad = ctx.createLinearGradient(0, flashY, 0, flashY + flashH)
          flashGrad.addColorStop(0, `rgba(255, 255, 255, ${peakVal * 0.9})`)
          flashGrad.addColorStop(1, 'rgba(255, 255, 255, 0)')
          ctx.fillStyle = flashGrad
          ctx.fillRect(x, flashY, BAR_W, flashH)
        }

        // Band label
        if (!enabled) {
          ctx.fillStyle = '#2a2a2a'
        } else if (peakVal > 0.1) {
          ctx.fillStyle = bandColor(i, 80, 0.5 + peakVal * 0.5)
        } else {
          ctx.fillStyle = bandColor(i, 50, 0.75)
        }
        ctx.font = '9px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(LABELS[i] ?? '', x + BAR_W / 2, BANDS_H - 2)
      }

      drawInstrumentLights(ctx, source, now)
      drawRiserMeter(ctx, source, riserMeter, now)
    }

    return ticker(draw, canvas)
  }, [source, ticker])

  // The band under the pointer, or null between bands' ends or on the instrument row below the labels (which toggles nothing).
  const bandAt = useCallback((e: React.MouseEvent<HTMLCanvasElement>): number | null => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (((e.clientY - rect.top) / rect.height) * H > BANDS_H) return null
    const band = Math.floor((((e.clientX - rect.left) / rect.width) * W) / (BAR_W + GAP))
    return band >= 0 && band < VISIBLE_BANDS ? band : null
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>): void => {
    // Touch has no hover; tracking it would leave the band highlighted after a tap.
    if (e.pointerType !== 'mouse') return
    hoveredBandRef.current = bandAt(e)
  }, [bandAt])

  const handlePointerLeave = useCallback((): void => {
    hoveredBandRef.current = null
  }, [])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>): void => {
    const band = bandAt(e)
    if (band !== null) toggleBand(band)
  }, [bandAt, toggleBand])

  return (
    <div className='frequency-hud-wrapper' {...hint('Click a band to choose whether it can set off a beat. The bass band (the kick) and the hi band (snare and clap) are on by default. The lights below flash on each hit the drum classifier calls a kick, a snare, a clap or hats, each placed at the frequency its hits sit at. The signal bars under air light up once the music is clearly rising (a riser or a sweep), more bars the surer it is.')}>
      <span className='frequency-hud-label'>Frequency</span>
      <div className='frequency-hud'>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className='frequency-hud-canvas'
          onClick={handleClick}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        />
      </div>
    </div>
  )
}
