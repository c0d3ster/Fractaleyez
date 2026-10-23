import React from 'react'
import { CameraTouchpad } from './CameraTouchpad'
import { ConfigSectionItems } from './ConfigSectionItems'
import { connectConfig, ConfigContextValue } from './context/ConfigProvider'

type UserConfigBodyProps = {
  updateConfigItem: ConfigContextValue['updateConfigItem']
}

const UserConfigBodyInner = ({ updateConfigItem }: UserConfigBodyProps): React.ReactElement => (
  <>
    <ConfigSectionItems name='user' only={['speed', 'rotationSpeed', 'scaleFactor', 'cameraBound']} onChange={updateConfigItem} />
    <CameraTouchpad />
    <ConfigSectionItems name='user' only={['reverseLean']} onChange={updateConfigItem} />
  </>
)

/** The User config's layout: the sliders, the camera pad, then the switch that reverses Orbit and the logo against the fractal. */
export const UserConfigBody = connectConfig(UserConfigBodyInner)
