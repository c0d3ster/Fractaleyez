import React from 'react'

import { AccountBadge } from './AccountBadge'
import { AccountSheet } from './AccountSheet'
import { BottomBar } from './BottomBar'
import { GestureReadout } from './GestureReadout'
import { LongPressRing } from './LongPressRing'
import { MenuSheet } from './MenuSheet'
import { useShellChrome } from './useShellChrome'
import './MobileShell.css'

/** The phone UI over the visual, in place of the desktop sidebar and top bar: the account badge, the bottom bar, the gesture readout, the long-press ring, the menu sheet and the account sheet. */
export const MobileShell = (): React.ReactElement => {
  const { bar, badge } = useShellChrome()
  return (
    <div className='mobile-shell-ui'>
      {badge !== 'off' && <AccountBadge state={badge} />}
      {bar !== 'off' && <BottomBar state={bar} />}
      <GestureReadout />
      <LongPressRing />
      <MenuSheet />
      <AccountSheet />
    </div>
  )
}
