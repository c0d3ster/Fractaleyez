import React, { useEffect, useRef, useState } from 'react'

import { closesOnRelease, DRAG_START_PX, dragOffset } from './menuSheetState'
import './BottomSheet.css'

// The mobile shell's bottom sheet frame (docs/mobile-design/MenuHalf.html): fixed height, dark, rounded top, a grab handle, the
// content scrolling inside. It does not dim the visual. A drag down on its top past DRAG_CLOSE_PX, or a tap on the visual, closes
// it. The menu sheet uses it, and the account sheet (`#367`) can too.

/** How long the sheet takes to slide away (BottomSheet.css). */
export const SHEET_LEAVE_MS = 220

type BottomSheetProps = {
  open: boolean
  onClose: () => void
  label: string
  /** The sheet's top under the handle (a tab row, a back button): a drag down from here pulls the sheet. */
  head: React.ReactNode
  children: React.ReactNode
  className?: string
}

type Drag = { pointerId: number; startY: number; offset: number; active: boolean }

/** The pipeline's canvas: a tap there is a tap on the visual. Everything else (the badge, a dialog over the page) is not. */
const isVisual = (target: EventTarget | null): boolean => target instanceof HTMLCanvasElement && target.parentElement === document.body

export const BottomSheet = ({ open, onClose, label, head, children, className }: BottomSheetProps): React.ReactElement | null => {
  // Stays mounted while it slides away.
  const [mounted, setMounted] = useState(open)
  const sheetRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (open) {
      setMounted(true)
      // Reopened before it finished sliding away: drop the drag's leftover transform.
      if (sheetRef.current) sheetRef.current.style.transform = ''
      return undefined
    }
    const timer = window.setTimeout(() => setMounted(false), SHEET_LEAVE_MS)
    return () => window.clearTimeout(timer)
  }, [open])

  // A tap on the visual closes the sheet. It closes on the release, so the touch controller (paused while the menu is open) never
  // sees the press and the tap does not also steer.
  useEffect(() => {
    if (!open) return undefined
    const pressed = new Set<number>()
    const down = (event: PointerEvent): void => {
      if (isVisual(event.target)) pressed.add(event.pointerId)
    }
    const up = (event: PointerEvent): void => {
      if (pressed.delete(event.pointerId) && isVisual(event.target)) closeRef.current()
    }
    const cancel = (event: PointerEvent): void => { pressed.delete(event.pointerId) }
    const options = { capture: true, passive: true }
    document.addEventListener('pointerdown', down, options)
    document.addEventListener('pointerup', up, options)
    document.addEventListener('pointercancel', cancel, options)
    return () => {
      document.removeEventListener('pointerdown', down, options)
      document.removeEventListener('pointerup', up, options)
      document.removeEventListener('pointercancel', cancel, options)
    }
  }, [open])

  // The drag paints the sheet's transform itself, so a move re-renders nothing.
  const paint = (offset: number | null): void => {
    const sheet = sheetRef.current
    if (!sheet) return
    sheet.style.transform = offset === null ? '' : `translateY(${offset}px)`
    sheet.classList.toggle('bottom-sheet--dragging', offset !== null)
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (dragRef.current || (event.pointerType === 'mouse' && event.button !== 0)) return
    dragRef.current = { pointerId: event.pointerId, startY: event.clientY, offset: 0, active: false }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    drag.offset = dragOffset(drag.startY, event.clientY)
    if (!drag.active) {
      if (drag.offset < DRAG_START_PX) return
      // Captured only once it is a drag, so a tap on a pill still clicks the pill.
      drag.active = true
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    paint(drag.offset)
  }

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    if (!drag.active) return
    if (event.type === 'pointerup' && closesOnRelease(drag.offset)) {
      // Slides on down from where the finger let go, rather than back up first.
      paint(null)
      if (sheetRef.current) sheetRef.current.style.transform = 'translateY(100%)'
      onClose()
      return
    }
    paint(null)
  }

  if (!open && !mounted) return null
  return (
    <div
      ref={sheetRef}
      className={`bottom-sheet${className ? ` ${className}` : ''}`}
      role='dialog'
      aria-label={label}
      data-bottom-sheet={open ? 'open' : 'closing'}
    >
      <div
        className='bottom-sheet__head'
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <div className='bottom-sheet__handle' aria-hidden='true' />
        {head}
      </div>
      <div className='bottom-sheet__body'>{children}</div>
    </div>
  )
}
