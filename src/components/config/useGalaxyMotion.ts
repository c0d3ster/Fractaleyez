import { RefObject, useEffect, useRef, useState } from 'react'

import { userConfig } from '../../config/user.config'
import { RADIUS } from './kaleidoscopeGalaxy'

/** Main app window when config runs in a popup; otherwise `window`. The beat detector lives there. */
const mainWindow = (): Window => window.opener ?? window

// How fast a beat's kick dies away.
const PULSE_DECAY_SECONDS = 0.18
// Below this the kick is gone and the effects settle back to rest.
const PULSE_FLOOR = 0.002
// Wob Wob: how far the galaxy pulls back on a beat (a fraction of its size).
const WOB_DEPTH = 0.09
// Glow: how much the core's light swells on a beat.
const CORE_SWELL = 0.6
// Shockwave: a ring leaves the dial's rim on a beat and runs out this far past it (the dial leaves room for it).
const RING_SECONDS = 0.55
const RING_OPACITY = 0.95
const RING_START_RADIUS = RADIUS + 1
const RING_TRAVEL = 6

export type MotionEffects = {
  cyclone: boolean
  wobWob: boolean
  switcheroo: boolean
  colorShift: boolean
  shockwave: boolean
  glow: boolean
}

export type EffectKey = keyof MotionEffects

/** The effects in the order the Effects section lists them. */
export const EFFECT_KEYS: readonly EffectKey[] = ['cyclone', 'wobWob', 'switcheroo', 'colorShift', 'glow', 'shockwave']

type MotionSettings = {
  rotationSpeed: number
  effects: MotionEffects
  /** Called on every beat, for things outside the galaxy that want to react (it does no rendering of its own). */
  onBeat?: () => void
}

export type GalaxyMotion = {
  /** The dial itself; the motion pauses while it is off screen. */
  root: RefObject<HTMLDivElement>
  /** The inside and outside of the galaxy, each its own layer so turning it never repaints it; they turn opposite ways when Cyclone is on. */
  inner: RefObject<SVGSVGElement>
  outer: RefObject<SVGSVGElement>
  /** Wraps both layers; everything that pulls back on a beat when Wob Wob is on. */
  wob: RefObject<HTMLDivElement>
  ring: RefObject<SVGCircleElement>
  core: RefObject<SVGCircleElement>
  /** Beats seen while Color Shift or Switcheroo is on; odd or even picks which shape is showing, and the count seeds where Color Shift puts the colors. */
  beats: number
}

/**
 * Brings the galaxy to life the way the real effects behave: it turns at the Rotation rate (Cyclone sends the outside
 * the other way), pulls back on a beat (Wob Wob), swells its core (Glow), sends a ring out (Shockwave), and counts beats
 * so the caller can move the colors around (Color Shift) or swap shapes (Switcheroo). Beats come from the same detector the visualizers
 * use. The effects do not depend on the kaleidoscope, so it runs whether that is on or off.
 *
 * The config window shares a thread with the visualizer, so this keeps its cost down: motion is written straight onto
 * the elements (no re-renders) and only when a value has changed, turning and pulling back are plain transforms on
 * layers the browser can move without repainting, and the loop stops altogether while the dial is off screen, the
 * panel is collapsed or the tab is hidden. It holds still if the user has asked for less motion.
 */
