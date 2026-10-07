import React from 'react'
import { ConfigSectionItems } from './ConfigSectionItems'
import { PaletteRange } from './PaletteRange'
import { PalettePicker } from './PalettePicker'
import { connectConfig, ConfigContextValue } from './context/ConfigProvider'

type ColorConfigBodyProps = {
  updateConfigItem: ConfigContextValue['updateConfigItem']
}

const ColorConfigBodyInner = ({ updateConfigItem }: ColorConfigBodyProps): React.ReactElement => {
  return (
    <>
      <PalettePicker />
      <PaletteRange />
      <ConfigSectionItems name='color' only={['paletteCycles', 'palettePhase']} onChange={updateConfigItem} />
      <ConfigSectionItems name='color' only={['saturation']} onChange={updateConfigItem} />
      <ConfigSectionItems name='color' only={['paletteReverse', 'paletteMirror']} onChange={updateConfigItem} />
    </>
  )
}

/** The Color config's layout: the palette choice, the range slider that crops it, the sliders that shape it, then the Reverse and Mirror buttons. */
export const ColorConfigBody = connectConfig(ColorConfigBodyInner)
