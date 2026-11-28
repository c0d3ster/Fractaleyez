import React from 'react'

import { ConfigCategory } from '../config/ConfigCategory'
import { ConfigSectionItems } from './ConfigSectionItems'
import { ConfigSubAccordion } from './ConfigSubAccordion'
import { ConfigVideoBody } from './ConfigVideoBody'
import { ColorConfigBody } from './ColorConfigBody'
import { LogoConfigBody } from './LogoConfigBody'
import { FractalTypePicker } from './FractalTypePicker'
import { ShapePad } from './ShapePad'
import { AutoSwitch } from './AutoSwitch'
import { ParticleSpriteHud } from '../huds'
import { connectConfigActions } from './context/ConfigProvider'
import { DISPLAY_ORDER, DisplayKey } from '../../config/layers'
import type { OpenCategories } from './useOpenCategories'

type ConfigAccordionProps = OpenCategories & {
  updateConfigItem: (category: string, item: string, value: string | boolean | number) => void
}

type EntryProps = {
  entry: DisplayKey
  onChange: ConfigAccordionProps['updateConfigItem']
  isOpen: boolean
  toggleOpen: (id: string) => void
}

const Entry = ({ entry, onChange, isOpen, toggleOpen }: EntryProps): React.ReactElement | null => {
  const shared = { name: entry, onChange, isOpen, toggleOpen }
  switch (entry) {
  case 'color':
    return <ConfigCategory {...shared} bare><ColorConfigBody /></ConfigCategory>
  case 'video':
    return <ConfigCategory {...shared} bare><ConfigVideoBody /></ConfigCategory>
  case 'fractal':
    return <ConfigCategory {...shared}><FractalTypePicker /><ShapePad /></ConfigCategory>
  case 'orbit':
    return (
      <ConfigCategory {...shared} bare>
        <ConfigSubAccordion title='orbit config'>
          <ConfigSectionItems name='orbit' onChange={onChange} />
        </ConfigSubAccordion>
        <ConfigSubAccordion title='particle config'>
          <ConfigSectionItems name='particle' onChange={onChange} />
          <ParticleSpriteHud />
        </ConfigSubAccordion>
      </ConfigCategory>
    )
  case 'logo':
    return <ConfigCategory {...shared} bare><LogoConfigBody /></ConfigCategory>
  default:
    return <ConfigCategory {...shared} />
  }
}

const ConfigAccordionInner = ({ updateConfigItem, openCategories, toggleOpen }: ConfigAccordionProps): React.ReactElement => {
  return (
    <>
      {DISPLAY_ORDER.map((entry) => (
        <div key={entry} className='flow-root' data-config-entry={entry}>
          <div>
            <Entry entry={entry} onChange={updateConfigItem} isOpen={openCategories.includes(entry)} toggleOpen={toggleOpen} />
          </div>
          {entry === 'effects' && <AutoSwitch />}
        </div>
      ))}
    </>
  )
}

export const ConfigAccordion = connectConfigActions(ConfigAccordionInner)
