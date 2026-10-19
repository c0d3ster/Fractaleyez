import React from 'react'
import { ConfigSectionItems } from './ConfigSectionItems'
import { LogoPad } from './LogoPad'
import { LogoSpritePicker } from './LogoSpritePicker'
import { connectConfig, ConfigContextValue } from './context/ConfigProvider'

type LogoConfigBodyProps = {
  updateConfigItem: ConfigContextValue['updateConfigItem']
}

const LogoConfigBodyInner = ({ updateConfigItem }: LogoConfigBodyProps): React.ReactElement => (
  <>
    <LogoSpritePicker />
    <div className='config-checkbox-row'>
      <ConfigSectionItems name='logo' only={['threeD', 'tilt', 'zoom']} onChange={updateConfigItem} />
    </div>
    <ConfigSectionItems name='logo' only={['size', 'spinSpeed', 'shake']} onChange={updateConfigItem} />
    <LogoPad />
  </>
)

/** The Logo config's layout: the sprite picker, the 3D, Tilt and Zoom chips on one line, the sliders, then the position pad. */
export const LogoConfigBody = connectConfig(LogoConfigBodyInner)
