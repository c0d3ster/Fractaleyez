import React, { useSyncExternalStore } from 'react'

import { getLongPressRing, subscribeLongPressRing } from '../../input/longPressMenu'
import { LONG_PRESS_MS } from './longPress'

// Hidden for the first part of the hold so an ordinary tap never flashes a ring; it then fills over the rest of LONG_PRESS_MS.
const RING_DELAY_MS = 150
const RADIUS = 42
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** The ring that fills around the finger during a long-press on the visual (docs/mobile-design/NoneSwipe.html). */
export const LongPressRing = (): React.ReactElement | null => {
  const ring = useSyncExternalStore(subscribeLongPressRing, getLongPressRing, getLongPressRing)
  if (!ring) return null
  const style = {
    left: ring.x,
    top: ring.y,
    '--long-press-delay': `${RING_DELAY_MS}ms`,
    '--long-press-fill': `${LONG_PRESS_MS - RING_DELAY_MS}ms`,
    '--long-press-circumference': CIRCUMFERENCE,
  } as React.CSSProperties
  // Keyed on the press so a new press restarts the animation.
  return (
    <div key={ring.startedAt} className='long-press-ring' style={style} aria-hidden='true'>
      <svg width='96' height='96' viewBox='0 0 96 96'>
        <circle className='long-press-ring__track' cx='48' cy='48' r={RADIUS} />
        <circle className='long-press-ring__fill' cx='48' cy='48' r={RADIUS} strokeDasharray={CIRCUMFERENCE} transform='rotate(-90 48 48)' />
      </svg>
      <div className='long-press-ring__finger' />
    </div>
  )
}
