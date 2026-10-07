import React from 'react'
import './ColorConfigBody.css'

import { ConfigSectionItems } from './ConfigSectionItems'
import { HueRangeRing } from './HueRangeRing'
import { PalettePicker } from './PalettePicker'
import { connectConfig, ConfigContextValue } from './context/ConfigProvider'
import { AppConfig } from '../../config/configDefaults'
import { resolveColorState } from '../../config/colorState'
import { lutToCssGradient } from '../../config/paletteLut'

type ColorConfigBodyProps = {
  config: AppConfig
  updateConfigItem: ConfigContextValue['updateConfigItem']
}

const ColorConfigBodyInner = ({ config, updateConfigItem }: ColorConfigBodyProps): React.ReactElement => {
  const { lut, phase, cycles } = resolveColorState(config.color)

  return (
    <>
      <PalettePicker />
      {lut ? (
        <>
          <div className='color-palette-preview' style={{ background: lutToCssGradient(lut, phase, cycles) }} title='The palette as the fractal runs through it' />
          <div className='color-palette-toggles'>
            <ConfigSectionItems name='color' only={['paletteReverse', 'paletteMirror']} onChange={updateConfigItem} />
          </div>
          <ConfigSectionItems name='color' only={['paletteCycles', 'palettePhase']} onChange={updateConfigItem} />
        </>
      ) : (
        <HueRangeRing />
      )}
      <ConfigSectionItems name='color' only={['saturation']} onChange={updateConfigItem} />
    </>
  )
}

/** The Color config's layout: the palette choice, what shapes it (hue range ring for the rainbow, otherwise a preview and its controls), then saturation. */
export const ColorConfigBody = connectConfig(ColorConfigBodyInner)
