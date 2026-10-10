import { RefObject, useEffect, useRef, useState } from 'react'

import { userConfig } from '../../config/user.config'
import { RADIUS } from './kaleidoscopeGalaxy'

/** Main app window when config runs in a popup; otherwise `window`. The beat timeline lives there. */
const mainWindow = (): Window => window.opener ?? window

// How fast a beat's kick dies away.
const PULSE_DECAY_SECONDS = 0.18
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

type MotionSettings = {
  rotationSpeed: number
  effects: MotionEffects
}

export type GalaxyMotion = {
  /** The inside and outside of the galaxy; they turn opposite ways when Cyclone is on. */
  inner: RefObject<SVGGElement>
  outer: RefObject<SVGGElement>
  /** Everything that pulls back on a beat when Wob Wob is on. */
  wob: RefObject<SVGGElement>
  ring: RefObject<SVGCircleElement>
  core: RefObject<SVGCircleElement>
  /** Beats seen while Color Shift or Switcheroo is on; odd or even picks which shape is showing, and the count seeds where Color Shift puts the colors. */
  beats: number
}

/** The time of the latest beat the detector has fired, or null if it has fired none lately. */
const latestBeatTime = (): number | null => {
  const samples = mainWindow().getBeatTimeline?.().samples ?? []
  for (let i = samples.length - 1; i >= 0; i--) {
    const sample = samples[i]
    if (sample && sample.beatBand !== null) return sample.t
  }
  return null
}

/**
 * Brings the galaxy to life the way the real effects behave: it turns at the Rotation rate (Cyclone sends the outside
 * the other way), pulls back on a beat (Wob Wob), swells its core (Glow), sends a ring out (Shockwave), and counts beats
 * so the caller can move the colors around (Color Shift) or swap shapes (Switcheroo). Beats come from the same detector the visualizers
 * use. The effects do not depend on the kaleidoscope, so it runs whether that is on or off. Motion is written straight
 * onto the elements, not through state, so it costs no re-renders; it all holds still if the user has asked for less motion.
 */
export const useGalaxyMotion = (settings: MotionSettings): GalaxyMotion => {
  const inner = useRef<SVGGElement>(null)
  const outer = useRef<SVGGElement>(null)
  const wob = useRef<SVGGElement>(null)
  const ring = useRef<SVGCircleElement>(null)
  const core = useRef<SVGCircleElement>(null)
  const [beats, setBeats] = useState(0)
  // The loop reads the latest settings from here, so changing one does not restart it or lose where the galaxy has turned to.
  const latest = useRef(settings)
  const angles = useRef({ inner: 0, outer: 0 })
  const lastBeat = useRef<number | null | undefined>(undefined)

  useEffect(() => {
    latest.current = settings
  })

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    let previous = performance.now()
    let pulse = 0
    let ringAge = Infinity
    let frame = 0

    const tick = (now: number): void => {
      const seconds = (now - previous) / 1000
      previous = now
      const { rotationSpeed, effects } = latest.current

      const beatTime = latestBeatTime()
      // Beats from before the dial started listening do not count.
      if (lastBeat.current === undefined) lastBeat.current = beatTime
      if (beatTime !== null && beatTime !== lastBeat.current) {
        lastBeat.current = beatTime
        pulse = 1
        ringAge = 0
        if (effects.colorShift || effects.switcheroo) setBeats((count) => count + 1)
      }
      pulse *= Math.exp(-seconds / PULSE_DECAY_SECONDS)
      ringAge += seconds

      const degrees = rotationSpeed * userConfig.rotationSpeed_RAD_PER_SEC_PER_UNIT * (180 / Math.PI) * seconds
      angles.current.inner = (angles.current.inner + degrees) % 360
      angles.current.outer = (angles.current.outer + (effects.cyclone ? -degrees : degrees)) % 360
      inner.current?.setAttribute('transform', `rotate(${angles.current.inner.toFixed(2)})`)
      outer.current?.setAttribute('transform', `rotate(${angles.current.outer.toFixed(2)})`)
      wob.current?.setAttribute('transform', `scale(${(1 - (effects.wobWob ? WOB_DEPTH * pulse : 0)).toFixed(3)})`)
      core.current?.setAttribute('transform', `scale(${(1 + (effects.glow ? CORE_SWELL * pulse : 0)).toFixed(3)})`)

      const progress = ringAge / RING_SECONDS
      const showRing = effects.shockwave && progress < 1
      // Eased out, so it bursts off the rim and slows as it fades, like a pressure wave.
      const travelled = 1 - (1 - Math.min(1, progress)) ** 2
      ring.current?.setAttribute('r', (RING_START_RADIUS + RING_TRAVEL * travelled).toFixed(2))
      ring.current?.setAttribute('stroke-opacity', (showRing ? RING_OPACITY * (1 - progress) : 0).toFixed(3))

      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      // Settle the beat effects back to rest; the galaxy keeps the angle it has turned to.
      wob.current?.setAttribute('transform', 'scale(1)')
      core.current?.setAttribute('transform', 'scale(1)')
      ring.current?.setAttribute('stroke-opacity', '0')
    }
  }, [])

  return { inner, outer, wob, ring, core, beats }
}
