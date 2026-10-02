import React, { useRef, useEffect, useState, useCallback } from 'react'
import './FrequencyHud.css'

import { connectConfig } from '../config/context/ConfigProvider'
import { UserSettings } from '../../config/userSettings.config'

const VISIBLE_BANDS = 7
const LABELS = ['sub', 'bass', 'lo', 'mid', 'hi', 'pre', 'bri']
const W = 180
const LABEL_H = 14
const BAR_AREA_H = 90
const H = BAR_AREA_H + LABEL_H
const GAP = 4
const BAR_W = Math.floor((W - (VISIBLE_BANDS - 1) * GAP) / VISIBLE_BANDS)  // 22px
const RADIUS = 3
const DRAW_INTERVAL_MS = 33

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
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  // Persisted settings (loaded async from /api/me) take priority once they arrive; until then,
  // fall back to whatever the live global already holds (e.g. from an earlier session tab).
  const [enabledBands, setEnabledBands] = useState<boolean[]>(() =>
    (userSettings?.hud?.enabledFreqBands ?? window.enabledFreqBands ?? [true, true, true, true, true, false, false, false]).slice(0, VISIBLE_BANDS)
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
    if (!persisted) return
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

    let lastDrawAt = 0
    const draw = (): void => {
      rafRef.current = requestAnimationFrame(draw)
      // This runs on the visualizer's main thread, so a full redraw every frame (240 times a second on a
      // fast monitor) competes with rendering and the video texture upload.
      const now = performance.now()
      if (now - lastDrawAt < DRAW_INTERVAL_MS) return
      lastDrawAt = now
      ctx.clearRect(0, 0, W, H)

      const audio = window.getAudioData?.()

      for (let i = 0; i < VISIBLE_BANDS; i++) {
        const x = i * (BAR_W + GAP)
        const enabled = enabledBandsRef.current[i] ?? true
        const hovered = hoveredBandRef.current === i
        const energy = Math.min(1, (audio?.multibandEnergy?.[i] ?? 0) / 255)
        const avg = Math.min(1, (audio?.multibandEnergyAverage?.[i] ?? 0) / 255)
        const peakVal = (enabled ? audio?.multibandPeak?.[i]?.value : 0) ?? 0

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
            grad.addColorStop(0, 'rgba(68, 170, 255, 0.45)')
            grad.addColorStop(1, 'rgba(17, 51, 102, 0.45)')
          } else if (!enabled) {
            grad.addColorStop(0, '#222')
            grad.addColorStop(1, '#111')
          } else if (peakVal > 0.1) {
            grad.addColorStop(0, `rgba(220, 235, 255, ${0.7 + peakVal * 0.3})`)
            grad.addColorStop(0.4, `rgba(80, 160, 255, ${0.8 + peakVal * 0.2})`)
            grad.addColorStop(1, '#0a1a33')
          } else {
            grad.addColorStop(0, '#4af')
            grad.addColorStop(1, '#136')
          }
          ctx.fillStyle = grad
          roundRect(ctx, x, BAR_AREA_H - fillH, BAR_W, fillH, RADIUS)
        }

        // Average notch (only when enabled)
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
          ctx.fillStyle = `rgba(180, 210, 255, ${0.5 + peakVal * 0.5})`
        } else {
          ctx.fillStyle = '#444'
        }
        ctx.font = '9px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(LABELS[i] ?? '', x + BAR_W / 2, H - 2)
      }
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  const bandAt = useCallback((e: React.MouseEvent<HTMLCanvasElement>): number | null => {
    const rect = e.currentTarget.getBoundingClientRect()
    const band = Math.floor((((e.clientX - rect.left) / rect.width) * W) / (BAR_W + GAP))
    return band >= 0 && band < VISIBLE_BANDS ? band : null
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    hoveredBandRef.current = bandAt(e)
  }, [bandAt])

  const handleMouseLeave = useCallback(() => {
    hoveredBandRef.current = null
  }, [])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    const band = Math.floor(x / (BAR_W + GAP))
    if (band >= 0 && band < VISIBLE_BANDS) toggleBand(band)
  }, [toggleBand])

  return (
    <div className='frequency-hud-wrapper'>
      <span className='frequency-hud-label'>Frequency</span>
      <div className='frequency-hud'>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className='frequency-hud-canvas'
          onClick={handleClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
      </div>
      <span className='frequency-hud-hint'>click to toggle</span>
    </div>
  )
}

export const FrequencyHud = connectConfig(FrequencyHudInner)
