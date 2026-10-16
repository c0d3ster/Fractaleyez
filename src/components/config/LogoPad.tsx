import React, { useCallback, useEffect, useRef, useState } from 'react'
import './LogoPad.css'

import { connectConfig, ConfigContextValue } from './context/ConfigProvider'
import { AppConfig } from '../../config/configDefaults'
import { logoConfig } from '../../config/logo.config'
import { Bounds, FULL_BOUNDS, loadOpaqueBounds } from '../../utils/opaqueBounds'
import { getResolvedSpriteUrl } from '../../utils/spriteCache'
import { focusSpot, hitTest, LogoPadState, LogoPadTarget, moveFocus, moveLogo, PadSize } from './logoPadGeometry'
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

const stateOf = ({ logo }: AppConfig): LogoPadState => ({
  x: logo.positionX.value,
  y: logo.positionY.value,
  focusX: logo.focusX.value,
  focusY: logo.focusY.value,
  size: logoConfig.baseHeightFraction * logo.size.value,
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
  const state = stateOf(config)
  const aspectRatio = screenAspectRatio()
  // The image frame includes any see-through margin; the bright box is the part you actually see on screen.
  const [visible, setVisible] = useState<Bounds>(FULL_BOUNDS)
  const [sprite = ''] = config.logo.sprite.value
  useEffect(() => {
    let current = true
    setVisible(FULL_BOUNDS)
    if (sprite) void loadOpaqueBounds(getResolvedSpriteUrl(sprite)).then((bounds) => { if (current) setVisible(bounds) })
    return () => { current = false }
  }, [sprite])
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

  const handleReset = useCallback((): void => {
    const { target } = firstPress.current
    if (target === 'focus') resetItems(['focusX', 'focusY'])
    else if (target === 'logo') resetItems(['positionX', 'positionY'])
    else resetItems(['positionX', 'positionY', 'focusX', 'focusY'])
  }, [resetItems])

  const readouts = [`X ${format(state.x)}`, `Y ${format(state.y)}`, ...(zoomOn ? [`Zoom ${format(state.focusX)}, ${format(state.focusY)}`] : [])]

  return (
    <Pad
      label='Logo Position'
      aspectRatio={aspectRatio}
      onPick={handlePick}
      onReset={handleReset}
      readouts={readouts}
      hint={zoomOn ? 'drag the dot to aim the zoom, the square to move the logo, double-click to reset' : 'drag to move the logo, double-click to reset'}
    >
      <div className='logo-pad-crosshair logo-pad-crosshair--h' />
      <div className='logo-pad-crosshair logo-pad-crosshair--v' />
      <div className='logo-pad-logo' style={{ left: toPercent(state.x), top: toPercent(state.y), width: toPercent(state.size / aspectRatio), height: toPercent(state.size) }}>
        <div
          className='logo-pad-visible'
          style={{ left: toPercent(visible.left), top: toPercent(visible.top), width: toPercent(visible.right - visible.left), height: toPercent(visible.bottom - visible.top) }}
        />
        {zoomOn ? <div className='logo-pad-focus' style={{ left: toPercent(state.focusX), top: toPercent(state.focusY) }} /> : null}
      </div>
    </Pad>
  )
}

/** The pad for the logo's position on the screen and, with Zoom on, the zoom point in the image. */
export const LogoPad = connectConfig(LogoPadInner)
