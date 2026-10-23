import React from 'react'
import { CameraTouchpad } from './CameraTouchpad'
import { ConfigSectionItems } from './ConfigSectionItems'
import { connectConfig, ConfigContextValue } from './context/ConfigProvider'

// Same fade as the camera pad when there is no Sway to move through.
const INACTIVE_OPACITY = 0.25

type UserConfigBodyProps = {
  config: ConfigContextValue['config']
  updateConfigItem: ConfigContextValue['updateConfigItem']
}

const UserConfigBodyInner = ({ config, updateConfigItem }: UserConfigBodyProps): React.ReactElement => (
  <>
    <ConfigSectionItems name='user' only={['speed', 'rotationSpeed', 'scaleFactor', 'sway']} onChange={updateConfigItem} />
    <CameraTouchpad />
    <div style={{ opacity: config.user.sway.value === 0 ? INACTIVE_OPACITY : 1, transition: 'opacity 0.2s ease' }}>
      <ConfigSectionItems name='user' only={['reverseLean']} onChange={updateConfigItem} />
    </div>
  </>
)

/** The User config's layout: the sliders, the camera pad, then the switch that reverses Orbit and the logo against the fractal (faded while Sway is 0). */
export const UserConfigBody = connectConfig(UserConfigBodyInner)
