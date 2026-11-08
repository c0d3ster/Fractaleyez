import { resolveColorState } from './colorState'
import { ColorFollower, DisplayedColor } from './colorTransition'
import { getParticleCrossfadeDurationMs } from './visualizer.config'

// One for the page, so the fractal and every particle generation show the same colors at the same moment.
const follower = new ColorFollower()
let started = false

/** Moves the shown colors toward the live Color config by `dtMs`. The layer pipeline calls it once per frame, before the layers draw. */
export const stepDisplayedColor = (dtMs: number): DisplayedColor => {
  started = true
  return follower.step(resolveColorState(window.config.color), dtMs, getParticleCrossfadeDurationMs())
}

/** The colors to draw with right now. Read it every frame: it is updated in place, and its `key` changes while the colors move. */
export const getDisplayedColor = (): DisplayedColor => (started ? follower.current() : stepDisplayedColor(0))
