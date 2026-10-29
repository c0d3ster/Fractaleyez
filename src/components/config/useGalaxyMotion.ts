import { RefObject, useEffect, useRef, useState } from 'react'

import { userConfig } from '../../config/user.config'
import { RADIUS } from './kaleidoscopeGalaxy'

/** Main app window when config runs in a popup; otherwise `window`. The beat detector lives there. */
const mainWindow = (): Window => window.opener ?? window

// How fast a beat's kick dies away.
const KICK_DECAY_SECONDS = 0.18
// The kick is gone (under 0.2% of its size) after this long, and the effects are back at rest.
const KICK_SECONDS = 1.1
// Wob Wob: how far the galaxy pulls back on a beat (a fraction of its size).
const WOB_DEPTH = 0.09
// Glow: how much the core's light swells on a beat.
const CORE_SWELL = 0.6
// Shockwave: a ring leaves the dial's rim on a beat and runs out this far past it (the dial leaves room for it).
const RING_SECONDS = 0.55
const RING_OPACITY = 0.95
const RING_START_RADIUS = RADIUS + 1
const RING_TRAVEL = 6
/** The ring is drawn at the size it ends at and scaled up from `RING_START_SCALE`, so it is a transform the browser can run off the main thread. */
export const RING_END_RADIUS = RING_START_RADIUS + RING_TRAVEL
const RING_START_SCALE = RING_START_RADIUS / RING_END_RADIUS

// The galaxy turns as one endless animation of this length per lap, sped up or slowed down by its playback rate. Turning
// the other way is the animation's direction, not a negative rate: the browser will not run a reversed animation off the main thread.
const SPIN_LAP_MS = 1000
/** Laps a second at a Rotation of 1, for anything that turns with the galaxy but is not driven by this hook. */
export const LAPS_PER_SEC_PER_UNIT = userConfig.rotationSpeed_RAD_PER_SEC_PER_UNIT / (2 * Math.PI)

// Everything here moves in steps: the pop-out window sharing the GPU with the video makes the video stutter in proportion
// to how often it has a new frame to draw, and an animation running smoothly gives it one on every display frame. The
// galaxy turns in this many updates a second (more steps a lap the slower it turns, so a slow spin is not a ticking hand),
// and a kick plays in the few steps below.
const STEPPED_UPDATES_PER_SEC = 12
const MIN_STEPS_PER_LAP = 12
const MAX_STEPS_PER_LAP = 360
// Where along a kick its stepped version changes value: close together at the start, where the decay is quick.
const KICK_STEP_OFFSETS: readonly number[] = [0, 0.03, 0.06, 0.1, 0.15, 0.2, 0.3, 0.45, 0.65, 1]
const RING_STEPS = 6

/** The easing of the galaxy's endless turn, in steps so it only repaints when it has moved a visible amount. */
const spinEasing = (signedLaps: number): string => {
  const steps = signedLaps === 0 ? MIN_STEPS_PER_LAP : Math.round(STEPPED_UPDATES_PER_SEC / Math.abs(signedLaps))
  return `steps(${Math.max(MIN_STEPS_PER_LAP, Math.min(MAX_STEPS_PER_LAP, steps))})`
}

/** A kick drawn as a handful of held values along the same decay, for `value` given how much of the kick is left (1 down to 0). */
const steppedKick = (value: (remaining: number) => Keyframe): Keyframe[] =>
  KICK_STEP_OFFSETS.map((offset) => ({ ...value(Math.exp(-(offset * KICK_SECONDS) / KICK_DECAY_SECONDS)), offset, easing: 'step-end' }))

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
  /** The haze and the stars of the galaxy, each its own layer so turning it never repaints it; they turn opposite ways when Cyclone is on. Plain boxes around the drawing, because the browser only animates those off the main thread, never an svg element itself. */
  haze: RefObject<HTMLDivElement>
  stars: RefObject<HTMLDivElement>
  /** Wraps both layers; everything that pulls back on a beat when Wob Wob is on. */
  wob: RefObject<HTMLDivElement>
  /** The ring and the core are each a layer of their own for the same reason. */
  ring: RefObject<HTMLDivElement>
  core: RefObject<HTMLDivElement>
  /** Beats seen while Color Shift or Switcheroo is on; odd or even picks which shape is showing, and the count seeds where Color Shift puts the colors. */
  beats: number
}

