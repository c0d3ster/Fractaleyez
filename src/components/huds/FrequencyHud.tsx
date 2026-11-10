import React, { useRef, useEffect, useState, useCallback } from 'react'
import './FrequencyHud.css'

import { connectConfigActions } from '../config/context/ConfigProvider'
import { useInfo } from '../config/info/info'
import { UserSettings } from '../../config/userSettings.config'
import { DRUM_CENTER_HZ, DRUM_KINDS } from '../../audioanalysis/drum-hits'
import { DEFAULT_ENABLED_BANDS, ONSET_BANDS, isValidBandSelection } from '../../audioanalysis/onset-bands'
import { subscribeUiTick } from '../../utils/uiTicker'
import { bandColor } from './bandColors'

const VISIBLE_BANDS = ONSET_BANDS.length
const LABELS = ONSET_BANDS.map(({ label }) => label)
// A bar's top is a bit above the band's recent loudness, so a hit that is the loudest in a while nearly fills it.
const BAR_HEADROOM = 1.1
// How long a band's bar flashes after it sets off a beat.
const HIT_FLASH_MS = 250

// The visualizer lives in the main window; a popped-out config window reads it through window.opener.
const mainWindow = (): Window => window.opener ?? window
const W = 180
const LABEL_H = 14
const BAR_AREA_H = 90
// Below the labels, a light for each drum the hit classifier names (drum-hits.ts), at the frequency its hits sit at, and under them the
// riser meter (riser.ts), filling from left to right as the music rises.
const INSTRUMENT_ROW_H = 12
const RISER_ROW_H = 6
const BANDS_H = BAR_AREA_H + LABEL_H
const H = BANDS_H + INSTRUMENT_ROW_H + RISER_ROW_H
const GAP = 4
const BAR_W = Math.floor((W - (VISIBLE_BANDS - 1) * GAP) / VISIBLE_BANDS)  // 22px
const RADIUS = 3
const INSTRUMENT_DOT_R = 3
// How long an instrument's light takes to fade after a hit.
const INSTRUMENT_FLASH_MS = 180

// Where a frequency falls across the bars: in its band's column, at its place between the band's edges on a log scale (each band spans a
// few times its low edge, so the chart reads roughly as a log frequency axis).
const frequencyX = (hz: number): number => {
  const band = Math.max(0, ONSET_BANDS.findIndex((spec) => hz < spec.highHz))
  const { lowHz, highHz } = ONSET_BANDS[band] ?? { lowHz: 40, highHz: 150 }
  const within = Math.min(1, Math.max(0, Math.log(hz / lowHz) / Math.log(highHz / lowHz)))
  return band * (BAR_W + GAP) + within * BAR_W
}

const LIGHT_X = DRUM_KINDS.map((kind) => frequencyX(DRUM_CENTER_HZ[kind]))

const drawInstrumentLights = (ctx: CanvasRenderingContext2D, source: Window, now: number): void => {
  const y = BANDS_H + INSTRUMENT_ROW_H / 2
  const last = source.getDrumHits?.()
  DRUM_KINDS.forEach((kind, i) => {
    const hit = last?.[kind] ?? null
    const flash = hit === null ? 0 : Math.max(0, 1 - (now - hit) / INSTRUMENT_FLASH_MS)
    ctx.beginPath()
    ctx.arc(LIGHT_X[i] ?? 0, y, INSTRUMENT_DOT_R, 0, Math.PI * 2)
    ctx.fillStyle = flash > 0 ? `rgba(242, 242, 242, ${0.25 + flash * 0.75})` : '#333'
    ctx.fill()
  })
}

