import React, { useEffect, useRef } from 'react'
import { usePreviewLocked } from './previewLock'
import { useUpgrade } from '../upgrade/UpgradeProvider'
import { PREMIUM_PREVIEW_MESSAGE } from '../../config/plans.config'
import '../upgrade/premiumOutline.css'
import './PreviewLockFrame.css'

/**
 * Locks the config controls during a premium preview: still visible, but disabled (inert, so no pointer, focus or keys) inside the
 * rainbow premium outline. A click anywhere on them opens the upgrade prompt. Its children stay mounted either way, so the lock
 * turning on or off only re-renders this frame.
 */
export const PreviewLockFrame = ({ children }: { children: React.ReactNode }): React.ReactElement => {
  const locked = usePreviewLocked()
  const { requestUpgrade } = useUpgrade()
  const bodyRef = useRef<HTMLDivElement>(null)

  // React 18 has no `inert` prop.
  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    if (locked) body.setAttribute('inert', '')
    else body.removeAttribute('inert')
  }, [locked])

  return (
    <div
      className={`preview-lock${locked ? ' preview-lock--on premium-outline' : ''}`}
      onClick={locked ? () => requestUpgrade(PREMIUM_PREVIEW_MESSAGE) : undefined}
    >
      {locked ? <div className='preview-lock-badge' role='status'>✦ Premium preview: controls locked</div> : null}
      <div ref={bodyRef} className='preview-lock-body'>
        {children}
      </div>
    </div>
  )
}
