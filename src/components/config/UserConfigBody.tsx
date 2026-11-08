import React from 'react'
import { CameraTouchpad } from './CameraTouchpad'
import { ConfigSectionItems } from './ConfigSectionItems'
import { connectConfigActions, ConfigContextValue } from './context/ConfigProvider'
import { useConfigSelector } from './context/useConfigSelector'
import { AppConfig } from '../../config/configDefaults'

// Same fade as the camera pad when there is no Sway to move through.
const INACTIVE_OPACITY = 0.25

type UserConfigBodyProps = {
  updateConfigItem: ConfigContextValue['updateConfigItem']
}

const swayIsOff = (config: AppConfig): boolean => config.user.sway.value === 0

const UserConfigBodyInner = ({ updateConfigItem }: UserConfigBodyProps): React.ReactElement => {
  const noSway = useConfigSelector(swayIsOff)
  return (
    <>
      <ConfigSectionItems name='user' only={['speed', 'rotationSpeed', 'scaleFactor', 'sway']} onChange={updateConfigItem} />
      <CameraTouchpad />
      <div style={{ opacity: noSway ? INACTIVE_OPACITY : 1, transition: 'opacity 0.2s ease' }}>
        <ConfigSectionItems name='user' only={['reverseLean']} onChange={updateConfigItem} />
      </div>
    </>
  )
}

/** The User config's layout: the sliders, the camera pad, then the switch that reverses Orbit and the logo against the fractal (faded while Sway is 0). */
export const UserConfigBody = connectConfigActions(UserConfigBodyInner)
