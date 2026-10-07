import React from 'react'
import './ColorConfigBody.css'

import { ConfigSectionItems } from './ConfigSectionItems'
import { PaletteRange } from './PaletteRange'
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
  const { lut, phase, cycles, saturation } = resolveColorState(config.color)

  return (
    <>
      <PalettePicker />
      <PaletteRange />
      <div className='color-palette-preview' style={{ background: lutToCssGradient(lut, phase, cycles, saturation) }} title='The palette as the fractal runs through it' />
      <ConfigSectionItems name='color' only={['paletteCycles', 'palettePhase']} onChange={updateConfigItem} />
      <ConfigSectionItems name='color' only={['saturation']} onChange={updateConfigItem} />
      <ConfigSectionItems name='color' only={['paletteReverse', 'paletteMirror']} onChange={updateConfigItem} />
    </>
  )
}

/** The Color config's layout: the palette choice, the range handles that crop it, a preview, the sliders that shape it, then the Reverse and Mirror buttons. */
export const ColorConfigBody = connectConfig(ColorConfigBodyInner)
