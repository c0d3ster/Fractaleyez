import React from 'react'
import { useInfo } from './info/info'

import { toStoredConfig } from '../../config/storedConfig'

/** Logs the current config as slim preset JSON (what a saved preset stores) and copies it to the clipboard. */
export const LogConfigButton = (): React.ReactElement => {
  const info = useInfo()

  // The live config is read when the button is pressed, so the button does not re-render as the config changes.
  const logConfig = (): void => {
    const json = JSON.stringify(toStoredConfig(window.config, window.getVirtualCameraPosition?.()))
    console.info(json)
    navigator.clipboard?.writeText(json).catch(() => undefined)
  }

  return (
    <button
      className='save-preset-btn'
      {...info('Log the current config (slim preset JSON) to the console and copy it')}
      onClick={logConfig}
    >
      Log Config
    </button>
  )
}
