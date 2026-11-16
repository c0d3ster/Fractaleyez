import React, { useRef, useEffect, useCallback } from 'react'
import './FrequencyHud.css'

import { DRUM_CENTER_HZ, DRUM_KINDS, ONSET_BANDS, defaultDrumThresholds, type DrumKind } from 'beatsense'
import { drawDrumMark } from './drumMarks'
import { sourceNow, useHud, type AnalysisSource } from './HudContext'
import { trackCanvasResolution } from './canvasResolution'
import { bandColor } from './bandColors'
import { beatFlashes } from './beatFlashes'
import { RISER_LEVELS, RiserLevel } from './riserLevel'

const VISIBLE_BANDS = ONSET_BANDS.length
const LABELS = ONSET_BANDS.map(({ label }) => label)
// A bar's top is a bit above the band's recent loudness, so a hit that is the loudest in a while nearly fills it.
const BAR_HEADROOM = 1.1

const W = 180
const LABEL_H = 14
/** The bars' height in units, by default; FrequencyHud's `barHeight` changes it (the rest of the layout follows). */
export const DEFAULT_BAR_HEIGHT = 90
// Below the labels, a light for each drum the hit classifier names (drum-hits.ts), in its shape and color (drumMarks.ts, as the Beat HUD's
// drum row draws it), at the frequency its hits sit at, with its name under
// it, and under the air column (which has no drum) the riser meter: signal bars that light as a riser plays (riserLevel.ts).
const INSTRUMENT_GAP = 8
const ICON_H = 16
const INSTRUMENT_LABEL_H = 10
const GAP = 4
const BAR_W = Math.floor((W - (VISIBLE_BANDS - 1) * GAP) / VISIBLE_BANDS)  // 32px
const RADIUS = 3
const INSTRUMENT_DOT_R = 5
// How long an instrument's light takes to fade after a hit.
const INSTRUMENT_FLASH_MS = 180
// The riser's signal bars: RISER_LEVELS of them, rising left to right, in the air column.
const RISER_BAR_W = 3
const RISER_BAR_GAP = 2
const RISER_MIN_BAR_H = 4
const RISER_X = (VISIBLE_BANDS - 1) * (BAR_W + GAP) + (BAR_W - (RISER_LEVELS * RISER_BAR_W + (RISER_LEVELS - 1) * RISER_BAR_GAP)) / 2
const LIT = 'rgba(242, 242, 242, 0.9)'
const UNLIT = '#333'
const LABEL_FONT = '8px monospace'

/** Where the parts sit, in units, for bars `barAreaH` tall: the labels under the bars, then the drum lights and the riser meter. */
export type FrequencyLayout = {
  barAreaH: number
  /** The bars and their labels. */
  bandsH: number
  instrumentTop: number
  instrumentLabelY: number
  /** The canvas's height. */
  height: number
}

export const frequencyLayout = (barAreaH: number = DEFAULT_BAR_HEIGHT): FrequencyLayout => {
  const bandsH = barAreaH + LABEL_H
  const instrumentTop = bandsH + INSTRUMENT_GAP
  return { barAreaH, bandsH, instrumentTop, instrumentLabelY: instrumentTop + ICON_H + 8, height: instrumentTop + ICON_H + INSTRUMENT_LABEL_H + 4 }
}

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

const drawInstrumentLabel = (ctx: CanvasRenderingContext2D, layout: FrequencyLayout, text: string, x: number, lit: number): void => {
  ctx.font = LABEL_FONT
  ctx.textAlign = 'center'
  ctx.fillStyle = lit > 0 ? `rgba(242, 242, 242, ${0.45 + lit * 0.55})` : '#555'
  ctx.fillText(text, x, layout.instrumentLabelY)
}

