import React, { useState, useCallback } from 'react'
import { Row, Col } from 'react-bootstrap'

import { ConfigCategory } from '../config/ConfigCategory'
import { ConfigVideo } from '../config/ConfigVideo'
import { connectConfig } from './context/ConfigProvider'
import { AppConfig } from '../../config/configDefaults'

type ConfigAccordionProps = {
  config: AppConfig
  updateConfigItem: (category: string, item: string, value: string | boolean | number) => void
  canOpenMultiple: boolean
}

const ConfigAccordionInner = ({ config, updateConfigItem, canOpenMultiple }: ConfigAccordionProps): React.ReactElement => {
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

  const isCategoryOpen = useCallback((category: string) => openCategories.indexOf(category) !== -1, [openCategories])

  const CONFIG_CATEGORIES = ['user', 'audio', 'effects', 'orbit', 'particle', 'video']

  return (
    <>
      {Object.keys(config).filter(k => CONFIG_CATEGORIES.includes(k)).map((category) => (
        <Row key={category}>
          <Col>
            {category === 'video'
              ? <ConfigVideo isOpen={isCategoryOpen(category)} toggleOpen={toggleOpen} />
              : <ConfigCategory
                  name={category}
                  onChange={updateConfigItem}
                  isOpen={isCategoryOpen(category)}
                  toggleOpen={toggleOpen} />
            }
          </Col>
        </Row>
      ))}
    </>
  )
}

export const ConfigAccordion = connectConfig(ConfigAccordionInner)
