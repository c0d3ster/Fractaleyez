import React from 'react'
import './ColorConfigBody.css'

import { ConfigSectionItems } from './ConfigSectionItems'
import { ConfigSubAccordion } from './ConfigSubAccordion'
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

const PALETTE_ITEMS = ['paletteCycles', 'palettePhase', 'paletteReverse', 'paletteMirror'] as const

const ColorConfigBodyInner = ({ config, updateConfigItem }: ColorConfigBodyProps): React.ReactElement => {
  const { lut, phase } = resolveColorState(config.color)

  return (
    <>
      <ConfigSectionItems name='color' only={['saturation']} onChange={updateConfigItem} />
      <ConfigSubAccordion title='palette'>
        <PalettePicker />
      </ConfigSubAccordion>
      {lut ? (
        <>
          <div className='color-palette-preview' style={{ background: lutToCssGradient(lut, phase) }} title='One pass through the palette' />
          <ConfigSectionItems name='color' only={PALETTE_ITEMS} onChange={updateConfigItem} />
        </>
      ) : (
        <HueRangeRing />
      )}
    </>
  )
}

/** The Color config's layout: saturation, the palette choices, then the hue range ring (rainbow) or the palette's controls. */
export const ColorConfigBody = connectConfig(ColorConfigBodyInner)
