import React, { useCallback } from 'react'
import classNames from 'classnames'
import './ConfigCategory.css'

import { ConfigSectionItems, isResettableSection } from './ConfigSectionItems'
import { LayerHeader } from './LayerHeader'
import { ResetIcon } from './ResetIcon'
import { connectConfig, ConfigContextValue } from './context/ConfigProvider'
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
  // The pop-out config window: the reset icon sits above the header there, and inside it in the sidebar.
  expanded?: boolean
  toggleOpen: (name: string) => void
  onChange: (category: string, item: string, value: string | boolean) => void
  resetConfigSection: ConfigContextValue['resetConfigSection']
  resetVideoClips: ConfigContextValue['resetVideoClips']
  /** Popup column: always open. */
  popup?: boolean
  /** Skip the section's own rows; the children supply the whole body. */
  bare?: boolean
  children?: React.ReactNode
}

const ConfigCategoryInner = React.memo(({ name, config, isOpen, expanded = false, toggleOpen, onChange, resetConfigSection, resetVideoClips, popup = false, bare = false, children }: ConfigCategoryProps) => {
  const handleSectionReset = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    // In the sidebar the button lives inside the header, whose click toggles the section.
    event.stopPropagation()
    if (isResettableSection(name)) void resetConfigSection(name)
  }, [name, resetConfigSection])

  // Video is not a plain config section: its reset restores the preset's clip list (the sidebar renders it through here).
  const hasLayerReset = isResettableSection(name) || name === 'video'

  // The layer header's own reset button (sidebar); it stops the click itself, so there is no event to take here.
  const handleLayerReset = useCallback(() => {
    if (name === 'video') {
      resetVideoClips()
      return
    }
    if (isResettableSection(name)) void resetConfigSection(name)
  }, [name, resetConfigSection, resetVideoClips])

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


  const resetButton = isResettableSection(name) && (
    <button
      type='button'
      className={classNames('category-reset', { 'category-reset--in-header': !expanded })}
      title='Reset this section to the preset'
      aria-label={`Reset ${name} config`}
      onClick={handleSectionReset}
    >
      <ResetIcon />
    </button>
  )

  return (
    <div className={classNames('category-container', { 'category-container--effects': name === 'effects', 'category-container--video': name === 'video', 'config-inactive': dimmed })}>
      {headerLayer
        ? (
          <LayerHeader
            layerKey={headerLayer}
            title={name}
            collapsible={!popup}
            onToggleOpen={handleToggle}
            onReset={!expanded && hasLayerReset ? handleLayerReset : undefined}
          />
        )
        : (
          <h3 className='category-title' onClick={handleToggle}>
            {name} config
            {!expanded && resetButton}
          </h3>
        )}
      {expanded && resetButton}
      <div className={categoryContentClasses}>
        {!bare && <ConfigSectionItems name={name} onChange={onChange} />}
        {children}
      </div>
    </div>
  )
})

export const ConfigCategory = connectConfig(ConfigCategoryInner)