const drawRiserMeter = (ctx: CanvasRenderingContext2D, source: Window): void => {
  const score = Math.min(1, Math.max(0, source.getRiser?.() ?? 0))
  const y = BANDS_H + INSTRUMENT_ROW_H + 1
  const h = RISER_ROW_H - 3
  ctx.fillStyle = '#1a1a1a'
  roundRect(ctx, 0, y, W, h, 1.5)
  if (score < 0.02) return
  ctx.fillStyle = `rgba(242, 242, 242, ${0.3 + score * 0.6})`
  roundRect(ctx, 0, y, W * score, h, 1.5)
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

type FrequencyHudProps = {
  userSettings: UserSettings | null
  updateUserSettings: (patch: Partial<UserSettings>) => void
}

const FrequencyHudInner = ({ userSettings, updateUserSettings }: FrequencyHudProps): React.ReactElement => {
  const info = useInfo()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Persisted settings (loaded async from /api/me) take priority once they arrive; until then,
  // fall back to whatever the live global already holds (e.g. from an earlier session tab).
  const [enabledBands, setEnabledBands] = useState<boolean[]>(() =>
    (userSettings?.hud?.enabledFreqBands ?? window.enabledFreqBands ?? DEFAULT_ENABLED_BANDS).slice(0, VISIBLE_BANDS)
  )
  const enabledBandsRef = useRef(enabledBands)
  const hoveredBandRef = useRef<number | null>(null)
  const appliedPersistedRef = useRef(false)

  // One-time sync once the persisted setting actually loads (it arrives after this component's
  // initial mount, since /api/me is fetched async) -- doesn't refire on every settings patch,
  // otherwise a locally-driven toggle below would get overwritten by its own stale closure.
  useEffect(() => {
    if (appliedPersistedRef.current) return
    const persisted = userSettings?.hud?.enabledFreqBands
    if (!persisted || !isValidBandSelection(persisted)) return
    appliedPersistedRef.current = true
    const next = persisted.slice(0, VISIBLE_BANDS)
    enabledBandsRef.current = next
    setEnabledBands(next)
  }, [userSettings])

  const toggleBand = useCallback((i: number) => {
    setEnabledBands(prev => {
      const next = prev.map((v, idx) => idx === i ? !v : v)
      enabledBandsRef.current = next
      // Sync to global: visible bands toggle, hidden high bands stay false
      if (window.enabledFreqBands) {
        next.forEach((v, idx) => { window.enabledFreqBands![idx] = v })
      }
      updateUserSettings({ hud: { enabledFreqBands: next } })
      return next
    })
  }, [updateUserSettings])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = (): void => {
      ctx.clearRect(0, 0, W, H)

      // The bars show the same bands the beat detector listens to: level, the level a hit had to pass, and a flash
      // on the band that actually set off a beat.
      const timeline = mainWindow().getBeatTimeline?.()
      const samples = timeline?.samples ?? []
      const latest = samples[samples.length - 1]
      // The timeline's clock is the main window's, so flashes age against that and keep fading if sampling stops.
      const now = mainWindow().performance.now()
      // Newest first, so the first hit seen on a band is its last one, and nothing older than the flash can matter.
      const flashes = LABELS.map(() => 0)
      for (let i = samples.length - 1; i >= 0; i--) {
        const sample = samples[i]!
        if (now - sample.t > HIT_FLASH_MS) break
        const { beatBand } = sample
        if (beatBand !== null && flashes[beatBand] === 0) flashes[beatBand] = Math.max(0, 1 - (now - sample.t) / HIT_FLASH_MS)
      }

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

      drawInstrumentLights(ctx, mainWindow(), now)
      drawRiserMeter(ctx, mainWindow())
    }

    return subscribeUiTick(draw, canvas)
  }, [])

  // The band under the pointer, or null between bands' ends or on the instrument row below the labels (which toggles nothing).
  const bandAt = useCallback((e: React.MouseEvent<HTMLCanvasElement>): number | null => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (((e.clientY - rect.top) / rect.height) * H > BANDS_H) return null
    const band = Math.floor((((e.clientX - rect.left) / rect.width) * W) / (BAR_W + GAP))
    return band >= 0 && band < VISIBLE_BANDS ? band : null
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    // Touch has no hover; tracking it would leave the band highlighted after a tap.
    if (e.pointerType !== 'mouse') return
    hoveredBandRef.current = bandAt(e)
  }, [bandAt])

  const handlePointerLeave = useCallback(() => {
    hoveredBandRef.current = null
  }, [])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const band = bandAt(e)
    if (band !== null) toggleBand(band)
  }, [bandAt, toggleBand])

  return (
    <div className='frequency-hud-wrapper' {...info('Click a band to choose whether it can set off a beat. The bass band (the kick) and the hi band (snare and clap) are on by default. The lights below flash on each hit the drum classifier calls a kick, a snare, a clap or hats, each placed at the frequency its hits sit at; Auto reads a snare roll from the snare and the clap. The bar under them fills as the music rises (a riser or a sweep).')}>
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

export const FrequencyHud = connectConfigActions(FrequencyHudInner)