/**
 * An animation built once and left finished, so it shows nothing until it is played. Replaying it on every beat costs next to
 * nothing, where building a new one (and finding the old ones to cancel) makes the browser work out styles on the spot.
 */
const preparedAnimation = (element: Element | null, keyframes: Keyframe[], options: KeyframeAnimationOptions): Animation | undefined => {
  const animation = element?.animate(keyframes, options)
  animation?.finish()
  return animation
}

/** Starts the animation over, even if the last beat's is still running. */
const replay = (animation: Animation | undefined): void => {
  if (!animation) return
  animation.currentTime = 0
  animation.play()
}

/**
 * Brings the galaxy to life the way the real effects behave: it turns at the Rotation rate (Cyclone sends the stars
 * the other way), pulls back on a beat (Wob Wob), swells its core (Glow), sends a ring out (Shockwave), and counts beats
 * so the caller can move the colors around (Color Shift) or swap shapes (Switcheroo). Beats come from the same detector the visualizers
 * use. The effects do not depend on the kaleidoscope, so it runs whether that is on or off.
 *
 * The config window shares a thread with the visualizer, so this keeps its cost down by never doing per-frame work in
 * JavaScript: the turning is one endless Web Animation per layer whose speed is its playback rate, and each beat starts
 * a short transform and opacity animation on layers of their own, which the browser runs off the main thread. The beat
 * arrives as a callback from the detector rather than being polled. Everything stops while the dial is off screen, the
 * panel is collapsed or the tab is hidden. It holds still if the user has asked for less motion, and follows that preference if it changes while the dial is open.
 */
