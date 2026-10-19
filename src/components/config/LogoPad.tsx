import React, { useCallback, useEffect, useRef, useState } from 'react'
import './LogoPad.css'

import { connectConfig, ConfigContextValue } from './context/ConfigProvider'
import { AppConfig } from '../../config/configDefaults'
import { logoConfig } from '../../config/logo.config'
import { ImageShape, loadImageShape, SQUARE_SHAPE } from '../../utils/opaqueBounds'
import { getResolvedSpriteUrl } from '../../utils/spriteCache'
import { loadZoomFocus } from '../../utils/zoomFocus'
import { focusSpot, frameRect, hitTest, LogoPadState, LogoPadTarget, moveFocus, moveLogo, PadSize } from './logoPadGeometry'
import { Pad, PadPoint, screenAspectRatio } from './Pad'

type LogoPadProps = {
  config: AppConfig
  updateConfigItem: ConfigContextValue['updateConfigItem']
  resetConfigItem: ConfigContextValue['resetConfigItem']
}

type Grab = { target: LogoPadTarget, offset: { x: number, y: number } }

// The first press of a double-click already moves the logo (or the dot) to the pointer, so by the time the double-click
// lands it is always over what it just moved. The reset goes by what the first press hit, and a press within this long
// of that one is the second half of the same double-click.
const DOUBLE_CLICK_MS = 500

const toPercent = (fraction: number): string => `${fraction * 100}%`
// Without the leading zero (.50, not 0.50), so the X, Y and Zoom readouts fit on one line.
const format = (value: number): string => value.toFixed(2).replace(/^0\./, '.')

const stateOf = ({ logo }: AppConfig, { bounds, aspect }: ImageShape): LogoPadState => ({
  x: logo.positionX.value,
  y: logo.positionY.value,
  focusX: logo.focusX.value,
  focusY: logo.focusY.value,
  size: logoConfig.baseHeightFraction * logo.size.value,
  aspect,
  bounds,
})

const sizeOf = ({ width, height }: PadPoint): PadSize => ({ width, height })

/**
 * Places the logo on the screen and, with Zoom on, picks the point of the image the zoom dives into. The big square
 * is the logo at its Size, the small dot inside it is the zoom point; drag the dot to move the zoom point, drag the
 * square (or empty pad) to move the logo. Double-click the dot, the square, or empty pad to reset the zoom point, the
 * position, or both.
 */
const LogoPadInner = ({ config, updateConfigItem, resetConfigItem }: LogoPadProps): React.ReactElement => {
  const grab = useRef<Grab>({ target: 'empty', offset: { x: 0, y: 0 } })
  const firstPress = useRef<{ at: number, target: LogoPadTarget }>({ at: 0, target: 'empty' })
  const aspectRatio = screenAspectRatio()
  // The image frame can have see-through margins, so the box drawn is the part you actually see on screen.
  const [shape, setShape] = useState<ImageShape>(SQUARE_SHAPE)
  const [sprite = ''] = config.logo.sprite.value
  useEffect(() => {
    let current = true
    setShape(SQUARE_SHAPE)
    if (sprite) void loadImageShape(getResolvedSpriteUrl(sprite)).then((loaded) => { if (current) setShape(loaded) })
    return () => { current = false }
  }, [sprite])
  const state = stateOf(config, shape)
  const zoomOn = config.logo.zoom.value

  const setValues = useCallback((values: Record<string, number>): void => {
    Object.entries(values).forEach(([item, value]) => updateConfigItem('logo', item, String(value)))
  }, [updateConfigItem])

  const handlePick = useCallback((point: PadPoint, phase: 'start' | 'move'): void => {
    const pad = sizeOf(point)
    if (phase === 'start') {
      const hit = hitTest(point, state, pad, zoomOn)
      const now = performance.now()
      if (now - firstPress.current.at > DOUBLE_CLICK_MS) firstPress.current = { at: now, target: hit }
      const anchor = hit === 'focus' ? focusSpot(state, pad) : { x: state.x, y: state.y }
      // A press on the logo or the dot keeps what was grabbed under the pointer; a press on empty pad snaps the logo's center to it.
      grab.current = {
        target: hit,
        offset: hit === 'empty' ? { x: 0, y: 0 } : { x: anchor.x - point.x, y: anchor.y - point.y },
      }
    }
    const { target, offset } = grab.current
    if (target === 'focus') {
      const focus = moveFocus(point, offset, state, pad)
      setValues({ focusX: focus.x, focusY: focus.y })
      return
    }
    const position = moveLogo(point, offset)
    setValues({ positionX: position.x, positionY: position.y })
  }, [state, zoomOn, setValues])

  const resetItems = useCallback((items: readonly string[]): void => {
    items.forEach((item) => resetConfigItem('logo', item))
  }, [resetConfigItem])

  // The zoom point goes back to what the image itself suggests, not to the middle of the frame.
  const handleReset = useCallback((): void => {
    const { target } = firstPress.current
    if (target !== 'focus') resetItems(['positionX', 'positionY'])
    if (target === 'logo' || !sprite) return
    void loadZoomFocus(getResolvedSpriteUrl(sprite)).then(({ x, y }) => setValues({ focusX: x, focusY: y }))
  }, [resetItems, setValues, sprite])

  const padSize: PadSize = { width: aspectRatio, height: 1 } // only the ratio matters for where things sit
  const frame = frameRect(state, padSize)
  const spriteUrl = sprite ? getResolvedSpriteUrl(sprite) : ''
  const silhouette = spriteUrl ? { maskImage: `url("${spriteUrl}")`, WebkitMaskImage: `url("${spriteUrl}")` } : undefined
  const dot = focusSpot(state, padSize)
  const readouts = [`X ${format(state.x)}`, `Y ${format(state.y)}`, ...(zoomOn ? [`Zoom ${format(state.focusX)}, ${format(state.focusY)}`] : [])]

  return (
    <Pad
      label='Logo Position'
      aspectRatio={aspectRatio}
      onPick={handlePick}
      onReset={handleReset}
      readouts={readouts}
      hint={zoomOn ? 'drag the dot to aim the zoom, the logo to move it, double-click to reset (the dot goes back to auto)' : 'drag to move the logo, double-click to reset'}
    >
      <div className='logo-pad-crosshair logo-pad-crosshair--h' />
      <div className='logo-pad-crosshair logo-pad-crosshair--v' />
      <div className='logo-pad-shape' style={{ left: toPercent(frame.left), top: toPercent(frame.top), width: toPercent(frame.width), height: toPercent(frame.height) }}>
        <div className='logo-pad-shape-fill' style={silhouette} />
      </div>
      {zoomOn ? <div className='logo-pad-focus' style={{ left: toPercent(dot.x), top: toPercent(dot.y) }} /> : null}
    </Pad>
  )
}

/** The pad for the logo's position on the screen and, with Zoom on, the zoom point in the image. */
export const LogoPad = connectConfig(LogoPadInner)
