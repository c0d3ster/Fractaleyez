import React from 'react'
import './PremiumTrialModal.css'

type PremiumTrialModalProps = {
  packName: string
  onDismiss: () => void
}

export const PremiumTrialModal = ({ packName, onDismiss }: PremiumTrialModalProps): React.ReactElement => (
  <div className='premium-trial-overlay'>
    <div className='premium-trial-card'>
      <div className='premium-trial-badge'>✦ Premium</div>
      <h2 className='premium-trial-title'>You're previewing {packName}</h2>
      <p className='premium-trial-body'>
        Subscribe to unlock this pack and all future premium packs.
      </p>
      <div className='premium-trial-actions'>
        <button className='premium-trial-subscribe'>Subscribe</button>
        <button className='premium-trial-dismiss' onClick={onDismiss}>Maybe Later</button>
      </div>
    </div>
  </div>
)
