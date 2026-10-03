import React, { useCallback } from 'react'
import classNames from 'classnames'
import './ConfigCategory.css'

import { ConfigSectionItems } from './ConfigSectionItems'
import { LayerHeader } from './LayerHeader'
import { connectConfig } from './context/ConfigProvider'
import { AppConfig, LayerKey } from '../../config/configDefaults'
import { LAYER_REGISTRY } from '../../config/layers'

// Categories that only matter while one layer is enabled; they grey out otherwise.
const CATEGORY_LAYER: Partial<Record<string, LayerKey>> = {
  video: 'video',
  fractal: 'fractal',
  particle: 'orbit',
  orbit: 'orbit',
  logo: 'logo',
}

const LAYER_KEYS = Object.values(LAYER_REGISTRY).map(({ key }) => key)

type ConfigCategoryProps = {
  name: string
  config: AppConfig
  isOpen: boolean
  toggleOpen: (name: string) => void
  onChange: (category: string, item: string, value: string | boolean) => void
  /** Popup column: always open, no chevron on a layer header. */
  popup?: boolean
  /** Skip the section's own rows; the children supply the whole body. */
  bare?: boolean
  children?: React.ReactNode
}

const ConfigCategoryInner = React.memo(({ name, config, isOpen, toggleOpen, onChange, popup = false, bare = false, children }: ConfigCategoryProps) => {
  const handleToggle = useCallback(() => {
    toggleOpen(name)
  }, [name, toggleOpen])

  const categoryContentClasses = classNames('category-content', {
    'hide-content': !isOpen
  })

  // A layer's primary section carries the layer header; secondary sections (particle) keep a plain title.
  const headerLayer = LAYER_KEYS.find((key) => key === name)
  const owner = CATEGORY_LAYER[name]
  const dimmed = owner !== undefined && !config.layers.meta[owner].enabled.value

  return (
    <div className={classNames('category-container', { 'category-container--effects': name === 'effects', 'category-container--video': name === 'video', 'config-inactive': dimmed })}>
      {headerLayer
        ? <LayerHeader layerKey={headerLayer} title={name} collapsible={!popup} isOpen={isOpen} onToggleOpen={handleToggle} />
        : <h3 className='category-title' onClick={handleToggle}>{name} config</h3>}
      <div className={categoryContentClasses}>
        {!bare && <ConfigSectionItems name={name} config={config} onChange={onChange} />}
        {children}
      </div>
    </div>
  )
})

export const ConfigCategory = connectConfig(ConfigCategoryInner)