const drawInstrumentLights = (ctx: CanvasRenderingContext2D, layout: FrequencyLayout, source: AnalysisSource, now: number): void => {
  const y = layout.instrumentTop + ICON_H / 2
  const last = source.getDrumHits?.()
  DRUM_KINDS.forEach((kind, i) => {
    const hit = last?.[kind] ?? null
    const flash = hit === null ? 0 : Math.max(0, 1 - (now - hit) / INSTRUMENT_FLASH_MS)
    const x = LIGHT_X[i] ?? 0
    // The drum's shape (as in the Beat HUD's drum row), grey while unlit, flashing in its color on a hit.
    drawDrumMark(ctx, kind, x, y, INSTRUMENT_DOT_R * 2, UNLIT)
    if (flash > 0) {
      ctx.globalAlpha = 0.3 + flash * 0.7
      drawDrumMark(ctx, kind, x, y, INSTRUMENT_DOT_R * 2)
      ctx.globalAlpha = 1
    }
    drawInstrumentLabel(ctx, layout, kind, x, flash)
  })
}

const drawRiserMeter = (ctx: CanvasRenderingContext2D, layout: FrequencyLayout, source: AnalysisSource, meter: RiserLevel, now: number): void => {
  // Whichever reads higher: the sweep (sweep.ts, from the spectrum) catches risers the band levels (riser.ts) cannot see under the hats.
  const score = Math.min(1, Math.max(0, source.getRiser?.() ?? 0, source.getSweep?.() ?? 0))
  const level = meter.step(score, now)
  const bottom = layout.instrumentTop + ICON_H
  const growth = (ICON_H - RISER_MIN_BAR_H) / (RISER_LEVELS - 1)
  for (let i = 0; i < RISER_LEVELS; i++) {
    const h = RISER_MIN_BAR_H + i * growth
    ctx.fillStyle = i < level ? LIT : UNLIT
    roundRect(ctx, RISER_X + i * (RISER_BAR_W + RISER_BAR_GAP), bottom - h, RISER_BAR_W, h, 1)
  }
  drawInstrumentLabel(ctx, layout, 'riser', (VISIBLE_BANDS - 1) * (BAR_W + GAP) + BAR_W / 2, level > 0 ? 1 : 0)
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

/** How sure the drum model has to be for each drum, 0 to 1 (beatsense's DrumHits.setThresholds). */
export type DrumThresholds = Readonly<Record<DrumKind, number>>

// A threshold on its slider, 0 to 100 in half steps (the trained ones are at halves: kick 87.5).
const toSlider = (threshold: number): number => Math.round(threshold * 200) / 2
const SLIDER_STEP = 0.5

type DrumThresholdSlidersProps = { thresholds: DrumThresholds; onChange: (thresholds: DrumThresholds) => void }

/** A slider under each drum light, in the light's column: higher is stricter (fewer calls); a double-click puts it back at the model's. */
const DrumThresholdSliders = ({ thresholds, onChange }: DrumThresholdSlidersProps): React.ReactElement => {
  const { hint } = useHud()
  const defaults = defaultDrumThresholds()
  const set = (kind: DrumKind, sliderValue: number): void => onChange({ ...thresholds, [kind]: sliderValue / 100 })
  return (
    <div className='frequency-hud-thresholds'>
      {DRUM_KINDS.map((kind, i) => {
        const value = toSlider(thresholds[kind])
        const changed = value !== toSlider(defaults[kind])
        return (
          <label
            key={kind}
            className='frequency-hud-threshold'
            style={{ left: `${((LIGHT_X[i] ?? 0) / W) * 100}%`, width: `${(BAR_W / W) * 100}%` }}
            {...hint(`How sure the drum model has to be to call a ${kind}: higher calls fewer. The model's own is ${toSlider(defaults[kind])}; double-click to put it back.`)}
          >
            <input
              type='range'
              min={0}
              max={100}
              step={SLIDER_STEP}
              value={value}
              aria-label={`${kind} threshold`}
              onChange={(e): void => set(kind, Number(e.currentTarget.value))}
              onDoubleClick={(): void => set(kind, toSlider(defaults[kind]))}
            />
            <span className={changed ? 'frequency-hud-threshold-value is-changed' : 'frequency-hud-threshold-value'}>{value}</span>
          </label>
        )
      })}
    </div>
  )
}

export type FrequencyHudProps = {
  /** Which onset bands can set off a beat, one per band in `ONSET_BANDS` order; a band that is off is drawn dimmed. */
  enabledBands: readonly boolean[]
  /** Called with the whole new selection when a band is clicked; the HUD shows it once it comes back as `enabledBands`. */
  onEnabledBandsChange: (enabledBands: boolean[]) => void
  /** The bars' height in units (90 by default, against the HUD's 180 wide); lower for a shorter HUD in a tight column. */
  barHeight?: number
  /**
   * With `onDrumThresholdsChange`, a slider under each drum light for how sure the drum model has to be to call it (0 to 100 on the slider,
   * 0 to 1 here). Without them, no sliders.
   */
  drumThresholds?: DrumThresholds
  /** Called with all four thresholds when a slider moves; the slider shows it once it comes back as `drumThresholds`. */
  onDrumThresholdsChange?: (thresholds: DrumThresholds) => void
}

export const FrequencyHud = ({
  enabledBands, onEnabledBandsChange, barHeight = DEFAULT_BAR_HEIGHT, drumThresholds, onDrumThresholdsChange,
}: FrequencyHudProps): React.ReactElement => {
  const { source, ticker, hint } = useHud()
  const layout = frequencyLayout(barHeight)
  const { barAreaH, bandsH, height } = layout
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
    const resolution = trackCanvasResolution(canvas, W, height)

    const draw = (): void => {
      resolution.apply(ctx)
      ctx.clearRect(0, 0, W, height)

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
        roundRect(ctx, x, 0, BAR_W, barAreaH, RADIUS)

        // Energy fill — gradient bottom to top
        const fillH = Math.round(energy * barAreaH)
        if (fillH > 0) {
          const grad = ctx.createLinearGradient(0, barAreaH - fillH, 0, barAreaH)
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
          roundRect(ctx, x, barAreaH - fillH, BAR_W, fillH, RADIUS)
        }

        // Trigger notch: the level the band has to pass to count as a hit (only when enabled)
        if (enabled && avg > 0) {
          const avgY = barAreaH - Math.round(avg * barAreaH)
          ctx.fillStyle = 'rgba(255,255,255,0.25)'
          ctx.fillRect(x, avgY, BAR_W, 1)
        }

        // Hit flash
        if (enabled && peakVal > 0.01 && fillH > 0) {
          const flashH = Math.max(3, Math.round(peakVal * 10))
          const flashY = barAreaH - fillH
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
        ctx.fillText(LABELS[i] ?? '', x + BAR_W / 2, bandsH - 2)
      }

      drawInstrumentLights(ctx, layout, source, now)
      drawRiserMeter(ctx, layout, source, riserMeter, now)
    }

    const unsubscribe = ticker(draw, canvas)
    return (): void => {
      resolution.stop()
      unsubscribe()
    }
  }, [source, ticker, barHeight])

  // The band under the pointer, or null between bands' ends or on the instrument row below the labels (which toggles nothing).
  const bandAt = useCallback((e: React.MouseEvent<HTMLCanvasElement>): number | null => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (((e.clientY - rect.top) / rect.height) * height > bandsH) return null
    const band = Math.floor((((e.clientX - rect.left) / rect.width) * W) / (BAR_W + GAP))
    return band >= 0 && band < VISIBLE_BANDS ? band : null
  }, [height, bandsH])

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
          height={height}
          className='frequency-hud-canvas'
          onClick={handleClick}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        />
        {drumThresholds && onDrumThresholdsChange && <DrumThresholdSliders thresholds={drumThresholds} onChange={onDrumThresholdsChange} />}
      </div>
    </div>
  )
}
