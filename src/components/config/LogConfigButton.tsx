import React, { useContext } from 'react'

import { toStoredConfig } from '../../config/storedConfig'
import { ConfigContext } from './context/ConfigProvider'

/** Logs the current config as slim preset JSON (what presets.ts stores) and copies it to the clipboard. */
export const LogConfigButton = (): React.ReactElement | null => {
  const context = useContext(ConfigContext)
  if (!context) return null
  const { config } = context

  const logConfig = (): void => {
    const json = JSON.stringify(toStoredConfig(config))
    console.info(json)
    navigator.clipboard?.writeText(json).catch(() => undefined)
  }

  return (
    <button
      className='save-preset-btn'
      title='Log the current config (slim preset JSON) to the console and copy it'
      onClick={logConfig}
    >
      Log Config
    </button>
  )
}
