import React, { useState, useCallback } from 'react'
import { Row, Col } from 'react-bootstrap'

import { ConfigCategory } from '../config/ConfigCategory'
import { ConfigSectionItems } from './ConfigSectionItems'
import { ConfigSubAccordion } from './ConfigSubAccordion'
import { ConfigVideoBody } from './ConfigVideoBody'
import { LogoSpritePicker } from './LogoSpritePicker'
import { ShapePad } from './ShapePad'
import { ParticleSpriteHud } from '../huds'
import { connectConfig } from './context/ConfigProvider'
import { DISPLAY_ORDER, DisplayKey } from '../../config/layers'

type ConfigAccordionProps = {
  updateConfigItem: (category: string, item: string, value: string | boolean | number) => void
  canOpenMultiple: boolean
}

type EntryProps = {
  entry: DisplayKey
  onChange: ConfigAccordionProps['updateConfigItem']
  isOpen: boolean
  toggleOpen: (id: string) => void
}

// Non-functional placeholder until the shared Color config lands.
const ColorPreview = (): React.ReactElement => (
  <div className='category-container'>
    <h3 className='category-title'>color config</h3>
  </div>
)

const Entry = ({ entry, onChange, isOpen, toggleOpen }: EntryProps): React.ReactElement | null => {
  const shared = { name: entry, onChange, isOpen, toggleOpen }
  switch (entry) {
  case 'color':
    return <ColorPreview />
  case 'video':
    return <ConfigCategory {...shared} bare><ConfigVideoBody /></ConfigCategory>
  case 'fractal':
    return <ConfigCategory {...shared}><ShapePad /></ConfigCategory>
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
    return <ConfigCategory {...shared} bare><LogoSpritePicker /><ConfigSectionItems name='logo' onChange={onChange} /></ConfigCategory>
  default:
    return <ConfigCategory {...shared} />
  }
}

const ConfigAccordionInner = ({ updateConfigItem, canOpenMultiple }: ConfigAccordionProps): React.ReactElement => {
  const [openCategories, setOpenCategories] = useState(['user'])

  const toggleOpen = useCallback((id: string) => {
    setOpenCategories((prev) => {
      const index = prev.indexOf(id)
      if (canOpenMultiple && index === -1) {
        return [...prev, id]
      } else if (index === -1) {
        return [id]
      } else {
        return prev.filter((c) => c !== id)
      }
    })
  }, [canOpenMultiple])

  return (
    <>
      {DISPLAY_ORDER.map((entry) => (
        <Row key={entry}>
          <Col>
            <Entry entry={entry} onChange={updateConfigItem} isOpen={openCategories.includes(entry)} toggleOpen={toggleOpen} />
          </Col>
        </Row>
      ))}
    </>
  )
}

export const ConfigAccordion = connectConfig(ConfigAccordionInner)
