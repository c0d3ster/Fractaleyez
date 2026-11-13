// What makes the HUDs draw: each one subscribes its draw function and is called on every tick until it unsubscribes.

export type TickListener = (now: number) => void

/**
 * Calls `listener` on each tick and returns the unsubscribe. `element` is what the HUD draws into, so a ticker can skip a HUD while it is
 * off screen; the default ticker ignores it.
 */
export type Ticker = (listener: TickListener, element?: Element) => () => void

type Subscription = { listener: TickListener }

// The default rate. Every HUD redraws on each tick, so following the display (240 times a second on a 240 Hz panel) costs many times what
// the eye needs; the Fractaleyez app ticks its HUDs at 10 to 20 a second.
const DEFAULT_TICKS_PER_SECOND = 30

/**
 * A ticker on one shared requestAnimationFrame loop for every HUD subscribed, running only while one is, that ticks at most
 * `ticksPerSecond` times a second (whatever the display's refresh rate).
 */
export const createFrameTicker = (ticksPerSecond: number): Ticker => {
  const subscriptions = new Set<Subscription>()
  const intervalMs = 1000 / ticksPerSecond
  let frame: number | null = null
  let lastTickAt = Number.NEGATIVE_INFINITY

  const loop = (now: number): void => {
    frame = requestAnimationFrame(loop)
    // A little early still counts, so a rate that divides the display's (30 on 60 or 120 Hz) does not skip every other tick to jitter.
    if (now - lastTickAt < intervalMs - 2) return
    lastTickAt = now
    subscriptions.forEach(({ listener }) => listener(now))
  }

  return (listener) => {
    const subscription: Subscription = { listener }
    subscriptions.add(subscription)
    if (frame === null) frame = requestAnimationFrame(loop)
    return () => {
      subscriptions.delete(subscription)
      if (subscriptions.size > 0 || frame === null) return
      cancelAnimationFrame(frame)
      frame = null
    }
  }
}

/** The default ticker: 30 ticks a second. */
export const animationFrameTicker: Ticker = createFrameTicker(DEFAULT_TICKS_PER_SECOND)