export const useGalaxyMotion = (settings: MotionSettings): GalaxyMotion => {
  const root = useRef<HTMLDivElement>(null)
  const haze = useRef<HTMLDivElement>(null)
  const stars = useRef<HTMLDivElement>(null)
  const wob = useRef<HTMLDivElement>(null)
  const ring = useRef<HTMLDivElement>(null)
  const core = useRef<HTMLDivElement>(null)
  const [beats, setBeats] = useState(0)
  // The effect reads the latest settings from here, so changing one does not restart it or lose where the galaxy has turned to.
  const latest = useRef(settings)
  const spinners = useRef<{ haze?: Animation; stars?: Animation }>({})
  // The animations a beat plays, built the first time the dial shows.
  const kicks = useRef<{ wob?: Animation; core?: Animation; ringScale?: Animation; ringFade?: Animation }>({})
  // Whether the dial is showing; the turning waits while it is not, whatever the speed.
  const moving = useRef(false)

  useEffect(() => {
    latest.current = settings
  })

  // Speed is playback rate and direction is the animation's direction, set on the running animations, so the galaxy carries on from wherever it has turned to.
  const syncSpin = (): void => {
    const { rotationSpeed, effects } = latest.current
    const lapsPerSecond = rotationSpeed * LAPS_PER_SEC_PER_UNIT
    const apply = (animation: Animation | undefined, signedLaps: number): void => {
      if (!animation) return
      const reverse = signedLaps < 0
      const timing = animation.effect?.getTiming()
      if (timing && (timing.direction === 'reverse') !== reverse) {
        // Flipping direction mirrors the angle, so mirror the time too and the galaxy does not jump.
        const phase = (Number(animation.currentTime ?? 0) % SPIN_LAP_MS) / SPIN_LAP_MS
        animation.effect?.updateTiming({ direction: reverse ? 'reverse' : 'normal' })
        animation.currentTime = (1 - phase) * SPIN_LAP_MS
      }
      const rate = Math.abs(signedLaps)
      animation.effect?.updateTiming({ easing: spinEasing(signedLaps) })
      if (rate > 0) animation.updatePlaybackRate(rate)
      if (moving.current && rate > 0) animation.play()
      else animation.pause()
    }
    apply(spinners.current.haze, lapsPerSecond)
    apply(spinners.current.stars, effects.cyclone ? -lapsPerSecond : lapsPerSecond)
  }
  useEffect(syncSpin, [settings.rotationSpeed, settings.effects.cyclone])

  useEffect(() => {
    const rootElement = root.current
    if (!rootElement) return undefined
    const doc = rootElement.ownerDocument
    const view = doc.defaultView ?? window
    const motionQuery = view.matchMedia('(prefers-reduced-motion: reduce)')

    let onScreen = false
    let unsubscribe: (() => void) | undefined

    const startSpin = (element: HTMLDivElement | null): Animation | undefined =>
      element?.animate({ transform: ['rotate(0deg)', 'rotate(360deg)'] }, { duration: SPIN_LAP_MS, iterations: Infinity, easing: 'linear' })

    const prepareKicks = (): void => {
      // A kick is a handful of held values along its decay (a new frame only when one changes) instead of a curve.
      const wobKeyframes = steppedKick((remaining) => ({ transform: `scale(${1 - WOB_DEPTH * remaining})` }))
      const coreKeyframes = steppedKick((remaining) => ({ transform: `scale(${1 + CORE_SWELL * remaining})` }))
      const kickOptions: KeyframeAnimationOptions = { duration: KICK_SECONDS * 1000, easing: 'linear' }
      kicks.current.wob ??= preparedAnimation(wob.current, wobKeyframes, kickOptions)
      kicks.current.core ??= preparedAnimation(core.current, coreKeyframes, kickOptions)
      // Scale and opacity ease differently, so they are two animations on the same layer.
      kicks.current.ringScale ??= preparedAnimation(ring.current, [{ transform: `scale(${RING_START_SCALE})` }, { transform: 'scale(1)' }], { duration: RING_SECONDS * 1000, easing: `steps(${RING_STEPS})` })
      kicks.current.ringFade ??= preparedAnimation(ring.current, [{ opacity: RING_OPACITY }, { opacity: 0 }], { duration: RING_SECONDS * 1000, easing: `steps(${RING_STEPS})` })
    }

    const handleBeat = (): void => {
      const { effects, onBeat } = latest.current
      if (effects.wobWob) replay(kicks.current.wob)
      if (effects.glow) replay(kicks.current.core)
      if (effects.shockwave) {
        replay(kicks.current.ringScale)
        replay(kicks.current.ringFade)
      }
      onBeat?.()
      if (effects.colorShift || effects.switcheroo) setBeats((count) => count + 1)
    }

    const start = (): void => {
      moving.current = true
      prepareKicks()
      spinners.current.haze ??= startSpin(haze.current)
      spinners.current.stars ??= startSpin(stars.current)
      syncSpin()
      unsubscribe ??= mainWindow().subscribeBeat?.(handleBeat)
    }
    const stop = (): void => {
      moving.current = false
      unsubscribe?.()
      unsubscribe = undefined
      syncSpin()
    }
    // Back to rest, as when the hook unmounts; the galaxy keeps the angle it has turned to.
    const reset = (): void => {
      Object.values(kicks.current).forEach((animation) => animation.finish())
    }
    // Follows the preference live: a change to reduced motion stops the motion and settles the effects, and a change back resumes it.
    const sync = (): void => {
      if (motionQuery.matches) {
        stop()
        reset()
        return
      }
      if (onScreen && !doc.hidden) start()
      else stop()
    }

    const observer = new view.IntersectionObserver((entries) => {
      onScreen = entries[entries.length - 1]?.isIntersecting ?? false
      sync()
    })
    observer.observe(rootElement)
    doc.addEventListener('visibilitychange', sync)
    motionQuery.addEventListener('change', sync)

    return () => {
      observer.disconnect()
      doc.removeEventListener('visibilitychange', sync)
      motionQuery.removeEventListener('change', sync)
      stop()
      reset()
      spinners.current.haze?.cancel()
      spinners.current.stars?.cancel()
      spinners.current = {}
      Object.values(kicks.current).forEach((animation) => animation.cancel())
      kicks.current = {}
    }
  }, [])

  return { root, haze, stars, wob, ring, core, beats }
}
