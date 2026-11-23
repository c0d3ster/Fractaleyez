import React, { useCallback, useEffect, useRef, useState } from 'react'
import { usePreviewLocked } from './previewLock'
import { useUpgrade } from '../upgrade/UpgradeProvider'
import { PREMIUM_PREVIEW_MESSAGE } from '../../config/plans.config'
import '../upgrade/premiumOutline.css'
import './PreviewLockFrame.css'

type PreviewLockFrameProps = {
  children: React.ReactNode
  /** Elements that still answer a click while locked because they only show or hide config (the sidebar's section headers). */
  peekSelector?: string
  /** Called with the `peekSelector` element under a click while locked. */
  onPeek?: (element: HTMLElement) => void
}

// Controls inside a header (a layer's power, blend, order and reset buttons) change the config, so they stay locked.
const HEADER_CONTROLS = 'button, select, input'

const contains = (element: Element, x: number, y: number): boolean => {
  const { left, right, top, bottom } = element.getBoundingClientRect()
  return x >= left && x <= right && y >= top && y <= bottom
}

/** The `peekSelector` element under the pointer, unless a control inside it is. The locked body takes no pointer events, so the hit test is by position. */
const peekTargetAt = (root: HTMLElement, selector: string, x: number, y: number): HTMLElement | null => {
  for (const element of root.querySelectorAll<HTMLElement>(selector)) {
    if (!contains(element, x, y)) continue
    const onControl = [...element.querySelectorAll(HEADER_CONTROLS)].some((control) => contains(control, x, y))
    return onControl ? null : element
  }
  return null
}

/**
 * Locks the config controls during a premium preview: still visible, but disabled (inert, so no pointer, focus or keys) inside the
 * rainbow premium outline. A click on them opens the upgrade prompt, except on a `peekSelector` element (a section header), which is
 * handed to `onPeek` so the config can still be looked through. Its children stay mounted either way, so the lock turning on or
 * off only re-renders this frame.
 */
export const PreviewLockFrame = ({ children, peekSelector, onPeek }: PreviewLockFrameProps): React.ReactElement => {
  const locked = usePreviewLocked()
  const { requestUpgrade } = useUpgrade()
  const bodyRef = useRef<HTMLDivElement>(null)
  const [overPeek, setOverPeek] = useState(false)

  // React 18 has no `inert` prop.
  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    if (locked) body.setAttribute('inert', '')
    else body.removeAttribute('inert')
  }, [locked])

  const peekAt = useCallback((x: number, y: number): HTMLElement | null => {
    const body = bodyRef.current
    return body && peekSelector ? peekTargetAt(body, peekSelector, x, y) : null
  }, [peekSelector])

  const handleClick = useCallback((event: React.MouseEvent): void => {
    // The inert body takes no real clicks; one from inside it is a peek's own programmatic click bubbling up.
    if (bodyRef.current?.contains(event.target as Node)) return
    const target = peekAt(event.clientX, event.clientY)
    if (target && onPeek) onPeek(target)
    else requestUpgrade(PREMIUM_PREVIEW_MESSAGE)
  }, [peekAt, onPeek, requestUpgrade])

  // A pointer cursor over a header that still opens, the not-allowed one elsewhere. Only runs while a preview is on.
  const handlePointerMove = useCallback((event: React.PointerEvent): void => {
    setOverPeek(peekAt(event.clientX, event.clientY) !== null)
  }, [peekAt])

  return (
    <div
      className={`preview-lock${locked ? ' preview-lock--on premium-outline' : ''}${locked && overPeek ? ' preview-lock--peek' : ''}`}
      onClick={locked ? handleClick : undefined}
      onPointerMove={locked && peekSelector ? handlePointerMove : undefined}
    >
      {locked ? <div className='preview-lock-badge' role='status'>✦ Premium preview: controls locked</div> : null}
      <div ref={bodyRef} className='preview-lock-body'>
        {children}
      </div>
    </div>
  )
}
