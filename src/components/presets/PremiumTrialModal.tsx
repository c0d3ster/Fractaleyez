import React from 'react'
import './PremiumTrialModal.css'

type PremiumTrialModalProps = {
  packName: string
  onDismiss: () => void
  /** Opens the upgrade prompt (Lucid and up include every built-in premium pack). */
  onSubscribe: () => void
}

export const PremiumTrialModal = ({ packName, onDismiss, onSubscribe }: PremiumTrialModalProps): React.ReactElement => (
  <div className='premium-trial-overlay'>
    <div className='premium-trial-card'>
      <div className='premium-trial-badge'>✦ Premium</div>
      <h2 className='premium-trial-title'>You're previewing {packName}</h2>
      <p className='premium-trial-body'>
        Go Lucid or Third Eye to unlock this pack and every built-in premium pack, including future ones.
      </p>
      <div className='premium-trial-actions'>
        <button className='premium-trial-subscribe' onClick={onSubscribe}>Subscribe</button>
        <button className='premium-trial-dismiss' onClick={onDismiss}>Maybe Later</button>
      </div>
    </div>
  </div>
)
