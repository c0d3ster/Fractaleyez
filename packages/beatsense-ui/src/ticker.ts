// What makes the HUDs draw: each one subscribes its draw function and is called on every tick until it unsubscribes.

export type TickListener = (now: number) => void

/**
 * Calls `listener` on each tick and returns the unsubscribe. `element` is what the HUD draws into, so a ticker can skip a HUD while it is
 * off screen; the default ticker ignores it.
 */
export type Ticker = (listener: TickListener, element?: Element) => () => void

type Subscription = { listener: TickListener }

const subscriptions = new Set<Subscription>()
let frame: number | null = null

const tick = (now: number): void => {
  frame = requestAnimationFrame(tick)
  subscriptions.forEach(({ listener }) => listener(now))
}

/** The default ticker: one shared requestAnimationFrame loop for every HUD subscribed, running only while one is. */
export const animationFrameTicker: Ticker = (listener) => {
  const subscription: Subscription = { listener }
  subscriptions.add(subscription)
  if (frame === null) frame = requestAnimationFrame(tick)
  return () => {
    subscriptions.delete(subscription)
    if (subscriptions.size > 0 || frame === null) return
    cancelAnimationFrame(frame)
    frame = null
  }
}
