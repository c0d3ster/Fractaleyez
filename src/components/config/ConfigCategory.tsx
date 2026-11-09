import React, { useCallback } from 'react'
import { useInfo } from './info/info'
import classNames from 'classnames'
import './ConfigCategory.css'

import { ConfigSectionItems, isResettableSection } from './ConfigSectionItems'
import { LayerHeader } from './LayerHeader'
import { ResetIcon } from './ResetIcon'
import { connectConfigActions, ConfigContextValue } from './context/ConfigProvider'
import { useConfigSelector } from './context/useConfigSelector'
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

const ConfigCategoryInner = React.memo(({ name, isOpen, expanded = false, toggleOpen, onChange, resetConfigSection, resetVideoClips, popup = false, bare = false, children }: ConfigCategoryProps) => {
  const info = useInfo()
  // A layer's primary section resets every section the layer owns (Orbit also restores Particle); a secondary one resets itself.
  const resetSections = useCallback((): void => {
    const layer = LAYER_KEYS.some((key) => key === name) ? CATEGORY_LAYER[name] : undefined
    const names = layer ? Object.keys(CATEGORY_LAYER).filter((key) => CATEGORY_LAYER[key] === layer) : [name]
    names.filter(isResettableSection).forEach((section) => { void resetConfigSection(section) })
  }, [name, resetConfigSection])

  const handleSectionReset = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    // In the sidebar the button lives inside the header, whose click toggles the section.
    event.stopPropagation()
    resetSections()
  }, [resetSections])

  // Video is not a plain config section: its reset restores the preset's clip list (the sidebar renders it through here).
  const hasLayerReset = isResettableSection(name) || name === 'video'

  // The layer header's own reset button (sidebar); it stops the click itself, so there is no event to take here.
  const handleLayerReset = useCallback(() => {
    if (name === 'video') {
      resetVideoClips()
      return
    }
    resetSections()
  }, [name, resetSections, resetVideoClips])

  const handleToggle = useCallback(() => {
    toggleOpen(name)
  }, [name, toggleOpen])

  const categoryContentClasses = classNames('category-content', {
    'hide-content': !isOpen
  })

  // A layer's primary section carries the layer header; secondary sections (particle) keep a plain title.
  const headerLayer = LAYER_KEYS.find((key) => key === name)
  const owner = CATEGORY_LAYER[name]
  const selectDimmed = useCallback((config: AppConfig): boolean => owner !== undefined && !config.layers.meta[owner].enabled.value, [owner])
  const dimmed = useConfigSelector(selectDimmed)


  const resetButton = isResettableSection(name) && (
    <button
      type='button'
      className={classNames('category-reset', { 'category-reset--in-header': !expanded })}
      {...info('Reset this section to the preset')}
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
            percentAbove={expanded}
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

export const ConfigCategory = connectConfigActions(ConfigCategoryInner)

