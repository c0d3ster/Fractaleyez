import React, { useEffect } from 'react'
import { SignInButton, useUser } from '@clerk/clerk-react'
import { PlanPage } from '../settings/PlanPage'
import './UpgradeModal.css'

type UpgradeModalProps = {
  reason: string
  onClose: () => void
}

/** The Plan tab's content in a dialog, so a lock leads straight to Checkout. A guest is asked to sign in first. */
export const UpgradeModal = ({ reason, onClose }: UpgradeModalProps): React.ReactElement => {
  const { isSignedIn } = useUser()

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return (): void => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className='upgrade-overlay' onClick={onClose}>
      <div className='upgrade-card' role='dialog' aria-modal='true' aria-labelledby='upgrade-title' onClick={(e) => e.stopPropagation()}>
        <button type='button' className='upgrade-close' aria-label='Close' onClick={onClose}>×</button>
        <h2 id='upgrade-title' className='upgrade-title'>{isSignedIn ? 'Upgrade your plan' : 'Sign in to keep going'}</h2>
        {reason ? <p className='upgrade-reason'>{reason}</p> : null}
        {isSignedIn ? (
          <PlanPage />
        ) : (
          <div className='upgrade-signin'>
            <p className='upgrade-reason'>Saving, uploads and packs need a free Dream account. Paid plans add more.</p>
            <SignInButton mode='modal'>
              <button type='button' className='upgrade-signin-btn' onClick={onClose}>Sign in</button>
            </SignInButton>
          </div>
        )}
      </div>
    </div>
  )
}
