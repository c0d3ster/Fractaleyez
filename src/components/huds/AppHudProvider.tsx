import React from 'react'
import { HudProvider } from 'beatsense-ui'

import { useInfo } from '../config/info/info'
import { subscribeUiTick } from '../../utils/uiTicker'
import { appAnalysisSource } from './analysisSource'

type AppHudProviderProps = { children: React.ReactNode }

/**
 * The context the beatsense-ui HUDs read in the app: the analysis on the main window, the shared UI tick (its rate follows the quality
 * tier, and it skips a HUD scrolled out of view), and the info strip for their descriptions. It goes inside InfoProvider.
 */
export const AppHudProvider = ({ children }: AppHudProviderProps): React.ReactElement => {
  const info = useInfo()
  return (
    <HudProvider source={appAnalysisSource} ticker={subscribeUiTick} hint={info}>
      {children}
    </HudProvider>
  )
}
