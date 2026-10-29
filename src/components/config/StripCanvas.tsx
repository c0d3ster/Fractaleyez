import React, { useEffect, useRef } from 'react'

import { TAU } from './kaleidoscopeGalaxy'
import { paintGalaxy, paintStrips, StripAngles, StripFrame, StripScene } from './stripPainting'

// The strips are redrawn this often, so the popup only has a new frame to draw this many times a second whatever the strip count.
const STRIP_TICK_MS = 80
// Backing size of the canvases, in pixels: twice the dial's own size, so the stars stay crisp on a dense screen.
const CANVAS_SIZE = 320
// The longest a step may turn the galaxy, so a stalled timer (a background tab) does not make it jump.
const MAX_STEP_MS = 250

type StripCanvasProps = {
  scene: StripScene
  /** How many laps a second the inside turns (the outside too, or the other way when Cyclone is on); negative turns it counterclockwise. */
  lapsPerSecond: number
  cyclone: boolean
  /** How bright the haze is, from the glow and the galaxy's own opacity; the canvas blurs it as one picture. */
  hazeOpacity: number
  /** Drawing units from the dial's center to its edge. */
  viewHalf: number
}

/**
 * The kaleidoscope's strip modes drawn on two canvases, so every strip is shown but costs next to nothing: the galaxy is
 * painted once per tick, turned the way the dial turns it, and each strip is cut from that painting. The SVG strips each
 * keep their own spinning copy of the galaxy, which is dozens of animated panes the popup has to redraw every display frame.
 */
export const StripCanvas = ({ scene, lapsPerSecond, cyclone, hazeOpacity, viewHalf }: StripCanvasProps): React.ReactElement => {
  const hazeRef = useRef<HTMLCanvasElement>(null)
  const starsRef = useRef<HTMLCanvasElement>(null)
  // The latest props, so the timer never draws from a render that has been replaced.
  const latest = useRef({ scene, lapsPerSecond, cyclone })
  const angles = useRef<StripAngles>({ inner: 0, outer: 0 })
  const paint = useRef<() => void>(() => undefined)

  useEffect(() => {
    const hazeCanvas = hazeRef.current
    const starsCanvas = starsRef.current
    const hazeCtx = hazeCanvas?.getContext('2d')
    const starsCtx = starsCanvas?.getContext('2d')
    if (!hazeCanvas || !starsCanvas || !hazeCtx || !starsCtx) return undefined
    const doc = hazeCanvas.ownerDocument
    const view = doc.defaultView ?? window
    // The galaxy is painted onto these, off screen, and every strip is cut from them.
    const galaxyHaze = doc.createElement('canvas')
    const galaxyStars = doc.createElement('canvas')
    galaxyHaze.width = galaxyHaze.height = galaxyStars.width = galaxyStars.height = CANVAS_SIZE
    const galaxyHazeCtx = galaxyHaze.getContext('2d')
    const galaxyStarsCtx = galaxyStars.getContext('2d')
    // The strips' haze is put together here, then drawn blurred onto the visible canvas: blurred on the canvas it is soft
    // across the seams like one picture, and there is no CSS filter inside the layer the beats scale.
    const stripsHaze = doc.createElement('canvas')
    stripsHaze.width = stripsHaze.height = CANVAS_SIZE
    const stripsHazeCtx = stripsHaze.getContext('2d')
    if (!galaxyHazeCtx || !galaxyStarsCtx || !stripsHazeCtx) return undefined
    const frame: StripFrame = { size: CANVAS_SIZE, center: CANVAS_SIZE / 2, unit: CANVAS_SIZE / (viewHalf * 2) }

    paint.current = (): void => {
      const { scene: current } = latest.current
      paintGalaxy(galaxyHazeCtx, galaxyStarsCtx, current, angles.current, frame)
      paintStrips(stripsHazeCtx, galaxyHaze, current, frame, false)
      hazeCtx.clearRect(0, 0, frame.size, frame.size)
      hazeCtx.filter = `blur(${current.hazeBlur * frame.unit}px)`
      hazeCtx.drawImage(stripsHaze, 0, 0)
      hazeCtx.filter = 'none'
      paintStrips(starsCtx, galaxyStars, current, frame, true)
    }

    let last = view.performance.now()
    const tick = (): void => {
      const now = view.performance.now()
      const elapsed = Math.min(now - last, MAX_STEP_MS)
      last = now
      if (doc.hidden) return
      const turn = TAU * latest.current.lapsPerSecond * (elapsed / 1000)
      angles.current.inner += turn
      angles.current.outer += latest.current.cyclone ? -turn : turn
      paint.current()
    }
    const timer = view.setInterval(tick, STRIP_TICK_MS)
    paint.current()

    return () => {
      view.clearInterval(timer)
      paint.current = () => undefined
    }
  }, [viewHalf])

  // A beat, a color or a setting changed what is drawn: show it now instead of at the next tick.
  useEffect(() => {
    latest.current = { scene, lapsPerSecond, cyclone }
    paint.current()
  })

  return (
    <>
      <div className='kaleidoscope-dial-pane' style={{ opacity: hazeOpacity }}>
        <canvas ref={hazeRef} className='kaleidoscope-dial-pane' width={CANVAS_SIZE} height={CANVAS_SIZE} />
      </div>
      <div className='kaleidoscope-dial-pane'>
        <canvas ref={starsRef} className='kaleidoscope-dial-pane' width={CANVAS_SIZE} height={CANVAS_SIZE} />
      </div>
    </>
  )
}