export const useGalaxyMotion = (settings: MotionSettings): GalaxyMotion => {
  const root = useRef<HTMLDivElement>(null)
  const inner = useRef<SVGSVGElement>(null)
  const outer = useRef<SVGSVGElement>(null)
  const wob = useRef<HTMLDivElement>(null)
  const ring = useRef<SVGCircleElement>(null)
  const core = useRef<SVGCircleElement>(null)
  const [beats, setBeats] = useState(0)
  // The loop reads the latest settings from here, so changing one does not restart it or lose where the galaxy has turned to.
  const latest = useRef(settings)
  const angles = useRef({ inner: 0, outer: 0 })
  const lastBeat = useRef<number | null>(null)

  useEffect(() => {
    latest.current = settings
  })

  useEffect(() => {
    const rootElement = root.current
    if (!rootElement) return undefined
    const doc = rootElement.ownerDocument
    const view = doc.defaultView ?? window
    if (view.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined

    let previous = performance.now()
    let pulse = 0
    let ringAge = Infinity
    let frame = 0
    let onScreen = false
    // What each element currently shows, so an unchanged value costs no DOM write.
    const shown = { inner: '', outer: '', wob: '', core: '', ringRadius: '', ringOpacity: '' }

    const tick = (now: number): void => {
      const seconds = (now - previous) / 1000
      previous = now
      const { rotationSpeed, effects, onBeat } = latest.current

      const beatTime = mainWindow().getLastBeatTime?.() ?? null
      if (beatTime !== null && beatTime !== lastBeat.current) {
        lastBeat.current = beatTime
        pulse = 1
        ringAge = 0
        onBeat?.()
        if (effects.colorShift || effects.switcheroo) setBeats((count) => count + 1)
      }
      pulse = pulse > PULSE_FLOOR ? pulse * Math.exp(-seconds / PULSE_DECAY_SECONDS) : 0
      ringAge += seconds

      const degrees = rotationSpeed * userConfig.rotationSpeed_RAD_PER_SEC_PER_UNIT * (180 / Math.PI) * seconds
      angles.current.inner = (angles.current.inner + degrees) % 360
      angles.current.outer = (angles.current.outer + (effects.cyclone ? -degrees : degrees)) % 360
      const innerValue = `rotate(${angles.current.inner.toFixed(2)}deg)`
      if (inner.current && innerValue !== shown.inner) inner.current.style.transform = shown.inner = innerValue
      const outerValue = `rotate(${angles.current.outer.toFixed(2)}deg)`
      if (outer.current && outerValue !== shown.outer) outer.current.style.transform = shown.outer = outerValue
      const wobValue = `scale(${(1 - (effects.wobWob ? WOB_DEPTH * pulse : 0)).toFixed(3)})`
      if (wob.current && wobValue !== shown.wob) wob.current.style.transform = shown.wob = wobValue
      const coreValue = `scale(${(1 + (effects.glow ? CORE_SWELL * pulse : 0)).toFixed(3)})`
      if (core.current && coreValue !== shown.core) core.current.setAttribute('transform', shown.core = coreValue)

      const progress = ringAge / RING_SECONDS
      const showRing = effects.shockwave && progress < 1
      // Eased out, so it bursts off the rim and slows as it fades, like a pressure wave.
      const travelled = 1 - (1 - Math.min(1, progress)) ** 2
      const ringRadius = (RING_START_RADIUS + RING_TRAVEL * travelled).toFixed(2)
      const ringOpacity = (showRing ? RING_OPACITY * (1 - progress) : 0).toFixed(3)
      if (ring.current && ringRadius !== shown.ringRadius) ring.current.setAttribute('r', shown.ringRadius = ringRadius)
      if (ring.current && ringOpacity !== shown.ringOpacity) ring.current.setAttribute('stroke-opacity', shown.ringOpacity = ringOpacity)

      frame = requestAnimationFrame(tick)
    }

    const start = (): void => {
      if (frame !== 0) return
      previous = performance.now()
      // Beats that landed while it was paused are not replayed.
      lastBeat.current = mainWindow().getLastBeatTime?.() ?? null
      frame = requestAnimationFrame(tick)
    }
    const stop = (): void => {
      cancelAnimationFrame(frame)
      frame = 0
    }
    const sync = (): void => (onScreen && !doc.hidden ? start() : stop())

    const observer = new view.IntersectionObserver((entries) => {
      onScreen = entries[entries.length - 1]?.isIntersecting ?? false
      sync()
    })
    observer.observe(rootElement)
    doc.addEventListener('visibilitychange', sync)

    return () => {
      observer.disconnect()
      doc.removeEventListener('visibilitychange', sync)
      stop()
      // Settle the beat effects back to rest; the galaxy keeps the angle it has turned to.
      if (wob.current) wob.current.style.transform = 'scale(1)'
      core.current?.setAttribute('transform', 'scale(1)')
      ring.current?.setAttribute('stroke-opacity', '0')
    }
  }, [])

  return { root, inner, outer, wob, ring, core, beats }
}
