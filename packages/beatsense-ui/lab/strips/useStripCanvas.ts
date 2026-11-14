import { useEffect, useRef, useState, type RefObject } from 'react'

import type { Ticker } from 'beatsense-ui'

export type StripDraw = (ctx: CanvasRenderingContext2D, width: number) => void

/**
 * A canvas `height` CSS px tall and as wide as its wrapper, drawn by `draw` on every tick of `ticker` (the HUDs' ticker, so the strips
 * move with them) and sharp at the device's pixel ratio. Returns the wrapper's and the canvas's refs.
 */
export const useStripCanvas = (
  ticker: Ticker, height: number, draw: StripDraw,
): { wrapperRef: RefObject<HTMLDivElement>; canvasRef: RefObject<HTMLCanvasElement> } => {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry?.contentRect.width ?? 0)))
    observer.observe(wrapper)
    return (): void => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || width === 0) return undefined
    const tick = (): void => {
      const ratio = window.devicePixelRatio || 1
      const w = Math.round(width * ratio)
      const h = Math.round(height * ratio)
      // Only on a change: setting the size clears the canvas and its state.
      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.clearRect(0, 0, width, height)
      draw(ctx, width)
    }
    tick()
    return ticker(tick, canvas)
  }, [ticker, width, height, draw])

  return { wrapperRef, canvasRef }
}
