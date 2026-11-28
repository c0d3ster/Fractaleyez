import React from 'react'
import { useUser } from '@clerk/clerk-react'

import { PersonIcon } from './EffectIcons'
import { openAccount } from './menuBus'
import type { BadgeState } from './shellChrome'

/** Top-right: the Clerk avatar signed in, a person outline signed out. A tap opens the account sheet. */
export const AccountBadge = ({ state }: { state: BadgeState }): React.ReactElement => {
  const { isSignedIn, user } = useUser()
  const avatar = isSignedIn ? user?.imageUrl : undefined
  return (
    <button
      type='button'
      className={`mobile-badge${avatar ? ' mobile-badge--avatar' : ''}`}
      data-mobile-badge={state}
      data-signed-in={isSignedIn ? 'yes' : 'no'}
      aria-label='Account'
      aria-hidden={state === 'faded'}
      onClick={() => openAccount()}
    >
      {avatar ? <img src={avatar} alt='' draggable={false} /> : <PersonIcon />}
    </button>
  )
}
